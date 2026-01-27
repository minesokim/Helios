"""Audio listener with VAD and wake word detection."""

import asyncio
import logging
import queue
import threading
from collections import deque
from dataclasses import dataclass
from typing import Callable, Optional

import numpy as np
import sounddevice as sd

logger = logging.getLogger(__name__)


@dataclass
class AudioConfig:
    """Audio configuration settings."""
    sample_rate: int = 16000
    channels: int = 1
    chunk_duration_ms: int = 30
    silence_threshold_ms: int = 1500
    input_device: Optional[int] = None

    @property
    def chunk_samples(self) -> int:
        return int(self.sample_rate * self.chunk_duration_ms / 1000)

    @property
    def silence_chunks(self) -> int:
        return int(self.silence_threshold_ms / self.chunk_duration_ms)


@dataclass
class VADConfig:
    """VAD configuration settings."""
    threshold: float = 0.5
    min_speech_duration_ms: int = 250
    min_silence_duration_ms: int = 100


class SileroVAD:
    """Silero Voice Activity Detection wrapper."""

    def __init__(self, config: VADConfig):
        self.config = config
        self.model = None
        self._load_model()

    def _load_model(self):
        """Load Silero VAD model."""
        try:
            import torch
            self.model, utils = torch.hub.load(
                repo_or_dir='snakers4/silero-vad',
                model='silero_vad',
                force_reload=False,
                onnx=True
            )
            (
                self.get_speech_timestamps,
                self.save_audio,
                self.read_audio,
                self.VADIterator,
                self.collect_chunks
            ) = utils
            logger.info("Silero VAD model loaded successfully")
        except Exception as e:
            logger.error(f"Failed to load Silero VAD: {e}")
            raise

    def is_speech(self, audio_chunk: np.ndarray, sample_rate: int = 16000) -> float:
        """Check if audio chunk contains speech. Returns confidence 0-1."""
        try:
            import torch
            if len(audio_chunk) == 0:
                return 0.0

            # Normalize audio to float32 [-1, 1]
            if audio_chunk.dtype != np.float32:
                audio_chunk = audio_chunk.astype(np.float32)
            if np.abs(audio_chunk).max() > 1.0:
                audio_chunk = audio_chunk / 32768.0

            tensor = torch.from_numpy(audio_chunk)
            confidence = self.model(tensor, sample_rate).item()
            return confidence
        except Exception as e:
            logger.warning(f"VAD error: {e}")
            return 0.0


class WakeWordDetector:
    """OpenWakeWord-based wake word detection."""

    def __init__(self, model_name: str = "hey_jarvis", threshold: float = 0.5,
                 keyword_fallback: str = "jim"):
        self.model_name = model_name
        self.threshold = threshold
        self.keyword_fallback = keyword_fallback.lower()
        self.model = None
        self._load_model()

    def _load_model(self):
        """Load OpenWakeWord model."""
        try:
            from openwakeword.model import Model
            self.model = Model(
                wakeword_models=[self.model_name],
                inference_framework="onnx"
            )
            logger.info(f"OpenWakeWord model '{self.model_name}' loaded")
        except Exception as e:
            logger.warning(f"Failed to load OpenWakeWord: {e}. Wake word detection disabled.")
            self.model = None

    def detect(self, audio_chunk: np.ndarray) -> bool:
        """Check if wake word is in audio chunk."""
        if self.model is None:
            return False

        try:
            # OpenWakeWord expects int16 audio
            if audio_chunk.dtype == np.float32:
                audio_int16 = (audio_chunk * 32767).astype(np.int16)
            else:
                audio_int16 = audio_chunk.astype(np.int16)

            prediction = self.model.predict(audio_int16)
            for model_name, score in prediction.items():
                if score > self.threshold:
                    logger.info(f"Wake word detected: {model_name} (score: {score:.2f})")
                    return True
            return False
        except Exception as e:
            logger.warning(f"Wake word detection error: {e}")
            return False

    def check_transcript(self, text: str) -> bool:
        """Check if transcript contains wake word keyword."""
        return self.keyword_fallback in text.lower()


class AudioListener:
    """Continuous audio capture with VAD and event callbacks."""

    def __init__(
        self,
        audio_config: Optional[AudioConfig] = None,
        vad_config: Optional[VADConfig] = None,
        wake_word_model: str = "hey_jarvis",
        wake_word_threshold: float = 0.5,
        keyword_fallback: str = "jim"
    ):
        self.audio_config = audio_config or AudioConfig()
        self.vad_config = vad_config or VADConfig()

        # Initialize components
        self.vad = SileroVAD(self.vad_config)
        self.wake_detector = WakeWordDetector(
            model_name=wake_word_model,
            threshold=wake_word_threshold,
            keyword_fallback=keyword_fallback
        )

        # State
        self._running = False
        self._audio_buffer: deque = deque(maxlen=1000)  # ~30 seconds at 30ms chunks
        self._speech_buffer: list = []
        self._is_speaking = False
        self._silence_count = 0
        self._min_speech_chunks = int(
            self.vad_config.min_speech_duration_ms / self.audio_config.chunk_duration_ms
        )

        # Callbacks
        self.on_speech_start: Optional[Callable[[], None]] = None
        self.on_speech_end: Optional[Callable[[np.ndarray, bool], None]] = None
        self.on_wake_word: Optional[Callable[[], None]] = None

        # Thread-safe queue for audio
        self._audio_queue: queue.Queue = queue.Queue()

    def _audio_callback(self, indata: np.ndarray, frames: int,
                        time_info: dict, status: sd.CallbackFlags):
        """Callback for sounddevice stream."""
        if status:
            logger.warning(f"Audio callback status: {status}")

        # Copy audio data to queue
        audio_data = indata[:, 0].copy() if indata.ndim > 1 else indata.copy()
        self._audio_queue.put(audio_data)

    def _process_audio(self):
        """Process audio chunks from queue."""
        while self._running:
            try:
                audio_chunk = self._audio_queue.get(timeout=0.1)
            except queue.Empty:
                continue

            # Check for speech
            confidence = self.vad.is_speech(audio_chunk, self.audio_config.sample_rate)
            is_speech = confidence > self.vad_config.threshold

            # Check for wake word in real-time
            wake_word_detected = self.wake_detector.detect(audio_chunk)
            if wake_word_detected and self.on_wake_word:
                self.on_wake_word()

            # State machine for speech detection
            if is_speech:
                if not self._is_speaking:
                    # Speech started
                    self._is_speaking = True
                    self._silence_count = 0
                    self._speech_buffer = []
                    logger.debug("Speech started")
                    if self.on_speech_start:
                        self.on_speech_start()

                self._speech_buffer.append(audio_chunk)
                self._silence_count = 0
            else:
                if self._is_speaking:
                    self._silence_count += 1
                    self._speech_buffer.append(audio_chunk)  # Include some silence

                    # Check if silence threshold reached
                    if self._silence_count >= self.audio_config.silence_chunks:
                        # Speech ended
                        if len(self._speech_buffer) >= self._min_speech_chunks:
                            audio_data = np.concatenate(self._speech_buffer)
                            logger.debug(f"Speech ended, {len(audio_data)} samples")

                            # Check if wake word was in the speech segment
                            has_wake_word = any(
                                self.wake_detector.detect(chunk)
                                for chunk in self._speech_buffer[:10]  # Check first ~300ms
                            )

                            if self.on_speech_end:
                                self.on_speech_end(audio_data, has_wake_word)
                        else:
                            logger.debug("Speech too short, ignoring")

                        self._is_speaking = False
                        self._speech_buffer = []

            # Store in circular buffer
            self._audio_buffer.append(audio_chunk)

    async def start(self):
        """Start listening for audio."""
        if self._running:
            logger.warning("AudioListener already running")
            return

        self._running = True
        logger.info("Starting audio listener...")

        # Start processing thread
        process_thread = threading.Thread(target=self._process_audio, daemon=True)
        process_thread.start()

        # Start audio stream
        try:
            with sd.InputStream(
                samplerate=self.audio_config.sample_rate,
                channels=self.audio_config.channels,
                dtype=np.float32,
                blocksize=self.audio_config.chunk_samples,
                device=self.audio_config.input_device,
                callback=self._audio_callback
            ):
                logger.info("Audio stream started")
                while self._running:
                    await asyncio.sleep(0.1)
        except Exception as e:
            logger.error(f"Audio stream error: {e}")
            raise
        finally:
            self._running = False
            process_thread.join(timeout=1.0)

    def stop(self):
        """Stop listening."""
        logger.info("Stopping audio listener...")
        self._running = False

    @property
    def is_running(self) -> bool:
        return self._running
