"""Triage engine using local LLM (Ollama) for decision making."""

import logging
from dataclasses import dataclass
from enum import Enum
from typing import List, Optional

import ollama

logger = logging.getLogger(__name__)


class TriageDecision(Enum):
    """Possible triage decisions."""
    RESPOND = "respond"      # Call Claude, speak response
    ACKNOWLEDGE = "ack"      # Quick local response ("Got it", "Noted")
    IGNORE = "ignore"        # Discard, not relevant
    QUEUE = "queue"          # Save for later, interesting but not urgent


@dataclass
class TriageConfig:
    """Triage engine configuration."""
    model: str = "llama3:8b"
    fallback_model: str = "mistral:7b"
    temperature: float = 0.1
    timeout_seconds: int = 5
    force_respond_keywords: List[str] = None

    def __post_init__(self):
        if self.force_respond_keywords is None:
            self.force_respond_keywords = ["jim", "hey jim", "okay jim"]


TRIAGE_SYSTEM_PROMPT = """You are a triage system for an AI assistant named Jim. Your job is to analyze speech transcripts and decide how to respond.

You must output ONLY one word - your decision. No explanation, no punctuation, just the word.

RESPOND if:
- The wake word "Jim" was clearly used
- A direct question is being asked
- User seems stuck, frustrated, or needs help
- Important or urgent information is being shared
- User is clearly talking TO the assistant (not to someone else)

ACKNOWLEDGE if:
- User made a statement that should be noted but doesn't need a full response
- Simple confirmation is appropriate ("Got it", "Noted", "Okay")
- User just completed a task and mentioned it

IGNORE if:
- Background conversation (user talking to other people)
- Music, TV, podcast, or other media playing
- User is thinking out loud and not expecting a response
- Speech is incomplete, unclear, or just noise
- User is on a phone call with someone else

QUEUE if:
- Information that might be useful later but not urgent now
- User mentioned something to remember
- Could be good context for future conversations

Output ONLY: RESPOND, ACKNOWLEDGE, IGNORE, or QUEUE"""


class TriageEngine:
    """Local LLM-based triage decision engine."""

    def __init__(self, config: Optional[TriageConfig] = None):
        self.config = config or TriageConfig()
        self._verify_model()

    def _verify_model(self):
        """Verify that the configured model is available."""
        try:
            models = ollama.list()
            available = [m['name'] for m in models.get('models', [])]

            if not any(self.config.model in m for m in available):
                logger.warning(
                    f"Model {self.config.model} not found. "
                    f"Available: {available}. Trying fallback..."
                )
                if not any(self.config.fallback_model in m for m in available):
                    logger.error(
                        f"Neither {self.config.model} nor {self.config.fallback_model} available"
                    )
                else:
                    self.config.model = self.config.fallback_model
            else:
                logger.info(f"Triage engine using model: {self.config.model}")

        except Exception as e:
            logger.error(f"Failed to verify Ollama models: {e}")

    def _check_force_respond(self, transcript: str) -> bool:
        """Check if transcript contains keywords that force a response."""
        transcript_lower = transcript.lower()
        for keyword in self.config.force_respond_keywords:
            if keyword.lower() in transcript_lower:
                logger.debug(f"Force respond keyword found: {keyword}")
                return True
        return False

    def decide(
        self,
        transcript: str,
        context: Optional[str] = None,
        has_wake_word: bool = False
    ) -> TriageDecision:
        """
        Decide how to handle a transcript.

        Args:
            transcript: The transcribed speech
            context: Optional conversation context
            has_wake_word: Whether wake word was detected in audio

        Returns:
            TriageDecision indicating how to handle the transcript
        """
        # Quick check for empty/noise
        if not transcript or len(transcript.strip()) < 3:
            logger.debug("Transcript too short, ignoring")
            return TriageDecision.IGNORE

        # Force respond if wake word detected
        if has_wake_word or self._check_force_respond(transcript):
            logger.info(f"Force RESPOND due to wake word: '{transcript[:50]}...'")
            return TriageDecision.RESPOND

        # Build prompt for LLM
        user_prompt = f"Transcript: \"{transcript}\""
        if context:
            user_prompt = f"Recent context:\n{context}\n\n{user_prompt}"

        try:
            response = ollama.chat(
                model=self.config.model,
                messages=[
                    {"role": "system", "content": TRIAGE_SYSTEM_PROMPT},
                    {"role": "user", "content": user_prompt}
                ],
                options={
                    "temperature": self.config.temperature,
                    "num_predict": 10  # We only need one word
                }
            )

            decision_text = response['message']['content'].strip().upper()

            # Parse decision
            if "RESPOND" in decision_text:
                decision = TriageDecision.RESPOND
            elif "ACKNOWLEDGE" in decision_text or "ACK" in decision_text:
                decision = TriageDecision.ACKNOWLEDGE
            elif "QUEUE" in decision_text:
                decision = TriageDecision.QUEUE
            else:
                decision = TriageDecision.IGNORE

            logger.info(f"Triage decision: {decision.value} for '{transcript[:50]}...'")
            return decision

        except Exception as e:
            logger.error(f"Triage LLM error: {e}")
            # Fallback: respond to questions, ignore statements
            if "?" in transcript:
                return TriageDecision.RESPOND
            return TriageDecision.IGNORE

    async def decide_async(
        self,
        transcript: str,
        context: Optional[str] = None,
        has_wake_word: bool = False
    ) -> TriageDecision:
        """Async version of decide (uses sync internally for now)."""
        import asyncio
        return await asyncio.get_event_loop().run_in_executor(
            None, self.decide, transcript, context, has_wake_word
        )
