"""
app/main.py  (UPGRADED)
-----------
FastAPI application — fully upgraded with:
- Service layer architecture
- AI-first pipeline
- JWT + RBAC authentication
- Smart assistant
- One-click reporting
- Centralized error handling
"""

from __future__ import annotations

import os
import asyncpg
from contextlib import asynccontextmanager
from typing import AsyncGenerator, Optional
from datetime import date

from fastapi import FastAPI, Depends, HTTPException, UploadFile, File, BackgroundTasks, Body
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from pydantic_settings import BaseSettings
import structlog

# ── Services ─────────────────────────────────────────────────────────────────
from services.transaction_service import TransactionService
from services.ai_service import AIService
from services.reconciliation_service import ReconciliationService
from services.reporting_service import ReportingService
from services.ingestion_service import IngestionService
from services.assistant_service import AssistantService, QUICK_QUESTIONS
from services.audit_service import AuditService

# ── Core engine (preserved) ───────────────────────────────────────────────────
from engine.accounting import (
    AccountingEngine, BankStatementParser,
    PaymentGatewayHandler, VoucherRequest, VoucherType, TxnSource, JournalLine
)
from ai.classifier import TransactionClassifier, ReconciliationEngine, AnomalyDetector
from compliance.gst import GSTEngine, PayrollProcessor
from app.auth import (
    create_token, verify_password, hash_password,
    get_current_user, get_company_id, require_role
)
from app.middleware import register_middleware
from app.routes.simple_mode import router as simple_router   # ← FIX: was never imported

log = structlog.get_logger()


# ── Settings ──────────────────────────────────────────────────────────────────

class Settings(BaseSettings):
    database_url:      str = "postgresql://accounting:password@localhost/accounting"
    secret_key:        str = "change-me-in-production"
    razorpay_key:      str = ""
    razorpay_secret:   str = ""
    anthropic_api_key: str = ""
    environment:       str = "development"
    frontend_url:      str = "https://frontendaiaccounting.onrender.com"

    class Config:
        env_file = ".env"
        extra = "ignore"

    @property
    def resolved_db_url(self) -> str:
        return self.database_url.replace("+asyncpg", "").replace("postgres://", "postgresql://")

settings = Settings()


# ── DB Pool ───────────────────────────────────────────────────────────────────

pool: asyncpg.Pool | None = None

@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator:
    global pool
    import asyncio
    dsn = settings.resolved_db_url
    last_error = None
    for attempt in range(1, 6):
        try:
            pool = await asyncpg.create_pool(dsn=dsn, min_size=1, max_size=5, command_timeout=60)
            log.info("db_pool_ready", attempt=attempt)
            last_error = None
            break
        except Exception as exc:
            last_error = exc
            log.warning("db_connect_retry", attempt=attempt, error=str(exc))
            await asyncio.sleep(attempt * 2)

    if last_error:
        raise RuntimeError(f"DB connection failed after 5 attempts: {last_error}") from last_error

    # Init AI classifier
    try:
        app.state.classifier = TransactionClassifier()
        log.info("ai_classifier_ready")
    except Exception as exc:
        app.state.classifier = TransactionClassifier.__new__(TransactionClassifier)
        app.state.classifier.model = None
        app.state.classifier._account_embeddings = {}
        app.state.classifier._account_index = []
        app.state.classifier._learned_map = {}
        log.warning("ai_classifier_fallback", error=str(exc))

    yield
    await pool.close()

async def get_pool() -> asyncpg.Pool:
    return pool


# ── App ───────────────────────────────────────────────────────────────────────

app = FastAPI(
    title="FINIX AI Accounting API",
    version="2.0.0",
    lifespan=lifespan,
    docs_url="/api/docs",
    redoc_url="/api/redoc",
)

register_middleware(app)
app.include_router(simple_router)   # ← FIX: was missing → caused all /api/v1/simple/* 404s

_allowed_origins = list(set(filter(None, [
    "http://localhost:3000",
    "http://localhost:5173",
    "https://frontendaiaccounting.onrender.com",   # ← production frontend on Render
    settings.frontend_url,                          # ← also read from FRONTEND_URL env var
])))

app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Service factory helpers ───────────────────────────────────────────────────

def _txn_service(db):
    svc = TransactionService(db)
    svc.ai.set_classifier(app.state.classifier)
    return svc

def _ai_service(db):
    svc = AIService(db)
    svc.set_classifier(app.state.classifier)
    return svc


# ════════════════════════════════════════════════════════════════════════════
# HEALTH
# ════════════════════════════════════════════════════════════════════════════

@app.get("/health")
async def health(db=Depends(get_pool)):
    async with db.acquire() as conn:
        await conn.fetchval("SELECT 1")
    from ai.classifier import EMBEDDINGS_AVAILABLE, OCR_AVAILABLE
    return {
        "status": "ok",
        "version": "2.0.0",
        "environment": settings.environment,
        "features": {
            "ai_embeddings": EMBEDDINGS_AVAILABLE,
            "ocr": OCR_AVAILABLE,
            "smart_assistant": bool(settings.anthropic_api_key),
            "service_layer": True,
            "rbac": True,
        }
    }


# ════════════════════════════════════════════════════════════════════════════
# AUTHENTICATION
# ════════════════════════════════════════════════════════════════════════════

class LoginRequest(BaseModel):
    email:    str
    password: str

class RegisterRequest(BaseModel):
    email:      str
    password:   str
    name:       str
    company_name: str
    gstin:      Optional[str] = None

@app.post("/api/v1/auth/login")
async def login(body: LoginRequest, db=Depends(get_pool)):
    async with db.acquire() as conn:
        user = await conn.fetchrow(
            "SELECT id::text, company_id::text, role, password_hash, is_active FROM users WHERE email=$1",
            body.email
        )
    if not user or not verify_password(body.password, user["password_hash"]):
        raise HTTPException(401, "Invalid email or password")
    if not user["is_active"]:
        raise HTTPException(403, "Account is disabled")

    token = create_token(user["id"], user["company_id"], user["role"])
    return {
        "access_token": token,
        "token_type":   "bearer",
        "company_id":   user["company_id"],
        "user_role":    user["role"],
    }

@app.post("/api/v1/auth/register")
async def register(body: RegisterRequest, db=Depends(get_pool)):
    async with db.acquire() as conn:
        existing = await conn.fetchval("SELECT id FROM users WHERE email=$1", body.email)
        if existing:
            raise HTTPException(409, "Email already registered")

        # Create company
        company_id = await conn.fetchval(
            "INSERT INTO companies (name, gstin) VALUES ($1, $2) RETURNING id::text",
            body.company_name, body.gstin
        )
        # Create user
        user_id = await conn.fetchval(
            "INSERT INTO users (company_id, email, password_hash, role) VALUES ($1,$2,$3,'owner') RETURNING id::text",
            company_id, body.email, hash_password(body.password)
        )

    token = create_token(user_id, company_id, "owner")
    return {"access_token": token, "token_type": "bearer", "company_id": company_id, "user_role": "owner"}


# ════════════════════════════════════════════════════════════════════════════
# UPLOAD & INGESTION  (Zero manual entry)
# ════════════════════════════════════════════════════════════════════════════

@app.post("/api/v1/upload/bank-statement/{bank_account_id}")
async def upload_bank_statement(
    bank_account_id: str,
    file: UploadFile = File(...),
    background_tasks: BackgroundTasks = BackgroundTasks(),
    db=Depends(get_pool),
    user: dict = Depends(get_current_user),
):
    """Upload bank statement (CSV/Excel/PDF). Auto-parses and stages transactions."""
    company_id = user["company_id"]
    content    = await file.read()
    service    = IngestionService(db)

    result = await service.ingest_bank_statement(
        company_id=company_id,
        bank_account_id=bank_account_id,
        file_content=content,
        filename=file.filename or "",
        user_id=user["sub"],
    )

    # Trigger auto-classification in background
    background_tasks.add_task(
        _background_classify, company_id, bank_account_id, db, user["sub"]
    )

    return {"success": True, "data": result}

@app.post("/api/v1/bank/parse-statement")
async def ai_parse_bank_statement(
    file: UploadFile = File(...),
    user: dict = Depends(get_current_user),
):
    """
    Parse any bank statement (PDF/CSV/Excel) using the built-in AI engine.
    NO external AI API — fully self-contained using pdfplumber + rule-based classifier.
    """
    from ai.engine import parse_and_classify_statement

    content  = await file.read()
    filename = file.filename or "statement.pdf"

    try:
        result = parse_and_classify_statement(content, filename)
        return {"success": True, "data": result}
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Parse error: {str(e)[:300]}")


@app.post("/api/v1/upload/invoice")
async def upload_invoice(
    file: UploadFile = File(...),
    invoice_type: str = "sales",
    db=Depends(get_pool),
    user: dict = Depends(get_current_user),
):
    """Upload invoice (PDF/Excel). Auto-extracts data and queues journal entry."""
    company_id = user["company_id"]
    content    = await file.read()
    service    = IngestionService(db)

    result = await service.ingest_invoice(
        company_id=company_id,
        file_content=content,
        filename=file.filename or "",
        invoice_type=invoice_type,
        user_id=user["sub"],
    )
    return {"success": True, "data": result}


# ── AI Invoice Parser (browser-safe — used by Journal.jsx) ───────────────────
@app.post("/api/v1/invoice/parse")
async def ai_parse_invoice(
    file: UploadFile = File(...),
    user: dict = Depends(get_current_user),
):
    """
    Parse invoice (PDF/image) using built-in engine.
    NO external AI API — uses pdfplumber + regex for field extraction.
    """
    from ai.engine import parse_invoice_file

    content  = await file.read()
    filename = file.filename or "invoice.pdf"

    try:
        data = parse_invoice_file(content, filename)
        return {"success": True, "data": data}
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Invoice parse error: {str(e)[:200]}")


async def _background_classify(company_id: str, bank_account_id: str, db, user_id: str):
    """Background task: classify staged transactions."""
    try:
        svc = _txn_service(db)
        async with db.acquire() as conn:
            txns = await conn.fetch(
                "SELECT * FROM bank_transactions WHERE bank_account_id=$1 AND status='unmatched' LIMIT 200",
                bank_account_id
            )
        if txns:
            await svc.batch_auto_post(company_id, bank_account_id, [dict(t) for t in txns], user_id)
            log.info("background_classify_done", count=len(txns))
    except Exception as exc:
        log.error("background_classify_failed", error=str(exc))


# ════════════════════════════════════════════════════════════════════════════
# AI CLASSIFICATION & LEARNING
# ════════════════════════════════════════════════════════════════════════════

class ClassifyRequest(BaseModel):
    narrations: list[str] = Field(..., min_length=1, max_length=100)

class CorrectionRequest(BaseModel):
    narration:             str
    original_account_id:   str
    corrected_account_id:  str

@app.post("/api/v1/ai/classify")
async def classify(
    body: ClassifyRequest,
    db=Depends(get_pool),
    user: dict = Depends(get_current_user),
):
    svc = _ai_service(db)
    results = await svc.classify_batch(user["company_id"], body.narrations)
    return {
        "success": True,
        "results": [
            {
                "narration":       n,
                "account_id":      r.account_id,
                "account_name":    r.account_name,
                "confidence":      r.confidence,
                "method":          r.method,
                "requires_review": r.requires_review,
            }
            for n, r in zip(body.narrations, results)
        ]
    }

@app.post("/api/v1/ai/correct")
async def correct_classification(
    body: CorrectionRequest,
    db=Depends(get_pool),
    user: dict = Depends(get_current_user),
):
    """User correction — retrains the AI classifier dynamically."""
    svc = _ai_service(db)
    await svc.record_correction(
        company_id=user["company_id"],
        narration=body.narration,
        original_account_id=body.original_account_id,
        corrected_account_id=body.corrected_account_id,
        user_id=user["sub"],
    )
    return {"success": True, "message": "Correction recorded. AI will learn from this."}

@app.get("/api/v1/ai/suggest-ledger")
async def suggest_ledger(
    narration: str,
    db=Depends(get_pool),
    user: dict = Depends(get_current_user),
):
    svc = _ai_service(db)
    suggestions = await svc.suggest_ledgers(user["company_id"], narration)
    return {"success": True, "suggestions": suggestions}

@app.get("/api/v1/ai/learning-stats")
async def learning_stats(db=Depends(get_pool), user: dict = Depends(get_current_user)):
    svc = _ai_service(db)
    stats = await svc.get_learning_stats(user["company_id"])
    return {"success": True, "stats": stats}

@app.get("/api/v1/ai/anomalies")
async def anomalies(db=Depends(get_pool), user: dict = Depends(get_current_user)):
    svc = _ai_service(db)
    items = await svc.detect_anomalies(user["company_id"])
    return {"success": True, "anomalies": items}


# ════════════════════════════════════════════════════════════════════════════
# TRANSACTIONS & VOUCHERS
# ════════════════════════════════════════════════════════════════════════════

class PostVoucherBody(BaseModel):
    voucher_type: str
    date:         str
    narration:    str
    reference:    str = ""
    lines:        list[dict]

class EditVoucherBody(BaseModel):
    narration:  Optional[str] = None
    reference:  Optional[str] = None
    date:       Optional[str] = None

class CorrectionBody(BaseModel):
    narration:            str
    original_account_id:  str
    corrected_account_id: str

@app.post("/api/v1/vouchers")
async def post_voucher(
    body: PostVoucherBody,
    db=Depends(get_pool),
    user: dict = Depends(get_current_user),
):
    engine = AccountingEngine(db)
    lines = [
        JournalLine(
            account_id=l["account_id"],
            dr_amount=l.get("dr_amount", 0),
            cr_amount=l.get("cr_amount", 0),
            narration=l.get("narration", ""),
        )
        for l in body.lines
    ]
    req = VoucherRequest(
        company_id=user["company_id"],
        voucher_type=VoucherType(body.voucher_type),
        date=date.fromisoformat(body.date),
        narration=body.narration,
        reference=body.reference,
        lines=lines,
        source=TxnSource.MANUAL,
    )
    voucher_id = await engine.post_voucher(req)
    return {"success": True, "voucher_id": voucher_id}

@app.patch("/api/v1/vouchers/{voucher_id}")
async def edit_voucher(
    voucher_id: str,
    body: EditVoucherBody,
    db=Depends(get_pool),
    user: dict = Depends(get_current_user),
):
    svc = _txn_service(db)
    updates = {k: v for k, v in body.dict().items() if v is not None}
    await svc.edit_voucher(voucher_id, user["company_id"], updates, user["sub"])
    return {"success": True, "voucher_id": voucher_id}

@app.post("/api/v1/vouchers/{voucher_id}/approve")
async def approve_voucher(
    voucher_id: str,
    db=Depends(get_pool),
    user: dict = Depends(get_current_user),
):
    svc = _txn_service(db)
    await svc.approve_voucher(voucher_id, user["company_id"], user["sub"])
    return {"success": True}

@app.post("/api/v1/vouchers/{voucher_id}/reverse")
async def reverse_voucher(
    voucher_id: str,
    db=Depends(get_pool),
    user: dict = Depends(get_current_user),
):
    engine = AccountingEngine(db)
    rev_id = await engine.reverse_voucher(voucher_id, user_id=user["sub"])
    return {"success": True, "reversal_voucher_id": rev_id}

@app.post("/api/v1/transactions/correction")
async def record_correction(
    body: CorrectionBody,
    db=Depends(get_pool),
    user: dict = Depends(get_current_user),
):
    svc = _txn_service(db)
    await svc.record_user_correction(
        company_id=user["company_id"],
        narration=body.narration,
        original_account_id=body.original_account_id,
        corrected_account_id=body.corrected_account_id,
        user_id=user["sub"],
    )
    return {"success": True}


# ════════════════════════════════════════════════════════════════════════════
# RECONCILIATION
# ════════════════════════════════════════════════════════════════════════════

@app.post("/api/v1/reconcile")
async def run_reconciliation(
    bank_account_id: Optional[str] = None,
    db=Depends(get_pool),
    user: dict = Depends(get_current_user),
):
    svc = ReconciliationService(db)
    result = await svc.run_reconciliation(
        company_id=user["company_id"],
        bank_account_id=bank_account_id,
        user_id=user["sub"],
    )
    return {"success": True, "data": result}

@app.post("/api/v1/reconcile/confirm")
async def confirm_match(
    bank_txn_id: str,
    voucher_id: str,
    db=Depends(get_pool),
    user: dict = Depends(get_current_user),
):
    svc = ReconciliationService(db)
    await svc.confirm_match(bank_txn_id, voucher_id, user["sub"])
    return {"success": True}

@app.get("/api/v1/reconcile/unmatched")
async def get_unmatched(db=Depends(get_pool), user: dict = Depends(get_current_user)):
    svc = ReconciliationService(db)
    items = await svc.get_unmatched(user["company_id"])
    return {"success": True, "data": items}

@app.get("/api/v1/reconcile/summary")
async def reconcile_summary(db=Depends(get_pool), user: dict = Depends(get_current_user)):
    svc = ReconciliationService(db)
    data = await svc.get_reconciliation_summary(user["company_id"])
    return {"success": True, "data": data}


# ════════════════════════════════════════════════════════════════════════════
# REPORTING  (One-click intelligent)
# ════════════════════════════════════════════════════════════════════════════

@app.get("/api/v2/reports/dashboard")
async def dashboard_summary(db=Depends(get_pool), user: dict = Depends(get_current_user)):
    svc = ReportingService(db)
    data = await svc.get_dashboard_summary(user["company_id"])
    return {"success": True, "data": data}

@app.get("/api/v2/reports/pnl")
async def profit_and_loss(
    from_date: Optional[str] = None,
    to_date:   Optional[str] = None,
    lang:      str = "simple",
    db=Depends(get_pool),
    user: dict = Depends(get_current_user),
):
    svc = ReportingService(db)
    fd = date.fromisoformat(from_date) if from_date else None
    td = date.fromisoformat(to_date)   if to_date   else None
    data = await svc.get_profit_and_loss(user["company_id"], fd, td)
    summary = await svc.generate_ai_summary(user["company_id"], data, "pnl", lang)
    return {"success": True, "data": data, "ai_summary": summary}

@app.get("/api/v2/reports/cashflow")
async def cashflow(
    from_date: Optional[str] = None,
    to_date:   Optional[str] = None,
    db=Depends(get_pool),
    user: dict = Depends(get_current_user),
):
    svc = ReportingService(db)
    fd = date.fromisoformat(from_date) if from_date else None
    td = date.fromisoformat(to_date)   if to_date   else None
    data = await svc.get_cash_flow(user["company_id"], fd, td)
    return {"success": True, "data": data}

@app.get("/api/v2/reports/aging/{report_type}")
async def aging_report(
    report_type: str,  # receivable | payable
    db=Depends(get_pool),
    user: dict = Depends(get_current_user),
):
    svc = ReportingService(db)
    data = await svc.get_aging_report(user["company_id"], report_type)
    return {"success": True, "data": data}

@app.get("/api/v2/reports/expenses")
async def expense_breakdown(
    from_date: Optional[str] = None,
    to_date:   Optional[str] = None,
    db=Depends(get_pool),
    user: dict = Depends(get_current_user),
):
    svc = ReportingService(db)
    fd = date.fromisoformat(from_date) if from_date else None
    td = date.fromisoformat(to_date)   if to_date   else None
    data = await svc.get_expense_breakdown(user["company_id"], fd, td)
    return {"success": True, "data": data}

# Legacy v1 endpoints (preserved)
@app.get("/api/v1/reports/{company_id}/trial-balance")
async def trial_balance(company_id: str, db=Depends(get_pool)):
    async with db.acquire() as conn:
        rows = await conn.fetch(
            "SELECT * FROM trial_balance WHERE company_id=$1 ORDER BY nature, code", company_id
        )
    return {"trial_balance": [dict(r) for r in rows]}

@app.get("/api/v1/reports/{company_id}/balance-sheet")
async def balance_sheet(company_id: str, db=Depends(get_pool)):
    async with db.acquire() as conn:
        rows = await conn.fetch(
            "SELECT nature, SUM(closing_balance) AS total FROM account_balances WHERE company_id=$1 GROUP BY nature",
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


# ════════════════════════════════════════════════════════════════════════════
# SMART ASSISTANT
# ════════════════════════════════════════════════════════════════════════════

class AssistantMessage(BaseModel):
    message:  str
    history:  list[dict] = []

@app.post("/api/v1/assistant/chat")
async def assistant_chat(
    body: AssistantMessage,
    db=Depends(get_pool),
    user: dict = Depends(get_current_user),
):
    svc = AssistantService(db)
    result = await svc.chat(
        company_id=user["company_id"],
        message=body.message,
        history=body.history,
        user_id=user["sub"],
    )
    return {"success": True, "data": result}

@app.get("/api/v1/assistant/quick-questions")
async def quick_questions():
    return {"questions": QUICK_QUESTIONS}


# ════════════════════════════════════════════════════════════════════════════
# AUDIT LOG
# ════════════════════════════════════════════════════════════════════════════

@app.get("/api/v1/audit")
async def audit_log(
    entity_type: Optional[str] = None,
    entity_id:   Optional[str] = None,
    limit:       int = 50,
    db=Depends(get_pool),
    user: dict = Depends(get_current_user),
):
    svc = AuditService(db)
    items = await svc.get_history(user["company_id"], entity_type, entity_id, limit)
    return {"success": True, "data": items}


# ════════════════════════════════════════════════════════════════════════════
# PRESERVED LEGACY ENDPOINTS (unchanged from v1)
# ════════════════════════════════════════════════════════════════════════════

@app.post("/api/v1/webhooks/invoice")
async def invoice_webhook(payload: dict, db=Depends(get_pool)):
    engine = AccountingEngine(db)
    voucher_id = await engine.post_invoice(
        company_id=payload["company_id"], invoice_data=payload,
    )
    return {"voucher_id": voucher_id, "status": "posted"}

@app.post("/api/v1/bank/{bank_account_id}/import")
async def import_bank_statement_legacy(
    bank_account_id: str, file: UploadFile = File(...), db=Depends(get_pool)
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
        if not transactions:
            raise HTTPException(422, "No transactions found in PDF. Export as CSV instead.")
    else:
        raise HTTPException(400, "Unsupported file type")

    async with db.acquire() as conn:
        staged = 0
        for txn in transactions:
            await conn.execute(
                "INSERT INTO bank_transactions (bank_account_id, txn_date, amount, txn_type, narration, reference, balance, status, raw_data) VALUES ($1,$2,$3,$4,$5,$6,$7,'unmatched',$8) ON CONFLICT DO NOTHING",
                bank_account_id, txn.txn_date, txn.amount, txn.txn_type,
                txn.narration, txn.reference, txn.balance, str(txn.raw_data)
            )
            staged += 1
    return {"staged": staged, "total_parsed": len(transactions)}

@app.get("/api/v1/gst/{company_id}/gstr1/{period}")
async def gstr1_report(company_id: str, period: str, db=Depends(get_pool)):
    async with db.acquire() as conn:
        company = await conn.fetchrow("SELECT gstin FROM companies WHERE id=$1", company_id)
        if not company or not company["gstin"]:
            raise HTTPException(400, "Company GSTIN not configured")
        txns = await conn.fetch(
            "SELECT * FROM gst_transactions WHERE company_id=$1 AND period=$2 AND txn_type='output'",
            company_id, f"{period[2:]}-{period[:2]}"
        )
    gst_engine = GSTEngine()
    from compliance.gst import GSTTransaction
    from decimal import Decimal
    gst_txns = [
        GSTTransaction(
            party_gstin=t["party_gstin"], party_name=t["party_name"] or "",
            invoice_no=t["invoice_id"] or "", invoice_date=date.today(),
            place_of_supply=t["place_of_supply"] or "29",
            supply_type=t["supply_type"] or "B2B",
            hsn_sac=t["hsn_sac"],
            taxable_value=Decimal(str(t["taxable_value"])),
            gst_rate=Decimal(str(t["gst_rate"])),
            cgst=Decimal(str(t["cgst"])), sgst=Decimal(str(t["sgst"])),
            igst=Decimal(str(t["igst"])),
        )
        for t in txns
    ]
    return gst_engine.generate_gstr1(company["gstin"], period, gst_txns)

@app.post("/api/v1/payroll/{company_id}/run/{period}")
async def run_payroll(company_id: str, period: str, db=Depends(get_pool)):
    async with db.acquire() as conn:
        employees = await conn.fetch("SELECT * FROM employees WHERE company_id=$1 AND is_active=TRUE", company_id)
    processor = PayrollProcessor()
    result = processor.process([dict(e) for e in employees], period)
    totals = result["totals"]
    return {
        "period": period, "employee_count": len(result["lines"]),
        "totals": {
            "gross_salary": str(totals["gross"]),
            "net_payable_to_employees": str(totals["net_payable"]),
            "total_pf": str(totals["pf_employee"] + totals["pf_employer"]),
            "total_esic": str(totals["esic_employee"] + totals["esic_employer"]),
            "total_tds": str(totals["tds"]),
            "cost_to_company": str(totals["total_cost_to_company"]),
        }
    }

@app.post("/api/v1/webhooks/razorpay/{company_id}")
async def razorpay_webhook(company_id: str, payload: dict, db=Depends(get_pool)):
    engine = AccountingEngine(db)
    handler = PaymentGatewayHandler(engine)
    voucher_id = await handler.handle_razorpay_payment(company_id, payload)
    return {"voucher_id": voucher_id}
