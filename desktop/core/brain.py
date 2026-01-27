"""Brain module using Claude Haiku 4.5 for intelligent responses."""

import logging
import os
from dataclasses import dataclass
from datetime import datetime
from typing import List, Optional

from anthropic import Anthropic

logger = logging.getLogger(__name__)


@dataclass
class BrainConfig:
    """Brain configuration."""
    model: str = "claude-haiku-4-5-20251001"
    max_tokens: int = 150
    temperature: float = 0.7
    api_key: Optional[str] = None

    def __post_init__(self):
        if self.api_key is None:
            self.api_key = os.environ.get("ANTHROPIC_API_KEY")


JIM_SYSTEM_PROMPT = """You are Jim, an ambient AI assistant - think JARVIS but friendlier and more approachable.

Your style:
- Keep responses SHORT (1-3 sentences max) - you're speaking out loud, not writing
- Natural, conversational tone - like a helpful friend
- Be concise but warm - don't be robotic
- Light humor when appropriate, but don't force it
- Remember context from the conversation

You're always listening in the background but only speak when needed. The user might be:
- Working and needs quick help or information
- Thinking through a problem out loud
- Asking for facts, time, weather, etc.
- Just chatting casually

Important:
- Never start with "I" if you can avoid it
- Don't say "Great question!" or similar filler
- Don't explain what you're about to do, just do it
- If asked for time, just give the time naturally
- Keep it punchy and useful

Current time: {current_time}"""


@dataclass
class Message:
    """A conversation message."""
    role: str  # "user" or "assistant"
    content: str


class JimBrain:
    """Claude Haiku 4.5 powered response generation."""

    def __init__(self, config: Optional[BrainConfig] = None):
        self.config = config or BrainConfig()

        if not self.config.api_key:
            raise ValueError(
                "ANTHROPIC_API_KEY not set. "
                "Set it in config or ANTHROPIC_API_KEY environment variable."
            )

        self.client = Anthropic(api_key=self.config.api_key)
        logger.info(f"JimBrain initialized with model: {self.config.model}")

    def _get_system_prompt(self) -> str:
        """Get system prompt with current time."""
        current_time = datetime.now().strftime("%I:%M %p on %A, %B %d")
        return JIM_SYSTEM_PROMPT.format(current_time=current_time)

    def _format_context(self, context: Optional[str]) -> str:
        """Format context for system prompt."""
        if not context:
            return ""
        return f"\n\nRecent conversation context:\n{context}"

    def respond(
        self,
        user_input: str,
        context: Optional[str] = None,
        conversation_history: Optional[List[Message]] = None
    ) -> str:
        """
        Generate a response to user input.

        Args:
            user_input: What the user said
            context: Optional context string
            conversation_history: Optional list of previous messages

        Returns:
            Response text
        """
        try:
            system_prompt = self._get_system_prompt()
            if context:
                system_prompt += self._format_context(context)

            # Build messages
            messages = []

            # Add conversation history if provided
            if conversation_history:
                for msg in conversation_history[-6:]:  # Last 3 exchanges
                    messages.append({
                        "role": msg.role,
                        "content": msg.content
                    })

            # Add current user input
            messages.append({
                "role": "user",
                "content": user_input
            })

            # Call Claude
            response = self.client.messages.create(
                model=self.config.model,
                max_tokens=self.config.max_tokens,
                temperature=self.config.temperature,
                system=system_prompt,
                messages=messages
            )

            response_text = response.content[0].text.strip()
            logger.info(f"Generated response: '{response_text[:100]}...'")
            return response_text

        except Exception as e:
            logger.error(f"Brain error: {e}")
            return "Sorry, I had a hiccup there. Could you say that again?"

    async def respond_async(
        self,
        user_input: str,
        context: Optional[str] = None,
        conversation_history: Optional[List[Message]] = None
    ) -> str:
        """Async version of respond."""
        import asyncio
        return await asyncio.get_event_loop().run_in_executor(
            None, self.respond, user_input, context, conversation_history
        )
