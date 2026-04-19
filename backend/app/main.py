"""
app/main.py
-----------
FastAPI application entrypoint.
All routes, middleware, and startup logic.
"""

from __future__ import annotations

import asyncpg
from contextlib import asynccontextmanager
from typing import AsyncGenerator

from fastapi import FastAPI, Depends, HTTPException, UploadFile, File, Header
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from pydantic_settings import BaseSettings
import structlog

from engine.accounting import (
    AccountingEngine, BankStatementParser,
    PaymentGatewayHandler, VoucherRequest, VoucherType, TxnSource, JournalLine
)
from ai.classifier import TransactionClassifier, ReconciliationEngine, AnomalyDetector
from compliance.gst import GSTEngine, PayrollProcessor

log = structlog.get_logger()


# ── Settings ──────────────────────────────────────────────────────────────────

class Settings(BaseSettings):
    database_url:      str = "postgresql://accounting:password@localhost/accounting"
    redis_url:         str = "redis://localhost:6379/0"
    secret_key:        str = "change-me-in-production"
    razorpay_key:      str = ""
    razorpay_secret:   str = ""
    anthropic_api_key: str = ""
    environment:       str = "development"

    class Config:
        env_file = ".env"

settings = Settings()


# ── Database Pool ─────────────────────────────────────────────────────────────

pool: asyncpg.Pool | None = None

@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator:
    global pool
    pool = await asyncpg.create_pool(
        dsn=settings.database_url.replace("+asyncpg", ""),
        min_size=5,
        max_size=20,
        command_timeout=60
    )
    log.info("Database pool created")

    # Pre-load AI classifier (model download happens at Docker build time)
    app.state.classifier = TransactionClassifier()
    log.info("AI classifier ready")

    yield

    await pool.close()
    log.info("Database pool closed")

async def get_pool() -> asyncpg.Pool:
    return pool


# ── App ───────────────────────────────────────────────────────────────────────

app = FastAPI(
    title="AI Accounting API",
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/api/docs",
    redoc_url="/api/redoc",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],   # React dev server
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Health ────────────────────────────────────────────────────────────────────

@app.get("/health")
async def health(db=Depends(get_pool)):
    async with db.acquire() as conn:
        await conn.fetchval("SELECT 1")
    return {"status": "ok", "environment": settings.environment}


# ── Vouchers ──────────────────────────────────────────────────────────────────

class PostVoucherBody(BaseModel):
    company_id:   str
    voucher_type: str
    date:         str
    narration:    str
    reference:    str = ""
    lines:        list[dict]


@app.post("/api/v1/vouchers")
async def post_voucher(body: PostVoucherBody, db=Depends(get_pool)):
    engine = AccountingEngine(db)
    lines = [
        JournalLine(
            account_id=l["account_id"],
            dr_amount=l.get("dr_amount", 0),
            cr_amount=l.get("cr_amount", 0),
            narration=l.get("narration", "")
        )
        for l in body.lines
    ]
    from datetime import date as date_type
    req = VoucherRequest(
        company_id=body.company_id,
        voucher_type=VoucherType(body.voucher_type),
        date=date_type.fromisoformat(body.date),
        narration=body.narration,
        reference=body.reference,
        lines=lines,
        source=TxnSource.MANUAL
    )
    voucher_id = await engine.post_voucher(req)
    return {"voucher_id": voucher_id}


@app.post("/api/v1/vouchers/{voucher_id}/reverse")
async def reverse_voucher(voucher_id: str, db=Depends(get_pool)):
    engine = AccountingEngine(db)
    rev_id = await engine.reverse_voucher(voucher_id, user_id=None)
    return {"reversal_voucher_id": rev_id}


# ── Invoice Webhook ───────────────────────────────────────────────────────────

@app.post("/api/v1/webhooks/invoice")
async def invoice_webhook(payload: dict, db=Depends(get_pool)):
    """
    Receive invoice from external software (Zoho, Tally, custom).
    Auto-generates journal entry.
    """
    engine = AccountingEngine(db)
    voucher_id = await engine.post_invoice(
        company_id=payload["company_id"],
        invoice_data=payload,
    )
    return {"voucher_id": voucher_id, "status": "posted"}


# ── Bank Statement Import ─────────────────────────────────────────────────────

@app.post("/api/v1/bank/{bank_account_id}/import")
async def import_bank_statement(
    bank_account_id: str,
    file: UploadFile = File(...),
    db=Depends(get_pool)
):
    parser = BankStatementParser()
    content = await file.read()
    filename = file.filename or ""

    if filename.endswith(".csv"):
        transactions = parser.parse_csv(content)
    elif filename.endswith((".xlsx", ".xls")):
        transactions = parser.parse_excel(content)
    elif filename.endswith(".pdf"):
        transactions = parser.parse_pdf(content)
    else:
        raise HTTPException(400, "Unsupported file type. Use CSV, Excel, or PDF.")

    # Stage transactions in DB for AI matching
    async with db.acquire() as conn:
        staged = 0
        for txn in transactions:
            await conn.execute(
                """
                INSERT INTO bank_transactions
                    (bank_account_id, txn_date, amount, txn_type, narration,
                     reference, balance, status, raw_data)
                VALUES ($1,$2,$3,$4,$5,$6,$7,'unmatched',$8)
                ON CONFLICT DO NOTHING
                """,
                bank_account_id, txn.txn_date, txn.amount, txn.txn_type,
                txn.narration, txn.reference, txn.balance,
                str(txn.raw_data)
            )
            staged += 1

    return {"staged": staged, "total_parsed": len(transactions)}


# ── AI Classification ─────────────────────────────────────────────────────────

class ClassifyRequest(BaseModel):
    company_id: str
    narrations: list[str]


@app.post("/api/v1/ai/classify")
async def classify_transactions(body: ClassifyRequest, db=Depends(get_pool)):
    clf: TransactionClassifier = app.state.classifier

    # Load company accounts
    async with db.acquire() as conn:
        accounts = await conn.fetch(
            "SELECT id::text, code, name, nature FROM accounts WHERE company_id=$1 AND is_active=TRUE",
            body.company_id
        )
        mappings = await conn.fetch(
            """
            SELECT narration, confirmed_account_id::text
            FROM ai_classifications
            WHERE company_id=$1 AND confirmed_account_id IS NOT NULL
            """,
            body.company_id
        )

    clf.load_accounts([dict(a) for a in accounts])
    clf.load_learned_mappings([dict(m) for m in mappings])

    results = clf.classify_batch(body.narrations)
    return {
        "results": [
            {
                "narration":      n,
                "account_id":     r.account_id,
                "account_name":   r.account_name,
                "confidence":     r.confidence,
                "method":         r.method,
                "requires_review": r.requires_review,
            }
            for n, r in zip(body.narrations, results)
        ]
    }


# ── Reconciliation ────────────────────────────────────────────────────────────

@app.post("/api/v1/reconcile/{company_id}")
async def auto_reconcile(company_id: str, db=Depends(get_pool)):
    engine = ReconciliationEngine()

    async with db.acquire() as conn:
        bank_txns = await conn.fetch(
            "SELECT * FROM bank_transactions WHERE status='unmatched' LIMIT 500"
        )
        open_vouchers = await conn.fetch(
            """
            SELECT v.id, v.date, v.narration AS party_name, v.reference,
                   SUM(jl.dr_amount) AS total_amount
            FROM vouchers v
            JOIN journal_lines jl ON jl.voucher_id=v.id
            WHERE v.company_id=$1 AND v.status='posted'
            GROUP BY v.id
            """,
            company_id
        )

    matches = engine.match_batch([dict(t) for t in bank_txns],
                                  [dict(v) for v in open_vouchers])

    auto_matched, needs_review = 0, 0
    async with db.acquire() as conn:
        for txn, match in zip(bank_txns, matches):
            if not match:
                continue
            status = "matched" if match.confidence >= 0.85 else "unmatched"
            await conn.execute(
                """
                UPDATE bank_transactions
                SET status=$1, matched_voucher_id=$2, ai_match_confidence=$3
                WHERE id=$4
                """,
                status, match.voucher_id, match.confidence, txn["id"]
            )
            if status == "matched":
                auto_matched += 1
            else:
                needs_review += 1

    return {"auto_matched": auto_matched, "needs_review": needs_review}


# ── Razorpay Webhook ──────────────────────────────────────────────────────────

@app.post("/api/v1/webhooks/razorpay/{company_id}")
async def razorpay_webhook(company_id: str, payload: dict, db=Depends(get_pool)):
    engine = AccountingEngine(db)
    handler = PaymentGatewayHandler(engine)
    voucher_id = await handler.handle_razorpay_payment(company_id, payload)
    return {"voucher_id": voucher_id}


# ── GST Reports ───────────────────────────────────────────────────────────────

@app.get("/api/v1/gst/{company_id}/gstr1/{period}")
async def gstr1_report(company_id: str, period: str, db=Depends(get_pool)):
    """Generate GSTR-1 JSON for filing. period format: MMYYYY"""
    async with db.acquire() as conn:
        company = await conn.fetchrow(
            "SELECT gstin FROM companies WHERE id=$1", company_id
        )
        if not company or not company["gstin"]:
            raise HTTPException(400, "Company GSTIN not configured")

        txns = await conn.fetch(
            "SELECT * FROM gst_transactions WHERE company_id=$1 AND period=$2 AND txn_type='output'",
            company_id, f"{period[2:]}−{period[:2]}"  # convert MMYYYY → YYYY-MM
        )

    gst_engine = GSTEngine()
    # Convert DB rows to GSTTransaction objects (simplified)
    from compliance.gst import GSTTransaction
    from datetime import date
    from decimal import Decimal

    gst_txns = []
    for t in txns:
        gst_txns.append(GSTTransaction(
            party_gstin=t["party_gstin"],
            party_name=t["party_name"] or "",
            invoice_no=t["invoice_id"] or "",
            invoice_date=date.today(),
            place_of_supply=t["place_of_supply"] or "29",
            supply_type=t["supply_type"] or "B2B",
            hsn_sac=t["hsn_sac"],
            taxable_value=Decimal(str(t["taxable_value"])),
            gst_rate=Decimal(str(t["gst_rate"])),
            cgst=Decimal(str(t["cgst"])),
            sgst=Decimal(str(t["sgst"])),
            igst=Decimal(str(t["igst"])),
        ))

    return gst_engine.generate_gstr1(company["gstin"], period, gst_txns)


# ── Payroll ───────────────────────────────────────────────────────────────────

@app.post("/api/v1/payroll/{company_id}/run/{period}")
async def run_payroll(company_id: str, period: str, db=Depends(get_pool)):
    async with db.acquire() as conn:
        employees = await conn.fetch(
            "SELECT * FROM employees WHERE company_id=$1 AND is_active=TRUE",
            company_id
        )

    processor = PayrollProcessor()
    result = processor.process([dict(e) for e in employees], period)

    totals = result["totals"]
    return {
        "period":        period,
        "employee_count": len(result["lines"]),
        "totals": {
            "gross_salary":           str(totals["gross"]),
            "net_payable_to_employees": str(totals["net_payable"]),
            "total_pf":               str(totals["pf_employee"] + totals["pf_employer"]),
            "total_esic":             str(totals["esic_employee"] + totals["esic_employer"]),
            "total_tds":              str(totals["tds"]),
            "cost_to_company":        str(totals["total_cost_to_company"]),
        }
    }


# ── Financials ────────────────────────────────────────────────────────────────

@app.get("/api/v1/reports/{company_id}/trial-balance")
async def trial_balance(company_id: str, db=Depends(get_pool)):
    async with db.acquire() as conn:
        rows = await conn.fetch(
            "SELECT * FROM trial_balance WHERE company_id=$1 ORDER BY nature, code",
            company_id
        )
    return {"trial_balance": [dict(r) for r in rows]}


@app.get("/api/v1/reports/{company_id}/balance-sheet")
async def balance_sheet(company_id: str, db=Depends(get_pool)):
    async with db.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT nature, SUM(closing_balance) AS total
            FROM account_balances
            WHERE company_id=$1
            GROUP BY nature
            """,
            company_id
        )
    result = {r["nature"]: float(r["total"]) for r in rows}
    return {
        "assets":      result.get("asset", 0),
        "liabilities": result.get("liability", 0),
        "equity":      result.get("equity", 0),
        "income":      result.get("income", 0),
        "expenses":    result.get("expense", 0),
        "net_profit":  result.get("income", 0) - result.get("expense", 0),
    }
