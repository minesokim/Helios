"""Screen watcher module for Jorkel AI.

Watches screen silently, only speaks when:
1. User explicitly asks for visual help
2. High-stakes context + (error detected OR frustration phrase)
"""

import asyncio
import base64
import io
import logging
import re
import time
from dataclasses import dataclass
from enum import Enum
from typing import Callable, List, Optional

from PIL import Image, ImageGrab
import imagehash
from anthropic import Anthropic

logger = logging.getLogger(__name__)


class WatchMode(Enum):
    OFF = "off"
    PASSIVE = "passive"  # Watching but silent
    ACTIVE = "active"    # User explicitly asked for help


@dataclass
class ScreenAnalysis:
    """Result of screen analysis."""
    has_error: bool
    error_description: Optional[str]
    confidence: float
    suggested_help: Optional[str]


# Default frustration patterns
DEFAULT_FRUSTRATION_PATTERNS = [
    r"\bbruh+\b",
    r"\bman+\b",
    r"\bare you serious\b",
    r"\bwhat the fuck\b",
    r"\bfuck\b",
    r"\bshit\b",
    r"\bdamn\b",
    r"\bgod damn\b",
    r"\bwhy isn'?t this working\b",
    r"\bcome on\b",
    r"\bugh+\b",
    r"\bwhat the hell\b",
]

# Explicit help triggers
EXPLICIT_TRIGGERS = [
    "jim look at this",
    "jim, look at this",
    "jorkel look at this",
    "jorkel, look at this",
    "can you see my screen",
    "help me with this",
    "what's wrong here",
    "jim help",
    "jorkel help",
    "look at my screen",
    "what am i doing wrong",
    "why isn't this working",
]


@dataclass
class ScreenWatcherConfig:
    """Screen watcher configuration."""
    enabled: bool = True
    check_interval: float = 2.0
    speak_cooldown: float = 30.0
    high_stakes_keywords: List[str] = None
    frustration_patterns: List[str] = None
    hash_threshold: int = 12

    def __post_init__(self):
        if self.high_stakes_keywords is None:
            self.high_stakes_keywords = ["mary", "client", "urgent", "deadline"]
        if self.frustration_patterns is None:
            self.frustration_patterns = DEFAULT_FRUSTRATION_PATTERNS


class ScreenWatcher:
    """
    Watches screen silently, speaks only when:
    1. User explicitly asks for visual help
    2. High-stakes context + (error detected OR frustration phrase)
    """

    def __init__(
        self,
        anthropic_api_key: str,
        on_insight: Callable[[str], None],
        config: Optional[ScreenWatcherConfig] = None
    ):
        self.client = Anthropic(api_key=anthropic_api_key)
        self.on_insight = on_insight
        self.config = config or ScreenWatcherConfig()

        self.mode = WatchMode.OFF
        self.high_stakes_context = False
        self.high_stakes_reason = ""
        self.last_hash: Optional[imagehash.ImageHash] = None
        self.last_spoke_time = 0.0
        self.running = False
        self._watch_task: Optional[asyncio.Task] = None

        # Compile frustration patterns
        self._frustration_patterns = [
            re.compile(p, re.IGNORECASE)
            for p in self.config.frustration_patterns
        ]

        logger.info("ScreenWatcher initialized")

    def set_high_stakes(self, is_high_stakes: bool, reason: str = ""):
        """Set whether we're in high-stakes context."""
        self.high_stakes_context = is_high_stakes
        self.high_stakes_reason = reason
        if is_high_stakes:
            logger.info(f"High-stakes mode enabled: {reason}")
        else:
            logger.info("High-stakes mode disabled")

    def check_frustration(self, transcript: str) -> bool:
        """Check if transcript contains frustration phrases."""
        for pattern in self._frustration_patterns:
            if pattern.search(transcript):
                logger.debug(f"Frustration detected: {pattern.pattern}")
                return True
        return False

    def check_explicit_trigger(self, transcript: str) -> bool:
        """Check if transcript contains explicit help request."""
        transcript_lower = transcript.lower()
        for trigger in EXPLICIT_TRIGGERS:
            if trigger in transcript_lower:
                logger.debug(f"Explicit trigger detected: {trigger}")
                return True
        return False

    def detect_high_stakes_from_text(self, text: str) -> Optional[str]:
        """Check if text suggests high-stakes work. Returns reason if found."""
        text_lower = text.lower()
        for keyword in self.config.high_stakes_keywords:
            if keyword.lower() in text_lower:
                return f"Detected keyword: {keyword}"
        return None

    def capture_screen(self) -> Optional[Image.Image]:
        """Capture current screen."""
        try:
            return ImageGrab.grab()
        except Exception as e:
            logger.error(f"Screen capture failed: {e}")
            return None

    def screen_changed_significantly(self, current: Image.Image) -> bool:
        """Check if screen changed enough to warrant analysis."""
        try:
            current_hash = imagehash.phash(current)

            if self.last_hash is None:
                self.last_hash = current_hash
                return True

            diff = self.last_hash - current_hash
            self.last_hash = current_hash

            return diff > self.config.hash_threshold
        except Exception as e:
            logger.error(f"Hash comparison failed: {e}")
            return True

    def image_to_base64(self, image: Image.Image) -> str:
        """Convert PIL Image to base64."""
        buffer = io.BytesIO()
        # Resize for faster upload (max 1280px on longest side)
        max_size = 1280
        if max(image.size) > max_size:
            ratio = max_size / max(image.size)
            new_size = (int(image.width * ratio), int(image.height * ratio))
            image = image.resize(new_size, Image.Resampling.LANCZOS)

        image.save(buffer, format="PNG", optimize=True)
        return base64.standard_b64encode(buffer.getvalue()).decode("utf-8")

    async def analyze_screen(self, image: Image.Image) -> ScreenAnalysis:
        """Send screenshot to Claude Vision for analysis."""
        try:
            base64_image = self.image_to_base64(image)

            response = await asyncio.get_event_loop().run_in_executor(
                None,
                lambda: self.client.messages.create(
                    model="claude-haiku-4-5-20251001",
                    max_tokens=300,
                    messages=[{
                        "role": "user",
                        "content": [
                            {
                                "type": "image",
                                "source": {
                                    "type": "base64",
                                    "media_type": "image/png",
                                    "data": base64_image
                                }
                            },
                            {
                                "type": "text",
                                "text": """Analyze this screenshot for errors or problems.

Respond in this exact format:
HAS_ERROR: true/false
CONFIDENCE: 0.0-1.0
ERROR_DESCRIPTION: (one line, or "none")
SUGGESTED_HELP: (brief suggestion, or "none")

Look for: error messages, stack traces, red text, warning modals, failed states, terminal errors."""
                            }
                        ]
                    }]
                )
            )

            text = response.content[0].text
            return self._parse_analysis(text)

        except Exception as e:
            logger.error(f"Screen analysis failed: {e}")
            return ScreenAnalysis(
                has_error=False,
                error_description=None,
                confidence=0.0,
                suggested_help=None
            )

    def _parse_analysis(self, text: str) -> ScreenAnalysis:
        """Parse Claude's analysis response."""
        has_error = "has_error: true" in text.lower()

        confidence = 0.5
        error_desc = None
        suggested = None

        for line in text.split("\n"):
            line_lower = line.lower()
            if "confidence:" in line_lower:
                try:
                    confidence = float(line.split(":", 1)[1].strip())
                except (ValueError, IndexError):
                    pass
            elif "error_description:" in line_lower:
                try:
                    desc = line.split(":", 1)[1].strip()
                    if desc.lower() != "none":
                        error_desc = desc
                except IndexError:
                    pass
            elif "suggested_help:" in line_lower:
                try:
                    sugg = line.split(":", 1)[1].strip()
                    if sugg.lower() != "none":
                        suggested = sugg
                except IndexError:
                    pass

        return ScreenAnalysis(
            has_error=has_error,
            error_description=error_desc,
            confidence=confidence,
            suggested_help=suggested
        )

    def can_speak(self) -> bool:
        """Check if cooldown has passed."""
        return (time.time() - self.last_spoke_time) > self.config.speak_cooldown

    def speak(self, message: str):
        """Speak via callback."""
        self.last_spoke_time = time.time()
        logger.info(f"ScreenWatcher speaking: {message[:50]}...")
        self.on_insight(message)

    async def on_transcript(self, transcript: str) -> bool:
        """
        Called when user speaks - check for explicit help or frustration.
        Returns True if screen watcher handled the transcript.
        """
        if not self.config.enabled or self.mode == WatchMode.OFF:
            return False

        # Check for high-stakes keywords in transcript
        reason = self.detect_high_stakes_from_text(transcript)
        if reason and not self.high_stakes_context:
            self.set_high_stakes(True, reason)

        # Explicit help requests - always respond
        if self.check_explicit_trigger(transcript):
            self.mode = WatchMode.ACTIVE
            await self.analyze_and_respond(explicit=True)
            return True

        # Frustration during high-stakes - analyze screen
        if self.high_stakes_context and self.check_frustration(transcript):
            if self.can_speak():
                await self.analyze_and_respond(explicit=False)
                return True

        return False

    async def analyze_and_respond(self, explicit: bool):
        """Capture screen, analyze, and respond if warranted."""
        screenshot = self.capture_screen()
        if screenshot is None:
            if explicit:
                self.speak("I'm having trouble seeing your screen right now.")
            return

        analysis = await self.analyze_screen(screenshot)

        if explicit:
            # User asked - always respond
            if analysis.has_error and analysis.suggested_help:
                self.speak(f"I see the issue. {analysis.error_description}. {analysis.suggested_help}")
            elif analysis.has_error:
                self.speak(f"I see an error: {analysis.error_description}")
            else:
                self.speak("I'm looking at your screen. What do you need help with?")
        else:
            # Implicit (frustration) - only respond if error found with high confidence
            if analysis.has_error and analysis.confidence > 0.7:
                msg = f"I noticed an error: {analysis.error_description}."
                if analysis.suggested_help:
                    msg += f" {analysis.suggested_help}"
                else:
                    msg += " Want me to help?"
                self.speak(msg)

    async def _passive_watch_loop(self):
        """Background loop for passive monitoring during high-stakes."""
        while self.running:
            await asyncio.sleep(self.config.check_interval)

            if not self.high_stakes_context or not self.can_speak():
                continue

            screenshot = self.capture_screen()
            if screenshot is None:
                continue

            if not self.screen_changed_significantly(screenshot):
                continue

            # Only analyze if screen changed significantly during high-stakes
            # This is lightweight - just checks for major visual errors
            # without being triggered by frustration

    def start(self):
        """Start watching."""
        if not self.config.enabled:
            logger.info("ScreenWatcher disabled in config")
            return

        self.running = True
        self.mode = WatchMode.PASSIVE
        logger.info("ScreenWatcher started in passive mode")

    def stop(self):
        """Stop watching."""
        self.running = False
        self.mode = WatchMode.OFF
        if self._watch_task:
            self._watch_task.cancel()
        logger.info("ScreenWatcher stopped")
