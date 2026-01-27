"""Conversation memory and context management."""

import json
import logging
from collections import deque
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import List, Optional

logger = logging.getLogger(__name__)


@dataclass
class Exchange:
    """A single conversation exchange."""
    user_input: str
    assistant_response: str
    timestamp: str = field(default_factory=lambda: datetime.now().isoformat())

    def to_dict(self) -> dict:
        return {
            "user": self.user_input,
            "assistant": self.assistant_response,
            "timestamp": self.timestamp
        }

    @classmethod
    def from_dict(cls, data: dict) -> "Exchange":
        return cls(
            user_input=data["user"],
            assistant_response=data["assistant"],
            timestamp=data.get("timestamp", datetime.now().isoformat())
        )


@dataclass
class QueuedItem:
    """An item queued for later reference."""
    content: str
    timestamp: str = field(default_factory=lambda: datetime.now().isoformat())
    tags: List[str] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {
            "content": self.content,
            "timestamp": self.timestamp,
            "tags": self.tags
        }

    @classmethod
    def from_dict(cls, data: dict) -> "QueuedItem":
        return cls(
            content=data["content"],
            timestamp=data.get("timestamp", datetime.now().isoformat()),
            tags=data.get("tags", [])
        )


@dataclass
class MemoryConfig:
    """Memory configuration."""
    max_history: int = 10
    max_queue: int = 20
    persist: bool = False
    persist_path: str = "context/session.json"


class ConversationMemory:
    """Short-term conversation context and queued items."""

    def __init__(self, config: Optional[MemoryConfig] = None):
        self.config = config or MemoryConfig()
        self._history: deque[Exchange] = deque(maxlen=self.config.max_history)
        self._queue: deque[QueuedItem] = deque(maxlen=self.config.max_queue)
        self._session_start = datetime.now()

        if self.config.persist:
            self._load_session()

    def add_exchange(self, user_input: str, assistant_response: str):
        """Add a conversation exchange to history."""
        exchange = Exchange(
            user_input=user_input,
            assistant_response=assistant_response
        )
        self._history.append(exchange)
        logger.debug(f"Added exchange, history size: {len(self._history)}")

        if self.config.persist:
            self._save_session()

    def queue_item(self, content: str, tags: Optional[List[str]] = None):
        """Queue an item for later reference."""
        item = QueuedItem(
            content=content,
            tags=tags or []
        )
        self._queue.append(item)
        logger.debug(f"Queued item, queue size: {len(self._queue)}")

        if self.config.persist:
            self._save_session()

    def get_recent_history(self, count: Optional[int] = None) -> List[Exchange]:
        """Get recent conversation history."""
        history = list(self._history)
        if count:
            return history[-count:]
        return history

    def get_queued_items(self, count: Optional[int] = None) -> List[QueuedItem]:
        """Get queued items."""
        items = list(self._queue)
        if count:
            return items[-count:]
        return items

    def clear_queue(self):
        """Clear all queued items."""
        self._queue.clear()
        if self.config.persist:
            self._save_session()

    def clear_history(self):
        """Clear conversation history."""
        self._history.clear()
        if self.config.persist:
            self._save_session()

    def _save_session(self):
        """Save session to file."""
        try:
            path = Path(self.config.persist_path)
            path.parent.mkdir(parents=True, exist_ok=True)

            data = {
                "session_start": self._session_start.isoformat(),
                "history": [ex.to_dict() for ex in self._history],
                "queue": [item.to_dict() for item in self._queue]
            }

            with open(path, 'w') as f:
                json.dump(data, f, indent=2)

            logger.debug(f"Session saved to {path}")

        except Exception as e:
            logger.warning(f"Failed to save session: {e}")

    def _load_session(self):
        """Load session from file."""
        try:
            path = Path(self.config.persist_path)
            if not path.exists():
                return

            with open(path, 'r') as f:
                data = json.load(f)

            self._history = deque(
                [Exchange.from_dict(ex) for ex in data.get("history", [])],
                maxlen=self.config.max_history
            )
            self._queue = deque(
                [QueuedItem.from_dict(item) for item in data.get("queue", [])],
                maxlen=self.config.max_queue
            )

            logger.info(
                f"Session loaded: {len(self._history)} history, {len(self._queue)} queued"
            )

        except Exception as e:
            logger.warning(f"Failed to load session: {e}")


class ContextManager:
    """Build context for Claude calls."""

    def __init__(self, memory: ConversationMemory):
        self.memory = memory

    def get_context(self, include_queue: bool = True) -> str:
        """Build context string for system prompt."""
        parts = []

        # Recent conversation history
        history = self.memory.get_recent_history(5)
        if history:
            parts.append("Recent conversation:")
            for ex in history:
                parts.append(f"  User: {ex.user_input}")
                parts.append(f"  Jim: {ex.assistant_response}")

        # Queued items (things to remember)
        if include_queue:
            queue = self.memory.get_queued_items(5)
            if queue:
                parts.append("\nThings mentioned earlier:")
                for item in queue:
                    parts.append(f"  - {item.content}")

        return "\n".join(parts) if parts else ""

    def get_messages_for_brain(self) -> List[dict]:
        """Get formatted messages for Claude API."""
        messages = []
        for ex in self.memory.get_recent_history():
            messages.append({"role": "user", "content": ex.user_input})
            messages.append({"role": "assistant", "content": ex.assistant_response})
        return messages

    def get_time_greeting(self) -> str:
        """Get appropriate time-based greeting."""
        hour = datetime.now().hour
        if hour < 12:
            return "morning"
        elif hour < 17:
            return "afternoon"
        else:
            return "evening"
