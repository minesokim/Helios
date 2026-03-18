#!/usr/bin/env python3
"""
Project Helios Desktop - Ambient Intelligence Assistant

A standalone desktop app with ambient listening, wake word detection,
local transcription, and intelligent responses via Claude.
"""

import asyncio
import logging
import os
import re
import signal
import sys
from pathlib import Path

import yaml
from dotenv import load_dotenv

# Add project root to path
PROJECT_ROOT = Path(__file__).parent
sys.path.insert(0, str(PROJECT_ROOT))

from core.listener import AudioListener, AudioConfig, VADConfig
from core.transcriber import Transcriber, TranscriberConfig
from core.triage import TriageEngine, TriageConfig, TriageDecision
from core.brain import JimBrain, BrainConfig
from core.speaker import Speaker, SpeakerConfig, ElevenLabsConfig, Pyttsx3Config, get_acknowledgment
from core.screen_watcher import ScreenWatcher, ScreenWatcherConfig
from context.memory import ConversationMemory, ContextManager, MemoryConfig
from memory.manager import MemoryManager


def setup_logging(config: dict):
    """Set up logging from config."""
    log_config = config.get("logging", {})
    level = getattr(logging, log_config.get("level", "INFO").upper())

    log_file = log_config.get("file", "logs/jim.log")
    Path(log_file).parent.mkdir(parents=True, exist_ok=True)

    handlers = [logging.FileHandler(log_file)]
    if log_config.get("console", True):
        handlers.append(logging.StreamHandler())

    logging.basicConfig(
        level=level,
        format=log_config.get("format", "%(asctime)s - %(name)s - %(levelname)s - %(message)s"),
        handlers=handlers
    )

    return logging.getLogger(__name__)


def load_config(config_path: str = "config/config.yaml") -> dict:
    """Load configuration from YAML file."""
    path = PROJECT_ROOT / config_path
    if not path.exists():
        raise FileNotFoundError(f"Config file not found: {path}")

    with open(path, 'r') as f:
        config = yaml.safe_load(f)

    # Expand environment variables
    def expand_env(value):
        if isinstance(value, str) and value.startswith("${") and value.endswith("}"):
            env_var = value[2:-1]
            return os.environ.get(env_var, "")
        return value

    def process_config(obj):
        if isinstance(obj, dict):
            return {k: process_config(v) for k, v in obj.items()}
        elif isinstance(obj, list):
            return [process_config(item) for item in obj]
        else:
            return expand_env(obj)

    return process_config(config)


class JimDesktop:
    """Main orchestrator for Project Helios Desktop."""

    def __init__(self, config: dict):
        self.config = config
        self.logger = logging.getLogger(__name__)
        self._running = False
        self._processing = False

        self._init_components()

    def _init_components(self):
        """Initialize all components from config."""
        self.logger.info("Initializing Project Helios Desktop...")

        # Audio listener
        audio_cfg = self.config.get("audio", {})
        vad_cfg = self.config.get("vad", {})
        wake_cfg = self.config.get("wake_word", {})

        self.listener = AudioListener(
            audio_config=AudioConfig(
                sample_rate=audio_cfg.get("sample_rate", 16000),
                channels=audio_cfg.get("channels", 1),
                chunk_duration_ms=audio_cfg.get("chunk_duration_ms", 30),
                silence_threshold_ms=audio_cfg.get("silence_threshold_ms", 1500),
                input_device=audio_cfg.get("input_device"),
            ),
            vad_config=VADConfig(
                threshold=vad_cfg.get("threshold", 0.5),
                min_speech_duration_ms=vad_cfg.get("min_speech_duration_ms", 250),
                min_silence_duration_ms=vad_cfg.get("min_silence_duration_ms", 100),
            ),
            wake_word_model=wake_cfg.get("model", "hey_jarvis"),
            wake_word_threshold=wake_cfg.get("threshold", 0.5),
            keyword_fallback=wake_cfg.get("keyword_fallback", "jim"),
        )

        # Transcriber (local faster-whisper)
        trans_cfg = self.config.get("transcriber", {})
        self.transcriber = Transcriber(
            config=TranscriberConfig(
                model=trans_cfg.get("model", "small"),
                device=trans_cfg.get("device", "auto"),
                compute_type=trans_cfg.get("compute_type", "int8"),
                language=trans_cfg.get("language", "en"),
                beam_size=trans_cfg.get("beam_size", 5),
            )
        )

        # Triage engine (local Ollama)
        triage_cfg = self.config.get("triage", {})
        self.triage = TriageEngine(
            config=TriageConfig(
                model=triage_cfg.get("model", "llama3:8b"),
                fallback_model=triage_cfg.get("fallback_model", "mistral:7b"),
                temperature=triage_cfg.get("temperature", 0.1),
                timeout_seconds=triage_cfg.get("timeout_seconds", 5),
                force_respond_keywords=triage_cfg.get("force_respond_keywords", ["jim"]),
            )
        )

        # Brain (Claude Haiku)
        brain_cfg = self.config.get("brain", {})
        self.brain = JimBrain(
            config=BrainConfig(
                model=brain_cfg.get("model", "claude-haiku-4-5-20251001"),
                max_tokens=brain_cfg.get("max_tokens", 150),
                temperature=brain_cfg.get("temperature", 0.7),
                api_key=brain_cfg.get("api_key"),
            )
        )

        # Speaker (ElevenLabs + pyttsx3 fallback)
        speaker_cfg = self.config.get("speaker", {})
        eleven_cfg = speaker_cfg.get("elevenlabs", {})
        pyttsx3_cfg = speaker_cfg.get("pyttsx3", {})

        self.speaker = Speaker(
            config=SpeakerConfig(
                primary=speaker_cfg.get("primary", "elevenlabs"),
                fallback=speaker_cfg.get("fallback", "pyttsx3"),
                elevenlabs=ElevenLabsConfig(
                    voice_id=eleven_cfg.get("voice_id", "G17SuINrv2H9FC6nvetn"),
                    model=eleven_cfg.get("model", "eleven_turbo_v2_5"),
                    api_key=eleven_cfg.get("api_key"),
                ),
                pyttsx3=Pyttsx3Config(
                    rate=pyttsx3_cfg.get("rate", 175),
                    volume=pyttsx3_cfg.get("volume", 0.9),
                ),
            ),
            usage_file=str(PROJECT_ROOT / "logs" / "usage_stats.json"),
        )

        # Memory (local short-term)
        mem_cfg = self.config.get("memory", {})
        self.memory = ConversationMemory(
            config=MemoryConfig(
                max_history=mem_cfg.get("max_history", 10),
                max_queue=mem_cfg.get("max_queue", 20),
                persist=mem_cfg.get("persist", False),
                persist_path=str(PROJECT_ROOT / mem_cfg.get("persist_path", "context/session.json")),
            )
        )
        self.context_manager = ContextManager(self.memory)

        # Auto-pruning long-term memory
        self.long_term_memory = MemoryManager(
            storage_path=str(PROJECT_ROOT / "data" / "memory.json"),
            prune_interval_hours=mem_cfg.get("prune_interval_hours", 6)
        )

        # Screen watcher (ambient visual assistance)
        sw_cfg = self.config.get("screen_watcher", {})
        self.screen_watcher = ScreenWatcher(
            anthropic_api_key=brain_cfg.get("api_key"),
            on_insight=self._on_screen_insight,
            config=ScreenWatcherConfig(
                enabled=sw_cfg.get("enabled", True),
                check_interval=sw_cfg.get("check_interval", 2.0),
                speak_cooldown=sw_cfg.get("speak_cooldown", 30.0),
                high_stakes_keywords=sw_cfg.get("high_stakes_keywords"),
                hash_threshold=sw_cfg.get("hash_threshold", 12),
            )
        )

        # Set up listener callbacks
        self.listener.on_speech_start = self._on_speech_start
        self.listener.on_speech_end = self._on_speech_end
        self.listener.on_wake_word = self._on_wake_word

        self.logger.info("All components initialized")

    def _on_speech_start(self):
        """Handle speech start - interrupt if speaking."""
        self.logger.debug("Speech detected...")
        if self.speaker.is_speaking:
            self.speaker.interrupt()

    def _on_wake_word(self):
        """Handle wake word detection."""
        self.logger.info("Wake word detected!")

    def _on_screen_insight(self, message: str):
        """Handle screen watcher insight - speak it."""
        self.logger.info(f"Screen insight: {message}")
        asyncio.create_task(self.speaker.speak_async(message))

    def _on_speech_end(self, audio_data, has_wake_word: bool):
        """Handle speech end - main processing pipeline."""
        if self._processing:
            self.logger.debug("Already processing, skipping")
            return

        self._processing = True
        try:
            asyncio.create_task(self._process_speech(audio_data, has_wake_word))
        finally:
            self._processing = False

    async def _process_speech(self, audio_data, has_wake_word: bool):
        """Process speech through the pipeline."""
        try:
            # 1. Transcribe locally
            transcript = self.transcriber.transcribe(audio_data)
            if not transcript.text.strip():
                self.logger.debug("Empty transcript")
                return

            self.logger.info(f"Transcript: '{transcript.text}'")

            # 1.5. Check screen watcher for explicit help or frustration
            screen_handled = await self.screen_watcher.on_transcript(transcript.text)
            if screen_handled:
                self.logger.info("Screen watcher handled this transcript")
                return

            # 2. Check for wake word in transcript
            if not has_wake_word:
                has_wake_word = self.listener.wake_detector.check_transcript(transcript.text)

            # 3. Triage (local Ollama)
            context = self.context_manager.get_context()
            if has_wake_word:
                decision = TriageDecision.RESPOND
                self.logger.info("Wake word -> RESPOND")
            else:
                decision = await self.triage.decide_async(
                    transcript.text,
                    context=context,
                    has_wake_word=has_wake_word
                )

            self.logger.info(f"Triage: {decision.value}")

            # 4. Handle decision
            if decision == TriageDecision.RESPOND:
                await self._handle_respond(transcript.text, context)
            elif decision == TriageDecision.ACKNOWLEDGE:
                await self._handle_acknowledge()
            elif decision == TriageDecision.QUEUE:
                self._handle_queue(transcript.text)

        except Exception as e:
            self.logger.error(f"Processing error: {e}", exc_info=True)

    async def _handle_respond(self, user_input: str, context: str):
        """Generate and speak a response."""
        try:
            # Check for memory voice commands first
            if await self._handle_memory_command(user_input):
                return

            # Include long-term memory context
            key_memories = self.long_term_memory.get_context_summary()
            full_context = f"{context}\n\n{key_memories}" if key_memories else context

            response = await self.brain.respond_async(
                user_input=user_input,
                context=full_context,
            )

            # Store in both short-term and long-term memory
            self.memory.add_exchange(user_input, response)
            self.long_term_memory.add("user", user_input)
            self.long_term_memory.add("assistant", response)

            await self.speaker.speak_async(response)

        except Exception as e:
            self.logger.error(f"Response error: {e}")
            await self.speaker.speak_async("Sorry, I had trouble with that.")

    async def _handle_memory_command(self, user_input: str) -> bool:
        """Handle special memory voice commands. Returns True if handled."""
        input_lower = user_input.lower()

        # "Jim remember that..." or "Jorkel remember that..."
        remember_match = re.search(r"(?:jim|jorkel)[,]?\s+remember\s+(?:that\s+)?(.+)", input_lower)
        if remember_match:
            content = remember_match.group(1).strip()
            self.long_term_memory.force_remember(content)
            await self.speaker.speak_async(f"Got it, I'll remember that.")
            return True

        # "Jim forget that" or "Jorkel forget that"
        if re.search(r"(?:jim|jorkel)[,]?\s+forget\s+(?:that|it)", input_lower):
            entry = self.long_term_memory.forget_last()
            if entry:
                await self.speaker.speak_async("Done, I've forgotten it.")
            else:
                await self.speaker.speak_async("Nothing to forget.")
            return True

        # "Jim what do you remember about X"
        remember_about_match = re.search(
            r"(?:jim|jorkel)[,]?\s+what\s+do\s+you\s+remember\s+about\s+(.+)",
            input_lower
        )
        if remember_about_match:
            query = remember_about_match.group(1).strip().rstrip("?")
            results = self.long_term_memory.search(query, limit=5)
            if results:
                summary = f"I found {len(results)} memories about {query}. "
                if results[0].importance >= 8:
                    summary += f"Most importantly: {results[0].content[:100]}"
                await self.speaker.speak_async(summary)
            else:
                await self.speaker.speak_async(f"I don't have any memories about {query}.")
            return True

        # "Jim memory stats"
        if re.search(r"(?:jim|jorkel)[,]?\s+memory\s+stats", input_lower):
            stats = self.long_term_memory.stats()
            await self.speaker.speak_async(
                f"I have {stats['total_entries']} memories. "
                f"{stats['permanent']} are permanent, "
                f"{stats['expiring_24h']} expire within 24 hours."
            )
            return True

        return False

    async def _handle_acknowledge(self):
        """Speak a quick acknowledgment."""
        await self.speaker.speak_async(get_acknowledgment())

    def _handle_queue(self, content: str):
        """Queue content for later."""
        self.memory.queue_item(content)
        self.logger.info(f"Queued: '{content[:50]}...'")

    async def run(self):
        """Start the assistant."""
        self._running = True

        self.logger.info("=" * 50)
        self.logger.info("Project Helios Desktop starting...")
        self.logger.info("Say 'Hey Jarvis' or mention 'Jim' to get my attention")
        self.logger.info("Press Ctrl+C to stop")
        self.logger.info("=" * 50)

        print("\n" + "=" * 50)
        print("Project Helios Desktop")
        print("=" * 50)
        print("Say 'Hey Jarvis' or mention 'Jim' to activate")
        print("Press Ctrl+C to stop")
        print("=" * 50 + "\n")

        await self.speaker.speak_async("Jim online. How can I help?")

        # Start screen watcher
        self.screen_watcher.start()

        try:
            await self.listener.start()
        except KeyboardInterrupt:
            self.logger.info("Keyboard interrupt")
        finally:
            await self.shutdown()

    async def shutdown(self):
        """Clean shutdown."""
        self.logger.info("Shutting down...")
        self._running = False
        self.listener.stop()
        self.screen_watcher.stop()

        print("\n" + "=" * 50)
        print("Session Summary")
        print("=" * 50)
        print(self.speaker.get_usage_summary())
        print("=" * 50)

        await self.speaker.speak_async("Goodbye!")
        self.logger.info("Shutdown complete")


async def main():
    """Main entry point."""
    load_dotenv()

    config = load_config()
    logger = setup_logging(config)

    assistant = JimDesktop(config)

    loop = asyncio.get_event_loop()

    def signal_handler():
        logger.info("Signal received")
        asyncio.create_task(assistant.shutdown())

    for sig in (signal.SIGINT, signal.SIGTERM):
        loop.add_signal_handler(sig, signal_handler)

    await assistant.run()


if __name__ == "__main__":
    asyncio.run(main())
