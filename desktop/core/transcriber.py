"""Speech-to-text transcription using faster-whisper."""

import logging
from dataclasses import dataclass
from typing import Optional

import numpy as np

logger = logging.getLogger(__name__)


@dataclass
class TranscriptResult:
    """Result from transcription."""
    text: str
    confidence: float
    language: str
    duration: float


@dataclass
class TranscriberConfig:
    """Transcriber configuration."""
    model: str = "small"  # tiny, base, small, medium, large
    device: str = "auto"  # auto, cpu, cuda
    compute_type: str = "int8"  # float16, int8
    language: str = "en"
    beam_size: int = 5


class Transcriber:
    """Local speech-to-text using faster-whisper."""

    def __init__(self, config: Optional[TranscriberConfig] = None):
        self.config = config or TranscriberConfig()
        self.model = None
        self._load_model()

    def _load_model(self):
        """Load faster-whisper model."""
        try:
            from faster_whisper import WhisperModel

            # Determine device
            device = self.config.device
            if device == "auto":
                try:
                    import torch
                    device = "cuda" if torch.cuda.is_available() else "cpu"
                except ImportError:
                    device = "cpu"

            # Adjust compute type for CPU
            compute_type = self.config.compute_type
            if device == "cpu" and compute_type == "float16":
                compute_type = "int8"
                logger.info("Switched to int8 compute type for CPU")

            logger.info(f"Loading Whisper model '{self.config.model}' on {device}...")
            self.model = WhisperModel(
                self.config.model,
                device=device,
                compute_type=compute_type
            )
            logger.info(f"Whisper model loaded successfully")

        except Exception as e:
            logger.error(f"Failed to load Whisper model: {e}")
            raise

    def transcribe(
        self,
        audio: np.ndarray,
        sample_rate: int = 16000
    ) -> TranscriptResult:
        """
        Transcribe audio to text.

        Args:
            audio: Audio data as numpy array (float32, -1 to 1)
            sample_rate: Sample rate of audio (default 16000)

        Returns:
            TranscriptResult with text, confidence, language, duration
        """
        if self.model is None:
            raise RuntimeError("Transcriber model not loaded")

        try:
            # Ensure audio is float32 normalized
            if audio.dtype != np.float32:
                audio = audio.astype(np.float32)
            if np.abs(audio).max() > 1.0:
                audio = audio / 32768.0

            # Calculate duration
            duration = len(audio) / sample_rate

            # Transcribe
            segments, info = self.model.transcribe(
                audio,
                language=self.config.language if self.config.language != "auto" else None,
                beam_size=self.config.beam_size,
                vad_filter=True,  # Use built-in VAD
                vad_parameters=dict(
                    min_silence_duration_ms=500,
                    speech_pad_ms=400
                )
            )

            # Collect all segments
            text_parts = []
            total_prob = 0.0
            segment_count = 0

            for segment in segments:
                text_parts.append(segment.text)
                total_prob += segment.avg_logprob
                segment_count += 1

            text = " ".join(text_parts).strip()
            avg_confidence = (total_prob / segment_count) if segment_count > 0 else 0.0

            # Convert log probability to 0-1 confidence
            # avg_logprob is typically between -1 (high confidence) and -2+ (low confidence)
            confidence = min(1.0, max(0.0, 1.0 + avg_confidence))

            result = TranscriptResult(
                text=text,
                confidence=confidence,
                language=info.language if info else self.config.language,
                duration=duration
            )

            logger.debug(f"Transcribed: '{text}' (confidence: {confidence:.2f})")
            return result

        except Exception as e:
            logger.error(f"Transcription error: {e}")
            return TranscriptResult(
                text="",
                confidence=0.0,
                language=self.config.language,
                duration=0.0
            )

    def transcribe_file(self, file_path: str) -> TranscriptResult:
        """Transcribe audio from file."""
        try:
            import soundfile as sf
            audio, sample_rate = sf.read(file_path)

            # Convert to mono if stereo
            if len(audio.shape) > 1:
                audio = audio.mean(axis=1)

            # Resample if needed
            if sample_rate != 16000:
                from scipy import signal
                audio = signal.resample(audio, int(len(audio) * 16000 / sample_rate))
                sample_rate = 16000

            return self.transcribe(audio.astype(np.float32), sample_rate)

        except Exception as e:
            logger.error(f"Failed to transcribe file: {e}")
            return TranscriptResult(
                text="",
                confidence=0.0,
                language=self.config.language,
                duration=0.0
            )
