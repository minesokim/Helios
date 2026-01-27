"""
Auto-pruning memory system for Jorkel AI.

Stores conversations but automatically prunes low-value content.
Keeps important details forever, forgets "hello" and routine queries.

Importance Scoring:
- 9-10: PERMANENT (client names, financial decisions, deadlines, credentials)
- 6-8: LONG-TERM 30 days (action items, solutions, research)
- 3-5: SHORT-TERM 7 days (general Q&A, explanations)
- 1-2: GARBAGE 24 hours (greetings, acknowledgments, short phrases)
"""

import json
import re
import hashlib
import logging
from datetime import datetime, timedelta
from pathlib import Path
from typing import List, Dict, Optional
from dataclasses import dataclass, asdict

logger = logging.getLogger(__name__)


@dataclass
class MemoryEntry:
    """A single memory entry."""
    id: str
    timestamp: str
    role: str  # "user", "assistant", or "system"
    content: str
    importance: int  # 1-10
    topics: List[str]
    expires_at: Optional[str]  # ISO datetime or None for permanent


class MemoryManager:
    """
    Auto-pruning conversation memory.
    Scores importance, sets expiration, cleans up automatically.
    """

    # Patterns for garbage detection (greetings, acknowledgments, etc.)
    GARBAGE_PATTERNS = [
        r"^(hi|hello|hey|hey jorkel|hi jorkel|hey jim|hi jim)[\s!.]*$",
        r"^(thanks|thank you|thx|ty)[\s!.]*$",
        r"^(ok|okay|sure|yes|no|yep|nope|yeah|nah)[\s!.]*$",
        r"^(good morning|good night|gm|gn)[\s!.]*$",
        r"^(got it|understood|makes sense)[\s!.]*$",
        r"^(what time is it|what's the time)[\s?]*$",
        r"^(bye|goodbye|see you|later)[\s!.]*$",
        r"^(cool|nice|great|awesome)[\s!.]*$",
    ]

    # Keywords that boost importance to PERMANENT (9-10)
    HIGH_IMPORTANCE_KEYWORDS = [
        # Clients
        "mary", "client", "customer",
        # Financial
        "dollar", "payment", "invoice", "budget", "cost", "price", "money",
        "revenue", "profit", "expense", "salary", "rate",
        # Urgency
        "deadline", "urgent", "asap", "important", "critical", "priority",
        # Commitments
        "promise", "commit", "agree", "contract", "deal", "signed",
        # Credentials (should remember these were mentioned, not the actual values)
        "password", "api key", "credential", "secret", "token",
        # Decisions
        "decided", "decision", "choose", "chose", "going with", "final",
        # Personal facts
        "my name", "i live", "my wife", "my husband", "my kid", "birthday",
        "allergic", "prefer", "hate", "love",
        # Projects
        "noctworks", "project", "launch", "release", "deploy",
    ]

    # Topics to extract for categorization
    TOPIC_PATTERNS = {
        "client": r"\b(client|customer|mary)\b",
        "financial": r"\b(money|dollar|payment|invoice|budget|\$\d+|revenue|cost)\b",
        "deadline": r"\b(deadline|due date|by \w+day|urgent|asap)\b",
        "technical": r"\b(code|bug|error|api|database|server|deploy)\b",
        "meeting": r"\b(meeting|call|zoom|schedule|calendar)\b",
        "task": r"\b(todo|task|need to|have to|should|must)\b",
        "personal": r"\b(remember|preference|always|never|i like|i hate)\b",
        "credential": r"\b(password|api.?key|token|secret|credential)\b",
    }

    def __init__(
        self,
        storage_path: str = "data/memory.json",
        prune_interval_hours: int = 6
    ):
        self.storage_path = Path(storage_path)
        self.storage_path.parent.mkdir(parents=True, exist_ok=True)
        self.entries: List[MemoryEntry] = []
        self.prune_interval = timedelta(hours=prune_interval_hours)
        self.last_prune = datetime.now()

        self._load()
        logger.info(f"MemoryManager initialized with {len(self.entries)} entries")

    def _generate_id(self, content: str, timestamp: str) -> str:
        """Generate unique ID for entry."""
        return hashlib.md5(f"{content}{timestamp}".encode()).hexdigest()[:12]

    def _is_garbage(self, content: str) -> bool:
        """Check if content matches garbage patterns."""
        content_lower = content.lower().strip()

        # Very short messages with no substance
        word_count = len(content_lower.split())
        if word_count < 5 and not any(
            kw in content_lower for kw in self.HIGH_IMPORTANCE_KEYWORDS
        ):
            # Check if it's a short but potentially important phrase
            if not re.search(r"\$\d+|\d{4}-\d{2}-\d{2}|@\w+", content_lower):
                return True

        # Matches garbage patterns
        for pattern in self.GARBAGE_PATTERNS:
            if re.match(pattern, content_lower, re.IGNORECASE):
                return True

        return False

    def _extract_topics(self, content: str) -> List[str]:
        """Extract topics from content."""
        topics = []
        content_lower = content.lower()

        for topic, pattern in self.TOPIC_PATTERNS.items():
            if re.search(pattern, content_lower, re.IGNORECASE):
                topics.append(topic)

        return topics

    def _score_importance(self, content: str, role: str) -> int:
        """
        Score content importance 1-10.

        1-2: Garbage (greetings, acknowledgments)
        3-5: Short-term (general Q&A)
        6-8: Long-term (action items, solutions)
        9-10: Permanent (client info, decisions, credentials)
        """
        content_lower = content.lower()

        # Garbage = 1-2
        if self._is_garbage(content):
            return 1

        score = 5  # Base score

        # Boost for high-importance keywords
        keyword_matches = sum(
            1 for kw in self.HIGH_IMPORTANCE_KEYWORDS
            if kw in content_lower
        )
        score += min(keyword_matches * 2, 4)  # Max +4 from keywords

        # Boost for longer, substantive content
        word_count = len(content.split())
        if word_count > 50:
            score += 1
        if word_count > 100:
            score += 1

        # Boost for questions (might contain important context)
        if "?" in content and word_count > 10:
            score += 1

        # Boost for numbers (often important: dates, amounts, etc.)
        if re.search(r"\$\d+|\d{4}|\d+%", content):
            score += 1

        # Boost for explicit "remember" requests
        if re.search(r"\b(remember|don't forget|note that|important)\b", content_lower):
            score += 2

        # Credential mentions are always high importance
        if re.search(r"\b(password|api.?key|token|secret)\b", content_lower):
            score = max(score, 9)

        # Cap at 10
        return min(score, 10)

    def _get_expiration(self, importance: int) -> Optional[str]:
        """Get expiration datetime based on importance."""
        now = datetime.now()

        if importance >= 9:
            return None  # Permanent
        elif importance >= 6:
            return (now + timedelta(days=30)).isoformat()
        elif importance >= 3:
            return (now + timedelta(days=7)).isoformat()
        else:
            return (now + timedelta(hours=24)).isoformat()

    def add(self, role: str, content: str, force_importance: int = None) -> MemoryEntry:
        """
        Add entry to memory with auto-scoring.

        Args:
            role: "user", "assistant", or "system"
            content: Message content
            force_importance: Override auto-scoring (optional)

        Returns:
            The created MemoryEntry
        """
        timestamp = datetime.now().isoformat()

        importance = force_importance if force_importance is not None else self._score_importance(content, role)
        topics = self._extract_topics(content)
        expires_at = self._get_expiration(importance)

        entry = MemoryEntry(
            id=self._generate_id(content, timestamp),
            timestamp=timestamp,
            role=role,
            content=content,
            importance=importance,
            topics=topics,
            expires_at=expires_at
        )

        self.entries.append(entry)
        logger.debug(f"Added memory: importance={importance}, topics={topics}, expires={expires_at}")

        self._maybe_prune()
        self._save()

        return entry

    def _maybe_prune(self):
        """Prune if enough time has passed."""
        if datetime.now() - self.last_prune > self.prune_interval:
            self.prune()

    def prune(self) -> int:
        """Remove expired entries. Returns count of pruned entries."""
        now = datetime.now()
        before_count = len(self.entries)

        self.entries = [
            e for e in self.entries
            if e.expires_at is None or datetime.fromisoformat(e.expires_at) > now
        ]

        pruned = before_count - len(self.entries)
        if pruned > 0:
            logger.info(f"Pruned {pruned} expired entries")

        self.last_prune = now
        self._save()
        return pruned

    def get_recent(self, n: int = 20, min_importance: int = 1) -> List[Dict]:
        """Get recent entries above importance threshold."""
        filtered = [e for e in self.entries if e.importance >= min_importance]
        recent = sorted(filtered, key=lambda e: e.timestamp, reverse=True)[:n]
        return [{"role": e.role, "content": e.content} for e in reversed(recent)]

    def get_by_topic(self, topic: str, limit: int = 10) -> List[MemoryEntry]:
        """Get entries by topic."""
        matches = [e for e in self.entries if topic in e.topics]
        return sorted(matches, key=lambda e: e.timestamp, reverse=True)[:limit]

    def get_high_importance(self, min_score: int = 8) -> List[MemoryEntry]:
        """Get all high-importance entries (for context building)."""
        return [e for e in self.entries if e.importance >= min_score]

    def search(self, query: str, limit: int = 10) -> List[MemoryEntry]:
        """Simple keyword search."""
        query_lower = query.lower()
        matches = [
            e for e in self.entries
            if query_lower in e.content.lower()
        ]
        return sorted(matches, key=lambda e: e.importance, reverse=True)[:limit]

    def get_context_summary(self) -> str:
        """
        Build context summary from high-importance memories.
        Used to seed Jorkel's context window.
        """
        important = self.get_high_importance(min_score=8)

        if not important:
            return "No critical memories stored yet."

        summary_parts = ["Key memories:"]

        for entry in important[-20:]:  # Last 20 important items
            date = entry.timestamp.split("T")[0]
            # Truncate long content
            content_preview = entry.content[:200]
            if len(entry.content) > 200:
                content_preview += "..."
            summary_parts.append(f"- [{date}] {content_preview}")

        return "\n".join(summary_parts)

    def force_remember(self, content: str, topics: List[str] = None) -> MemoryEntry:
        """Force-add something as permanent memory."""
        entry = self.add("system", content, force_importance=10)
        if topics:
            entry.topics = topics
            self._save()
        logger.info(f"Force remembered: {content[:50]}...")
        return entry

    def forget(self, entry_id: str) -> bool:
        """Manually remove an entry. Returns True if found and removed."""
        before = len(self.entries)
        self.entries = [e for e in self.entries if e.id != entry_id]
        removed = len(self.entries) < before
        if removed:
            self._save()
            logger.info(f"Forgot entry: {entry_id}")
        return removed

    def forget_last(self) -> Optional[MemoryEntry]:
        """Remove the most recent entry. Returns the removed entry."""
        if not self.entries:
            return None
        entry = self.entries.pop()
        self._save()
        logger.info(f"Forgot last entry: {entry.id}")
        return entry

    def stats(self) -> Dict:
        """Get memory statistics."""
        now = datetime.now()

        permanent = len([e for e in self.entries if e.expires_at is None])
        expiring_soon = len([
            e for e in self.entries
            if e.expires_at and datetime.fromisoformat(e.expires_at) < now + timedelta(days=1)
        ])

        by_importance = {}
        for i in range(1, 11):
            count = len([e for e in self.entries if e.importance == i])
            if count > 0:
                by_importance[i] = count

        by_topic = {}
        for entry in self.entries:
            for topic in entry.topics:
                by_topic[topic] = by_topic.get(topic, 0) + 1

        return {
            "total_entries": len(self.entries),
            "permanent": permanent,
            "expiring_24h": expiring_soon,
            "by_importance": by_importance,
            "by_topic": by_topic
        }

    def _save(self):
        """Save to disk."""
        data = [asdict(e) for e in self.entries]
        self.storage_path.write_text(json.dumps(data, indent=2))

    def _load(self):
        """Load from disk."""
        if not self.storage_path.exists():
            return

        try:
            data = json.loads(self.storage_path.read_text())
            self.entries = [MemoryEntry(**e) for e in data]
            self.prune()  # Clean up on load
        except Exception as e:
            logger.error(f"Failed to load memory: {e}")
