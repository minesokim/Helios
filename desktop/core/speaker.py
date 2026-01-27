"""Text-to-speech with ElevenLabs primary and pyttsx3 fallback."""

import asyncio
import io
import json
import logging
import os
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Optional

import numpy as np
import sounddevice as sd

logger = logging.getLogger(__name__)


@dataclass
class ElevenLabsConfig:
    """ElevenLabs TTS configuration."""
    voice_id: str = "G17SuINrv2H9FC6nvetn"
    model: str = "eleven_turbo_v2_5"
    api_key: Optional[str] = None

    def __post_init__(self):
        if self.api_key is None:
            self.api_key = os.environ.get("ELEVENLABS_API_KEY")


@dataclass
class Pyttsx3Config:
    """pyttsx3 TTS configuration."""
    rate: int = 175
    volume: float = 0.9


@dataclass
class SpeakerConfig:
    """Speaker configuration."""
    primary: str = "elevenlabs"
    fallback: str = "pyttsx3"
    elevenlabs: ElevenLabsConfig = None
    pyttsx3: Pyttsx3Config = None

    def __post_init__(self):
        if self.elevenlabs is None:
            self.elevenlabs = ElevenLabsConfig()
        if self.pyttsx3 is None:
            self.pyttsx3 = Pyttsx3Config()


@dataclass
class UsageStats:
    """Track API usage and costs."""
    elevenlabs_characters: int = 0
    elevenlabs_requests: int = 0
    pyttsx3_characters: int = 0
    session_start: str = field(default_factory=lambda: datetime.now().isoformat())

    # ElevenLabs pricing: ~$0.15 per 1000 characters
    ELEVENLABS_COST_PER_CHAR = 0.00015

    @property
    def elevenlabs_cost(self) -> float:
        return self.elevenlabs_characters * self.ELEVENLABS_COST_PER_CHAR

    def to_dict(self) -> dict:
        return {
            "elevenlabs_characters": self.elevenlabs_characters,
            "elevenlabs_requests": self.elevenlabs_requests,
            "elevenlabs_cost_usd": round(self.elevenlabs_cost, 4),
            "pyttsx3_characters": self.pyttsx3_characters,
            "session_start": self.session_start
        }


class Speaker:
    """Text-to-speech with fallback support and interrupt handling."""

    def __init__(self, config: Optional[SpeakerConfig] = None, usage_file: Optional[str] = None):
        self.config = config or SpeakerConfig()
        self._speaking = False
        self._interrupt_requested = False

        # Usage tracking
        self.usage = UsageStats()
        self._usage_file = usage_file or "logs/usage_stats.json"

        # Initialize TTS engines
        self._elevenlabs_client = None
        self._pyttsx3_engine = None
        self._init_engines()

    def _init_engines(self):
        """Initialize TTS engines."""
        # Try ElevenLabs
        if self.config.primary == "elevenlabs" and self.config.elevenlabs.api_key:
            try:
                from elevenlabs.client import ElevenLabs
                self._elevenlabs_client = ElevenLabs(
                    api_key=self.config.elevenlabs.api_key
                )
                logger.info("ElevenLabs TTS initialized")
            except Exception as e:
                logger.warning(f"Failed to initialize ElevenLabs: {e}")
                self._elevenlabs_client = None

        # Initialize pyttsx3 as fallback
        try:
            import pyttsx3
            self._pyttsx3_engine = pyttsx3.init()
            self._pyttsx3_engine.setProperty('rate', self.config.pyttsx3.rate)
            self._pyttsx3_engine.setProperty('volume', self.config.pyttsx3.volume)
            logger.info("pyttsx3 TTS initialized as fallback")
        except Exception as e:
            logger.warning(f"Failed to initialize pyttsx3: {e}")
            self._pyttsx3_engine = None

    def _generate_elevenlabs(self, text: str) -> Optional[bytes]:
        """Generate speech using ElevenLabs."""
        if not self._elevenlabs_client:
            return None

        try:
            audio = self._elevenlabs_client.generate(
                text=text,
                voice=self.config.elevenlabs.voice_id,
                model=self.config.elevenlabs.model
            )
            audio_bytes = b"".join(audio)

            # Track usage
            self.usage.elevenlabs_characters += len(text)
            self.usage.elevenlabs_requests += 1
            self._save_usage()

            logger.debug(
                f"ElevenLabs: {len(text)} chars, "
                f"total: {self.usage.elevenlabs_characters} chars, "
                f"cost: ${self.usage.elevenlabs_cost:.4f}"
            )

            return audio_bytes
        except Exception as e:
            logger.error(f"ElevenLabs generation failed: {e}")
            return None

    def _speak_pyttsx3(self, text: str):
        """Speak using pyttsx3 (blocking)."""
        if not self._pyttsx3_engine:
            logger.error("No TTS engine available")
            return

        try:
            self._pyttsx3_engine.say(text)
            self._pyttsx3_engine.runAndWait()
            self.usage.pyttsx3_characters += len(text)
        except Exception as e:
            logger.error(f"pyttsx3 speech failed: {e}")

    def _play_audio_bytes(self, audio_bytes: bytes):
        """Play audio bytes using sounddevice."""
        try:
            from pydub import AudioSegment

            audio = AudioSegment.from_mp3(io.BytesIO(audio_bytes))
            samples = np.array(audio.get_array_of_samples(), dtype=np.float32)
            samples = samples / 32768.0

            if audio.channels == 1:
                samples = samples.reshape(-1, 1)
            else:
                samples = samples.reshape(-1, audio.channels)

            self._speaking = True
            sd.play(samples, samplerate=audio.frame_rate)

            while sd.get_stream().active:
                if self._interrupt_requested:
                    sd.stop()
                    logger.info("Speech interrupted")
                    break
                sd.sleep(50)

            self._speaking = False
            self._interrupt_requested = False

        except ImportError:
            logger.warning("pydub not available, falling back to pyttsx3")
            self._speaking = False
        except Exception as e:
            logger.error(f"Audio playback failed: {e}")
            self._speaking = False

    def speak(self, text: str):
        """Speak text using TTS."""
        if not text or not text.strip():
            return

        logger.info(f"Speaking: '{text[:50]}...'")

        # Try ElevenLabs first
        if self._elevenlabs_client:
            audio_bytes = self._generate_elevenlabs(text)
            if audio_bytes:
                self._play_audio_bytes(audio_bytes)
                return

        # Fallback to pyttsx3
        self._speaking = True
        self._speak_pyttsx3(text)
        self._speaking = False

    async def speak_async(self, text: str):
        """Async version of speak."""
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(None, self.speak, text)

    def interrupt(self):
        """Interrupt current speech."""
        if self._speaking:
            self._interrupt_requested = True
            logger.info("Interrupt requested")

    @property
    def is_speaking(self) -> bool:
        return self._speaking

    def _save_usage(self):
        """Save usage stats to file."""
        try:
            path = Path(self._usage_file)
            path.parent.mkdir(parents=True, exist_ok=True)
            with open(path, 'w') as f:
                json.dump(self.usage.to_dict(), f, indent=2)
        except Exception as e:
            logger.warning(f"Failed to save usage stats: {e}")

    def get_usage_summary(self) -> str:
        """Get a human-readable usage summary."""
        return (
            f"ElevenLabs Usage:\n"
            f"  Characters: {self.usage.elevenlabs_characters:,}\n"
            f"  Requests: {self.usage.elevenlabs_requests}\n"
            f"  Estimated Cost: ${self.usage.elevenlabs_cost:.4f}\n"
            f"\n"
            f"pyttsx3 Usage (free):\n"
            f"  Characters: {self.usage.pyttsx3_characters:,}\n"
            f"\n"
            f"Session started: {self.usage.session_start}"
        )


# Quick acknowledgment responses
ACKNOWLEDGMENTS = [
    "Got it",
    "Noted",
    "Okay",
    "Sure thing",
    "Understood",
    "Mm-hmm",
    "Alright",
]


def get_acknowledgment() -> str:
    """Get a random acknowledgment phrase."""
    import random
    return random.choice(ACKNOWLEDGMENTS)
