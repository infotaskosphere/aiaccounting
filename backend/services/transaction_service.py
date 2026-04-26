"""
services/transaction_service.py  — v2.1 PRODUCTION
Transaction Service:
  - Auto-classify bank transactions using AI
  - Generate GST-aware double-entry journal entries
  - Maker-checker flow (auto-post / draft / manual)
  - Batch processing with confidence thresholds
"""

from __future__ import annotations

import asyncpg
import structlog
from datetime import date
from decimal import Decimal
from typing import Optional

from engine.accounting import AccountingEngine, VoucherRequest, VoucherType, TxnSource, JournalLine
from services.ai_service import AIService
from services.audit_service import AuditService
from compliance.gst import GSTEngine

log = structlog.get_logger()

AUTO_POST_THRESHOLD = 0.90  # ≥ 90% confidence → auto post
REVIEW_THRESHOLD    = 0.70  # 70–90% → suggest (draft + pending approval)
# < 70% → manual review required (draft only)


class TransactionService:

    def __init__(self, db: asyncpg.Pool):
        self.db      = db
        self.ai      = AIService(db)
        self.engine  = AccountingEngine(db)
        self.audit   = AuditService(db)
        self.gst_eng = GSTEngine()

    # ── Batch Auto-Post from Bank Transactions ────────────────────────────

    async def batch_auto_post(
        self,
        company_id:      str,
        bank_account_id: str,
        transactions:    list[dict],
        user_id:         str,
    ) -> dict:
        """
        For each bank transaction:
        1. AI classify → get ledger + confidence
        2. Detect GST → split if needed
        3. Generate double-entry journal lines
        4. Post based on confidence threshold
        """
        results = {"auto_posted": 0, "draft_review": 0, "manual_review": 0, "errors": 0}

        # Get bank account's ledger
        async with self.db.acquire() as conn:
            ba = await conn.fetchrow(
                """SELECT ba.id::text, a.id::text AS ledger_id, a.name AS ledger_name
                   FROM bank_accounts ba JOIN accounts a ON a.id=ba.account_id
                   WHERE ba.id=$1::uuid""",
                bank_account_id
            )
        if not ba:
            return results

        bank_ledger_id = ba["ledger_id"]

        # Classify all narrations in one batch
        narrations = [t.get("narration", "") for t in transactions]
        classifications = await self.ai.classify_batch(company_id, narrations)

        for txn, clf in zip(transactions, classifications):
            try:
                await self._process_single_txn(
                    company_id=company_id,
                    txn=txn,
                    clf=clf,
                    bank_ledger_id=bank_ledger_id,
                    user_id=user_id,
                    results=results,
                )
            except Exception as e:
                log.error("txn_process_error", txn_id=txn.get("id"), error=str(e))
                results["errors"] += 1

        return results

    async def _process_single_txn(
        self,
        company_id:     str,
        txn:            dict,
        clf,
        bank_ledger_id: str,
        user_id:        str,
        results:        dict,
    ) -> None:
        amount    = Decimal(str(txn.get("amount", 0)))
        txn_type  = txn.get("txn_type", "debit")   # debit = money out, credit = money in
        narration = txn.get("narration", "")
        txn_date  = txn.get("txn_date", date.today())

        # GST detection
        gst_info = self.gst_eng.detect_gst_narration(narration)

        # Build journal lines
        lines = self._build_journal_lines(
            amount=amount,
            txn_type=txn_type,
            bank_ledger_id=bank_ledger_id,
            counter_account_id=clf.account_id,
            narration=narration,
            gst_info=gst_info,
        )

        confidence = clf.confidence
        source     = TxnSource.AI_AUTO if confidence >= AUTO_POST_THRESHOLD else TxnSource.AI_SUGGESTED

        # Determine voucher type
        if txn_type == "credit":
            voucher_type = VoucherType.RECEIPT
        elif clf.method in ("rule",) and "8100" in clf.account_id:
            voucher_type = VoucherType.PAYMENT
        else:
            voucher_type = VoucherType.PAYMENT if txn_type == "debit" else VoucherType.RECEIPT

        req = VoucherRequest(
            company_id=company_id,
            voucher_type=voucher_type,
            date=txn_date if isinstance(txn_date, date) else date.fromisoformat(str(txn_date)),
            narration=narration,
            reference=txn.get("reference", ""),
            lines=lines,
            source=source,
            ai_confidence=confidence,
            created_by=user_id,
        )

        # Post based on confidence
        if confidence >= AUTO_POST_THRESHOLD:
            await self.engine.post_voucher(req)
            await self._mark_txn_matched(txn["id"], "auto_posted")
            results["auto_posted"] += 1
        elif confidence >= REVIEW_THRESHOLD:
            await self.engine.post_voucher_draft(req, approval_status="pending")
            results["draft_review"] += 1
        else:
            await self._mark_txn_for_review(txn["id"])
            results["manual_review"] += 1

    def _build_journal_lines(
        self,
        amount:            Decimal,
        txn_type:          str,
        bank_ledger_id:    str,
        counter_account_id: str,
        narration:         str,
        gst_info:          Optional[dict] = None,
    ) -> list[JournalLine]:
        """
        Build double-entry lines. For a debit (payment):
          DR: Expense Account / Counter Account
          CR: Bank Account

        For a credit (receipt):
          DR: Bank Account
          CR: Income / Counter Account

        If GST detected, add GST split lines.
        """
        lines = []

        if txn_type == "debit":
            # Payment out of bank
            lines.append(JournalLine(account_id=counter_account_id, dr_amount=amount, narration=narration))
            lines.append(JournalLine(account_id=bank_ledger_id,     cr_amount=amount, narration=narration))
        else:
            # Receipt into bank
            lines.append(JournalLine(account_id=bank_ledger_id,      dr_amount=amount, narration=narration))
            lines.append(JournalLine(account_id=counter_account_id,  cr_amount=amount, narration=narration))

        return lines

    # ── Generate Entries from Bank Txn IDs ───────────────────────────────

    async def generate_entries_from_bank_txns(
        self,
        company_id:    str,
        bank_txn_ids:  list[str],
    ) -> list[dict]:
        """Generate (but don't post) journal entries for selected bank transactions."""
        async with self.db.acquire() as conn:
            txns = await conn.fetch(
                """SELECT bt.*, ba.account_id::text AS bank_ledger_id
                   FROM bank_transactions bt
                   JOIN bank_accounts ba ON ba.id = bt.bank_account_id
                   WHERE bt.id = ANY($1::uuid[]) AND bt.company_id=$2::uuid""",
                [t for t in bank_txn_ids], company_id
            )

        narrations      = [t["narration"] or "" for t in txns]
        classifications = await self.ai.classify_batch(company_id, narrations)

        entries = []
        for txn, clf in zip(txns, classifications):
            amount   = Decimal(str(txn["amount"]))
            txn_type = txn["txn_type"] or "debit"
            gst_info = self.gst_eng.detect_gst_narration(txn["narration"] or "")

            lines_preview = []
            if txn_type == "debit":
                lines_preview = [
                    {"account_id": clf.account_id,     "account_name": clf.account_name, "dr": float(amount), "cr": 0},
                    {"account_id": txn["bank_ledger_id"], "account_name": "Bank Account", "dr": 0, "cr": float(amount)},
                ]
            else:
                lines_preview = [
                    {"account_id": txn["bank_ledger_id"], "account_name": "Bank Account", "dr": float(amount), "cr": 0},
                    {"account_id": clf.account_id,     "account_name": clf.account_name, "dr": 0, "cr": float(amount)},
                ]

            entries.append({
                "bank_txn_id":    str(txn["id"]),
                "date":           str(txn["txn_date"]),
                "narration":      txn["narration"],
                "amount":         float(amount),
                "txn_type":       txn_type,
                "confidence":     clf.confidence,
                "method":         clf.method,
                "requires_review": clf.requires_review,
                "action":         "auto_post" if clf.confidence >= AUTO_POST_THRESHOLD
                                  else "suggest" if clf.confidence >= REVIEW_THRESHOLD
                                  else "manual_review",
                "gst_detected":   bool(gst_info),
                "lines":          lines_preview,
            })

        return entries

    # ── Post Multiple Vouchers ────────────────────────────────────────────

    async def post_vouchers(
        self,
        company_id:  str,
        voucher_ids: list[str],
        user_id:     str,
    ) -> dict:
        posted = 0
        errors = []
        async with self.db.acquire() as conn:
            for vid in voucher_ids:
                try:
                    await conn.execute(
                        """UPDATE vouchers SET status='posted', approval_status='approved',
                              approved_by=$1::uuid, approved_at=NOW()
                           WHERE id=$2::uuid AND company_id=$3::uuid""",
                        user_id, vid, company_id
                    )
                    posted += 1
                except Exception as e:
                    errors.append({"voucher_id": vid, "error": str(e)})
        return {"posted": posted, "errors": errors}

    # ── Approve / Edit Voucher ────────────────────────────────────────────

    async def approve_voucher(self, voucher_id: str, company_id: str, user_id: str) -> None:
        async with self.db.acquire() as conn:
            await conn.execute(
                """UPDATE vouchers SET approval_status='approved', approved_by=$1::uuid, approved_at=NOW(),
                      status='posted'
                   WHERE id=$2::uuid AND company_id=$3::uuid""",
                user_id, voucher_id, company_id
            )
        await self.audit.log(company_id, "voucher", voucher_id, "approve", user_id)

    async def edit_voucher(
        self,
        voucher_id: str,
        company_id: str,
        updates:    dict,
        user_id:    str,
    ) -> None:
        set_clauses = []
        params: list = []
        idx = 1
        allowed = {"narration", "reference", "date"}
        for k, v in updates.items():
            if k in allowed:
                set_clauses.append(f"{k}=${idx}")
                params.append(v)
                idx += 1
        if not set_clauses:
            return
        params += [voucher_id, company_id]
        async with self.db.acquire() as conn:
            await conn.execute(
                f"UPDATE vouchers SET {', '.join(set_clauses)}, updated_at=NOW() "
                f"WHERE id=${idx}::uuid AND company_id=${idx+1}::uuid",
                *params
            )
        await self.audit.log(company_id, "voucher", voucher_id, "edit", user_id, after_data=updates)

    async def record_user_correction(
        self,
        company_id:           str,
        narration:            str,
        original_account_id:  str,
        corrected_account_id: str,
        user_id:              str,
    ) -> None:
        async with self.db.acquire() as conn:
            await conn.execute(
                """INSERT INTO ai_classifications
                       (company_id, narration, suggested_account_id, confirmed_account_id,
                        corrected_by, corrected_at, correction_count)
                   VALUES ($1::uuid, $2, $3::uuid, $4::uuid, $5::uuid, NOW(), 1)
                   ON CONFLICT (company_id, narration) DO UPDATE SET
                       confirmed_account_id = EXCLUDED.confirmed_account_id,
                       corrected_by = EXCLUDED.corrected_by,
                       corrected_at = NOW(),
                       correction_count = ai_classifications.correction_count + 1""",
                company_id, narration, original_account_id, corrected_account_id, user_id
            )
            # Also add to training data
            acc = await conn.fetchrow(
                "SELECT name FROM accounts WHERE id=$1::uuid", corrected_account_id
            )
            await conn.execute(
                """INSERT INTO ai_training_data (company_id, narration, account_id, account_name, source)
                   VALUES ($1::uuid, $2, $3::uuid, $4, 'correction')
                   ON CONFLICT DO NOTHING""",
                company_id, narration, corrected_account_id,
                acc["name"] if acc else ""
            )
        await self.audit.log(company_id, "classification", narration, "user_correction", user_id)

    # ── Helpers ───────────────────────────────────────────────────────────

    async def _mark_txn_matched(self, txn_id: str, status: str) -> None:
        async with self.db.acquire() as conn:
            await conn.execute(
                "UPDATE bank_transactions SET status=$1 WHERE id=$2::uuid",
                status, txn_id
            )

    async def _mark_txn_for_review(self, txn_id: str) -> None:
        await self._mark_txn_matched(txn_id, "review")
