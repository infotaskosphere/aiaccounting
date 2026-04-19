"""
engine/accounting.py
--------------------
Phase 2: Core double-entry accounting engine.
Handles:
  - Journal entry creation with Dr/Cr validation
  - Invoice → auto journal entry
  - Bank statement CSV/Excel parser
  - Payment gateway webhook handler
"""

from __future__ import annotations

import csv
import io
import uuid
from dataclasses import dataclass, field
from datetime import date, datetime
from decimal import Decimal, ROUND_HALF_UP
from enum import Enum
from typing import Optional

import asyncpg
import pandas as pd
import pdfplumber
from fastapi import HTTPException


# ── Types ─────────────────────────────────────────────────────────────────────

class VoucherType(str, Enum):
    JOURNAL  = "journal"
    PAYMENT  = "payment"
    RECEIPT  = "receipt"
    SALES    = "sales"
    PURCHASE = "purchase"
    CONTRA   = "contra"

class TxnSource(str, Enum):
    MANUAL          = "manual"
    INVOICE_WEBHOOK = "invoice_webhook"
    BANK_IMPORT     = "bank_import"
    PAYMENT_GATEWAY = "payment_gateway"
    PAYROLL         = "payroll"
    AI_SUGGESTED    = "ai_suggested"


@dataclass
class JournalLine:
    account_id: str
    dr_amount:  Decimal = Decimal("0")
    cr_amount:  Decimal = Decimal("0")
    narration:  str = ""

    def __post_init__(self):
        if self.dr_amount > 0 and self.cr_amount > 0:
            raise ValueError("A line cannot have both Dr and Cr amounts")
        if self.dr_amount == 0 and self.cr_amount == 0:
            raise ValueError("A line must have a non-zero Dr or Cr amount")


@dataclass
class VoucherRequest:
    company_id:    str
    voucher_type:  VoucherType
    date:          date
    narration:     str
    lines:         list[JournalLine]
    reference:     str = ""
    source:        TxnSource = TxnSource.MANUAL
    ai_confidence: Optional[float] = None
    created_by:    Optional[str] = None


@dataclass
class BankTransaction:
    txn_date:   date
    amount:     Decimal
    txn_type:   str      # 'credit' | 'debit'
    narration:  str
    reference:  str = ""
    value_date: Optional[date] = None
    balance:    Optional[Decimal] = None
    raw_data:   dict = field(default_factory=dict)


# ── Accounting Engine ─────────────────────────────────────────────────────────

class AccountingEngine:
    """
    Core double-entry engine. All DB interaction goes through asyncpg.
    Each public method is a single unit of work wrapped in a transaction.
    """

    def __init__(self, pool: asyncpg.Pool):
        self.pool = pool

    # ── Journal Entry ──────────────────────────────────────────────────────

    async def post_voucher(self, req: VoucherRequest) -> str:
        """
        Create a balanced journal entry. Raises if Dr ≠ Cr.
        Returns the new voucher ID.
        """
        self._validate_balance(req.lines)

        async with self.pool.acquire() as conn:
            async with conn.transaction():
                # Generate voucher number
                voucher_no = await conn.fetchval(
                    "SELECT next_voucher_no($1, $2)",
                    req.company_id, req.voucher_type.value
                )

                # Insert voucher header
                voucher_id = await conn.fetchval(
                    """
                    INSERT INTO vouchers
                        (company_id, voucher_no, voucher_type, date, narration,
                         reference, source, ai_confidence, status, created_by)
                    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'posted',$9)
                    RETURNING id
                    """,
                    req.company_id, voucher_no, req.voucher_type.value,
                    req.date, req.narration, req.reference,
                    req.source.value, req.ai_confidence, req.created_by
                )

                # Insert journal lines
                for i, line in enumerate(req.lines):
                    await conn.execute(
                        """
                        INSERT INTO journal_lines
                            (voucher_id, account_id, dr_amount, cr_amount, narration, sequence)
                        VALUES ($1,$2,$3,$4,$5,$6)
                        """,
                        str(voucher_id), line.account_id,
                        line.dr_amount, line.cr_amount, line.narration, i
                    )

                # Audit log
                await conn.execute(
                    """
                    INSERT INTO audit_log (company_id, entity_type, entity_id, action, actor_id)
                    VALUES ($1, 'voucher', $2, $3, $4)
                    """,
                    req.company_id, str(voucher_id),
                    f"create:{req.source.value}", req.created_by
                )

                return str(voucher_id)

    async def reverse_voucher(self, voucher_id: str, user_id: str,
                               reversal_date: Optional[date] = None) -> str:
        """
        Create a mirror-image reversal entry (swap Dr↔Cr).
        Returns the new reversal voucher ID.
        """
        async with self.pool.acquire() as conn:
            # Fetch original
            voucher = await conn.fetchrow(
                "SELECT * FROM vouchers WHERE id=$1 AND status='posted'", voucher_id
            )
            if not voucher:
                raise HTTPException(404, "Voucher not found or already reversed")

            lines = await conn.fetch(
                "SELECT * FROM journal_lines WHERE voucher_id=$1 ORDER BY sequence",
                voucher_id
            )

            # Build reversed lines
            reversed_lines = [
                JournalLine(
                    account_id=str(l["account_id"]),
                    dr_amount=Decimal(str(l["cr_amount"])),
                    cr_amount=Decimal(str(l["dr_amount"])),
                    narration=l["narration"] or ""
                )
                for l in lines
            ]

            rev_req = VoucherRequest(
                company_id=str(voucher["company_id"]),
                voucher_type=VoucherType(voucher["voucher_type"]),
                date=reversal_date or date.today(),
                narration=f"Reversal of {voucher['voucher_no']}",
                lines=reversed_lines,
                source=TxnSource.MANUAL,
                created_by=user_id
            )

            async with conn.transaction():
                rev_id = await self.post_voucher(rev_req)
                await conn.execute(
                    "UPDATE vouchers SET status='reversed', reversed_by=$1 WHERE id=$2",
                    rev_id, voucher_id
                )
                return rev_id

    def _validate_balance(self, lines: list[JournalLine]) -> None:
        total_dr = sum(l.dr_amount for l in lines)
        total_cr = sum(l.cr_amount for l in lines)
        if total_dr != total_cr:
            raise HTTPException(
                400,
                f"Voucher is unbalanced: Dr={total_dr} Cr={total_cr}"
            )
        if len(lines) < 2:
            raise HTTPException(400, "Minimum 2 lines required")

    # ── Invoice Auto-Posting ───────────────────────────────────────────────

    async def post_invoice(self, company_id: str, invoice_data: dict,
                            created_by: Optional[str] = None) -> str:
        """
        Auto-generate journal entry from invoice data.

        Sales invoice:
            Dr  Debtor A/c          (invoice total)
            Cr  Sales A/c           (subtotal)
            Cr  Output CGST         (cgst)
            Cr  Output SGST         (sgst)
            Cr  Output IGST         (igst, if applicable)

        Purchase invoice: mirror of above (Dr Purchase, Dr Input GST, Cr Creditor)
        """
        inv = invoice_data
        inv_type   = inv.get("invoice_type", "sales")   # 'sales' | 'purchase'
        subtotal   = Decimal(str(inv.get("subtotal", 0)))
        cgst       = Decimal(str(inv.get("cgst", 0)))
        sgst       = Decimal(str(inv.get("sgst", 0)))
        igst       = Decimal(str(inv.get("igst", 0)))
        total      = Decimal(str(inv.get("total", 0)))
        party_id   = inv.get("party_account_id")

        # Resolve system account IDs for this company
        accounts = await self._get_system_accounts(company_id)

        lines: list[JournalLine] = []

        if inv_type == "sales":
            # Dr Debtor
            lines.append(JournalLine(account_id=party_id or accounts["sundry_debtors"],
                                     dr_amount=total))
            # Cr Sales
            lines.append(JournalLine(account_id=accounts["sales_services"],
                                     cr_amount=subtotal,
                                     narration="Sales"))
            if cgst > 0:
                lines.append(JournalLine(account_id=accounts["output_cgst"],
                                         cr_amount=cgst, narration="Output CGST"))
            if sgst > 0:
                lines.append(JournalLine(account_id=accounts["output_sgst"],
                                         cr_amount=sgst, narration="Output SGST"))
            if igst > 0:
                lines.append(JournalLine(account_id=accounts["output_igst"],
                                         cr_amount=igst, narration="Output IGST"))
            voucher_type = VoucherType.SALES

        else:  # purchase
            # Dr Purchase
            lines.append(JournalLine(account_id=accounts["purchase_goods"],
                                     dr_amount=subtotal, narration="Purchase"))
            if cgst > 0:
                lines.append(JournalLine(account_id=accounts["input_cgst"],
                                         dr_amount=cgst, narration="Input CGST"))
            if sgst > 0:
                lines.append(JournalLine(account_id=accounts["input_sgst"],
                                         dr_amount=sgst, narration="Input SGST"))
            if igst > 0:
                lines.append(JournalLine(account_id=accounts["input_igst"],
                                         dr_amount=igst, narration="Input IGST"))
            # Cr Creditor
            lines.append(JournalLine(account_id=party_id or accounts["sundry_creditors"],
                                     cr_amount=total))
            voucher_type = VoucherType.PURCHASE

        req = VoucherRequest(
            company_id=company_id,
            voucher_type=voucher_type,
            date=date.fromisoformat(inv["invoice_date"]),
            narration=f"Invoice {inv.get('invoice_no', '')} - {inv.get('party_name', '')}",
            reference=inv.get("invoice_no", ""),
            lines=lines,
            source=TxnSource.INVOICE_WEBHOOK,
            created_by=created_by
        )

        return await self.post_voucher(req)

    async def _get_system_accounts(self, company_id: str) -> dict[str, str]:
        """Fetch critical system account IDs by code."""
        async with self.pool.acquire() as conn:
            rows = await conn.fetch(
                "SELECT code, id FROM accounts WHERE company_id=$1 AND is_system=TRUE",
                company_id
            )
            code_map = {r["code"]: str(r["id"]) for r in rows}

        return {
            "sundry_debtors":   code_map.get("1100", ""),
            "sundry_creditors": code_map.get("3001", ""),
            "input_cgst":       code_map.get("1300", ""),
            "input_sgst":       code_map.get("1301", ""),
            "input_igst":       code_map.get("1302", ""),
            "output_cgst":      code_map.get("3100", ""),
            "output_sgst":      code_map.get("3101", ""),
            "output_igst":      code_map.get("3102", ""),
            "sales_services":   code_map.get("6002", ""),
            "purchase_goods":   code_map.get("7002", ""),
            "cash":             code_map.get("1001", ""),
        }


# ── Bank Statement Parser ─────────────────────────────────────────────────────

class BankStatementParser:
    """
    Parse bank statements from CSV, Excel, or PDF.
    Returns a list of BankTransaction objects ready for staging.
    """

    # Column name synonyms — map bank-specific headers to our standard names
    COL_ALIASES = {
        "date":      ["date", "txn date", "transaction date", "value date",
                      "posting date", "trans date"],
        "narration": ["narration", "description", "particulars", "remarks",
                      "transaction remarks", "details"],
        "debit":     ["debit", "withdrawal", "dr", "dr amount", "debit amount",
                      "withdrawals (dr)"],
        "credit":    ["credit", "deposit", "cr", "cr amount", "credit amount",
                      "deposits (cr)"],
        "balance":   ["balance", "closing balance", "running balance", "bal"],
        "reference": ["reference", "ref no", "chq/ref no", "cheque no",
                      "transaction id", "utr"],
    }

    def parse_csv(self, content: str | bytes,
                  encoding: str = "utf-8") -> list[BankTransaction]:
        if isinstance(content, bytes):
            content = content.decode(encoding, errors="replace")
        reader = csv.DictReader(io.StringIO(content))
        return self._process_rows(list(reader))

    def parse_excel(self, content: bytes,
                    sheet_name: str = 0,
                    header_row: int = 0) -> list[BankTransaction]:
        df = pd.read_excel(
            io.BytesIO(content),
            sheet_name=sheet_name,
            header=header_row,
            dtype=str
        )
        df.columns = [str(c).strip() for c in df.columns]
        df = df.dropna(how="all")
        return self._process_rows(df.to_dict("records"))

    def parse_pdf(self, content: bytes) -> list[BankTransaction]:
        """
        Extract tables from a bank PDF using pdfplumber.
        Works for most modern bank PDFs (HDFC, SBI, ICICI, Axis).
        For scanned PDFs, use the OCR module in ai/ocr.py.
        """
        rows = []
        with pdfplumber.open(io.BytesIO(content)) as pdf:
            for page in pdf.pages:
                tables = page.extract_tables()
                for table in tables:
                    if not table:
                        continue
                    header = [str(c).strip().lower() if c else "" for c in table[0]]
                    for row in table[1:]:
                        if row:
                            rows.append(dict(zip(header, [str(c) if c else "" for c in row])))
        return self._process_rows(rows)

    def _process_rows(self, rows: list[dict]) -> list[BankTransaction]:
        if not rows:
            return []

        col_map = self._build_column_map(list(rows[0].keys()))
        transactions = []

        for raw in rows:
            try:
                txn = self._parse_row(raw, col_map)
                if txn:
                    transactions.append(txn)
            except Exception:
                continue  # skip unparseable rows (headers, totals, etc.)

        return transactions

    def _parse_row(self, raw: dict, col_map: dict) -> Optional[BankTransaction]:
        def get(key: str) -> str:
            col = col_map.get(key)
            return str(raw.get(col, "")).strip() if col else ""

        date_str   = get("date")
        narration  = get("narration")
        debit_str  = get("debit")
        credit_str = get("credit")
        balance_str= get("balance")
        reference  = get("reference")

        # Skip rows without a date or narration
        if not date_str or not narration or narration.lower() in ("nan", "none", ""):
            return None

        txn_date = self._parse_date(date_str)
        if not txn_date:
            return None

        debit  = self._parse_amount(debit_str)
        credit = self._parse_amount(credit_str)

        if debit == 0 and credit == 0:
            return None

        amount   = debit if debit > 0 else credit
        txn_type = "debit" if debit > 0 else "credit"

        return BankTransaction(
            txn_date=txn_date,
            amount=amount,
            txn_type=txn_type,
            narration=narration,
            reference=reference,
            balance=self._parse_amount(balance_str) if balance_str else None,
            raw_data=raw
        )

    def _build_column_map(self, headers: list[str]) -> dict[str, str]:
        """Map standard field names to actual column headers."""
        normalized = {h.lower().strip(): h for h in headers}
        result = {}
        for field, aliases in self.COL_ALIASES.items():
            for alias in aliases:
                if alias in normalized:
                    result[field] = normalized[alias]
                    break
        return result

    def _parse_date(self, s: str) -> Optional[date]:
        formats = [
            "%d/%m/%Y", "%d-%m-%Y", "%d/%m/%y", "%d-%m-%y",
            "%Y-%m-%d", "%m/%d/%Y", "%d %b %Y", "%d %B %Y",
            "%d-%b-%Y", "%d-%b-%y"
        ]
        s = s.strip()
        for fmt in formats:
            try:
                return datetime.strptime(s, fmt).date()
            except ValueError:
                continue
        return None

    def _parse_amount(self, s: str) -> Decimal:
        if not s or s.lower() in ("nan", "none", "-", ""):
            return Decimal("0")
        # Remove currency symbols, commas, spaces
        cleaned = s.replace(",", "").replace("₹", "").replace("Rs", "").replace(" ", "").strip()
        try:
            return Decimal(cleaned).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        except Exception:
            return Decimal("0")


# ── Payment Gateway Handler ───────────────────────────────────────────────────

class PaymentGatewayHandler:
    """
    Handle Razorpay / Stripe payment webhooks.
    Creates bank receipt entries and reconciles against outstanding invoices.
    """

    def __init__(self, engine: AccountingEngine):
        self.engine = engine

    async def handle_razorpay_payment(self, company_id: str, payload: dict,
                                       user_id: Optional[str] = None) -> Optional[str]:
        """
        Handle Razorpay payment.captured webhook.
        Creates:
            Dr  Bank A/c        (amount)
            Cr  Debtor A/c      (amount)  ← or advance if invoice unknown
        """
        event = payload.get("event", "")
        if event != "payment.captured":
            return None

        payment = payload.get("payload", {}).get("payment", {}).get("entity", {})
        amount_paise = int(payment.get("amount", 0))
        amount_inr   = Decimal(str(amount_paise)) / 100

        notes       = payment.get("notes", {})
        invoice_no  = notes.get("invoice_no", "")
        party_name  = notes.get("party_name", payment.get("email", "Unknown"))
        payment_id  = payment.get("id", "")

        accounts = await self.engine._get_system_accounts(company_id)

        # Resolve debtor account
        party_account_id = await self._find_party_account(
            company_id, party_name
        ) or accounts["sundry_debtors"]

        bank_account_id = await self._get_primary_bank(company_id) or accounts["cash"]

        lines = [
            JournalLine(account_id=bank_account_id, dr_amount=amount_inr),
            JournalLine(account_id=party_account_id, cr_amount=amount_inr),
        ]

        req = VoucherRequest(
            company_id=company_id,
            voucher_type=VoucherType.RECEIPT,
            date=date.today(),
            narration=f"Razorpay payment {payment_id} from {party_name}",
            reference=invoice_no or payment_id,
            lines=lines,
            source=TxnSource.PAYMENT_GATEWAY,
            created_by=user_id
        )

        voucher_id = await self.engine.post_voucher(req)

        # Also handle gateway fee
        fee_paise = int(payment.get("fee", 0))
        if fee_paise > 0:
            await self._post_gateway_fee(
                company_id=company_id,
                fee=Decimal(str(fee_paise)) / 100,
                bank_account_id=bank_account_id,
                accounts=accounts,
                reference=payment_id,
                user_id=user_id
            )

        return voucher_id

    async def _post_gateway_fee(self, company_id: str, fee: Decimal,
                                 bank_account_id: str, accounts: dict,
                                 reference: str, user_id: Optional[str]) -> None:
        lines = [
            JournalLine(account_id=accounts.get("bank_charges",
                        accounts["sundry_debtors"]), dr_amount=fee),
            JournalLine(account_id=bank_account_id, cr_amount=fee),
        ]
        req = VoucherRequest(
            company_id=company_id,
            voucher_type=VoucherType.PAYMENT,
            date=date.today(),
            narration=f"Razorpay gateway fee for {reference}",
            lines=lines,
            source=TxnSource.PAYMENT_GATEWAY,
            created_by=user_id
        )
        await self.engine.post_voucher(req)

    async def _find_party_account(self, company_id: str, name: str) -> Optional[str]:
        async with self.engine.pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT id FROM accounts
                WHERE company_id=$1
                  AND account_type IN ('debtor','creditor')
                  AND LOWER(name) ILIKE $2
                LIMIT 1
                """,
                company_id, f"%{name.lower()}%"
            )
            return str(row["id"]) if row else None

    async def _get_primary_bank(self, company_id: str) -> Optional[str]:
        async with self.engine.pool.acquire() as conn:
            row = await conn.fetchrow(
                "SELECT id FROM accounts WHERE company_id=$1 AND account_type='bank' LIMIT 1",
                company_id
            )
            return str(row["id"]) if row else None


# ── FastAPI Route Wiring ──────────────────────────────────────────────────────
# In your main.py:
#
# from engine.accounting import AccountingEngine, BankStatementParser, PaymentGatewayHandler
#
# @app.post("/api/v1/invoices/webhook")
# async def invoice_webhook(payload: dict, db=Depends(get_pool)):
#     engine = AccountingEngine(db)
#     voucher_id = await engine.post_invoice(
#         company_id=payload["company_id"],
#         invoice_data=payload
#     )
#     return {"voucher_id": voucher_id}
#
# @app.post("/api/v1/bank/import")
# async def bank_import(file: UploadFile, bank_account_id: str, db=Depends(get_pool)):
#     parser = BankStatementParser()
#     content = await file.read()
#     if file.filename.endswith(".csv"):
#         transactions = parser.parse_csv(content)
#     elif file.filename.endswith((".xlsx", ".xls")):
#         transactions = parser.parse_excel(content)
#     else:
#         transactions = parser.parse_pdf(content)
#     # Stage transactions for AI matching...
#     return {"imported": len(transactions)}
