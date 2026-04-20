"""
services/ai_service.py
-----------------------
AI service layer: wraps TransactionClassifier with DB-backed
dynamic learning, confidence scoring, and ledger suggestion APIs.
"""

from __future__ import annotations

import asyncpg
import structlog
from typing import Optional
from dataclasses import dataclass

log = structlog.get_logger()


@dataclass
class ClassificationResult:
    account_id: str
    account_name: str
    confidence: float
    method: str           # exact | rule | embedding | fallback
    requires_review: bool
    alternatives: list[dict] | None = None  # top-3 alternative suggestions


class AIService:
    """
    Database-backed wrapper around TransactionClassifier.
    Adds dynamic learning, confidence calibration, and suggestion APIs.
    """

    # Confidence thresholds
    HIGH_CONFIDENCE = 0.85   # auto-post without review
    MID_CONFIDENCE  = 0.65   # post as draft, flag for review
    LOW_CONFIDENCE  = 0.00   # always requires human review

    def __init__(self, db: asyncpg.Pool, classifier=None):
        self.db = db
        self._classifier = classifier  # injected from app.state

    def set_classifier(self, classifier) -> None:
        self._classifier = classifier

    # ── Single classification ─────────────────────────────────────────────

    async def classify_single(
        self,
        company_id: str,
        narration: str,
    ) -> ClassificationResult:
        results = await self.classify_batch(company_id, [narration])
        return results[0]

    # ── Batch classification ──────────────────────────────────────────────

    async def classify_batch(
        self,
        company_id: str,
        narrations: list[str],
    ) -> list[ClassificationResult]:
        clf = self._classifier
        if clf is None:
            raise RuntimeError("AI classifier not initialised")

        # Load live accounts + learned mappings from DB
        async with self.db.acquire() as conn:
            accounts = await conn.fetch(
                "SELECT id::text, code, name, nature FROM accounts "
                "WHERE company_id=$1 AND is_active=TRUE",
                company_id
            )
            mappings = await conn.fetch(
                "SELECT narration, confirmed_account_id::text FROM ai_classifications "
                "WHERE company_id=$1 AND confirmed_account_id IS NOT NULL",
                company_id
            )

        clf.load_accounts([dict(a) for a in accounts])
        clf.load_learned_mappings([dict(m) for m in mappings])

        raw = clf.classify_batch(narrations)

        results = []
        for r in raw:
            confidence = r.confidence
            requires_review = confidence < self.HIGH_CONFIDENCE

            # Persist classification suggestion to DB for learning
            await self._persist_suggestion(company_id, r.account_id, confidence)

            results.append(ClassificationResult(
                account_id=r.account_id,
                account_name=r.account_name,
                confidence=confidence,
                method=r.method,
                requires_review=requires_review,
            ))

        return results

    # ── Ledger suggestions ────────────────────────────────────────────────

    async def suggest_ledgers(
        self,
        company_id: str,
        narration: str,
        top_n: int = 3,
    ) -> list[dict]:
        """
        Return top-N ledger suggestions for a narration with confidence scores.
        Used in the frontend suggestion UI.
        """
        clf = self._classifier
        if clf is None:
            return []

        async with self.db.acquire() as conn:
            accounts = await conn.fetch(
                "SELECT id::text, code, name, nature, account_type FROM accounts "
                "WHERE company_id=$1 AND is_active=TRUE",
                company_id
            )

        clf.load_accounts([dict(a) for a in accounts])

        # Get primary result
        primary = clf.classify_batch([narration])[0]

        # Build suggestions list
        suggestions = [
            {
                "account_id": primary.account_id,
                "account_name": primary.account_name,
                "confidence": round(primary.confidence, 4),
                "method": primary.method,
                "is_primary": True,
            }
        ]

        # Add top fuzzy alternatives from accounts
        from rapidfuzz import process as fuzz_process
        account_names = {str(a["id"]): a["name"] for a in accounts}
        fuzzy_matches = fuzz_process.extract(
            narration, account_names, limit=top_n + 1
        )
        for name, score, acc_id in fuzzy_matches:
            if acc_id != primary.account_id:
                suggestions.append({
                    "account_id": acc_id,
                    "account_name": name,
                    "confidence": round(score / 100, 4),
                    "method": "fuzzy",
                    "is_primary": False,
                })
            if len(suggestions) >= top_n:
                break

        return suggestions[:top_n]

    # ── Learning feedback ─────────────────────────────────────────────────

    async def record_correction(
        self,
        company_id: str,
        narration: str,
        original_account_id: str,
        corrected_account_id: str,
        user_id: str,
    ) -> None:
        """Persist user correction so the classifier learns from it."""
        async with self.db.acquire() as conn:
            await conn.execute(
                """
                INSERT INTO ai_classifications
                    (company_id, narration, suggested_account_id, confirmed_account_id, corrected_by, corrected_at)
                VALUES ($1, $2, $3, $4, $5, NOW())
                ON CONFLICT (company_id, narration)
                DO UPDATE SET
                    confirmed_account_id = $4,
                    corrected_by         = $5,
                    corrected_at         = NOW(),
                    correction_count     = ai_classifications.correction_count + 1
                """,
                company_id, narration,
                original_account_id, corrected_account_id, user_id
            )
        log.info("ai_correction_recorded", narration=narration[:60])

    # ── Pattern memory stats ──────────────────────────────────────────────

    async def get_learning_stats(self, company_id: str) -> dict:
        """Return stats about AI learning progress for this company."""
        async with self.db.acquire() as conn:
            total = await conn.fetchval(
                "SELECT COUNT(*) FROM ai_classifications WHERE company_id=$1", company_id
            )
            confirmed = await conn.fetchval(
                "SELECT COUNT(*) FROM ai_classifications WHERE company_id=$1 AND confirmed_account_id IS NOT NULL",
                company_id
            )
            corrected = await conn.fetchval(
                "SELECT COUNT(*) FROM ai_classifications WHERE company_id=$1 AND correction_count > 0",
                company_id
            )
            recent = await conn.fetch(
                """
                SELECT narration, a.name AS confirmed_account, correction_count, corrected_at
                FROM ai_classifications c
                JOIN accounts a ON a.id = c.confirmed_account_id
                WHERE c.company_id=$1
                ORDER BY corrected_at DESC LIMIT 10
                """,
                company_id
            )

        return {
            "total_patterns": total,
            "confirmed_patterns": confirmed,
            "user_corrections": corrected,
            "accuracy_rate": round(confirmed / max(total, 1), 4),
            "recent_corrections": [dict(r) for r in recent],
        }

    # ── Anomaly detection ─────────────────────────────────────────────────

    async def detect_anomalies(self, company_id: str, limit: int = 100) -> list[dict]:
        """Detect duplicate transactions and unusual amounts."""
        async with self.db.acquire() as conn:
            dupes = await conn.fetch(
                """
                SELECT narration, amount, txn_date, COUNT(*) AS occurrences
                FROM bank_transactions
                WHERE company_id=$1
                GROUP BY narration, amount, txn_date
                HAVING COUNT(*) > 1
                LIMIT $2
                """,
                company_id, limit
            )
        anomalies = []
        for row in dupes:
            anomalies.append({
                "type": "duplicate",
                "severity": "high",
                "description": f"Transaction '{row['narration']}' for ₹{row['amount']} appears {row['occurrences']} times on {row['txn_date']}",
                "count": row["occurrences"],
            })
        return anomalies

    # ── Internal helpers ──────────────────────────────────────────────────

    async def _persist_suggestion(
        self, company_id: str, account_id: str, confidence: float
    ) -> None:
        """Track suggestion history for analytics."""
        try:
            async with self.db.acquire() as conn:
                await conn.execute(
                    """
                    INSERT INTO ai_suggestion_log (company_id, account_id, confidence, created_at)
                    VALUES ($1, $2, $3, NOW())
                    """,
                    company_id, account_id, confidence
                )
        except Exception:
            pass  # Non-critical — don't break the flow
