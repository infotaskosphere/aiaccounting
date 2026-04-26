"""
app/main.py  — PRODUCTION v2.1
FastAPI application: AI Accounting System for Indian Businesses
- GST Compliance | Schedule III | Double-Entry
- JWT + RBAC | AI Classification | Bank Statement OCR
- Redis Task Queue | Tally Export | Complete REST API
"""

from __future__ import annotations

import os
import asyncpg
from contextlib import asynccontextmanager
from typing import AsyncGenerator, Optional
from datetime import date

from fastapi import FastAPI, Depends, HTTPException, UploadFile, File, BackgroundTasks, Body, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from pydantic_settings import BaseSettings
import structlog

# ── Services ─────────────────────────────────────────────────────────────────
from services.transaction_service  import TransactionService
from services.ai_service           import AIService
from services.reconciliation_service import ReconciliationService
from services.reporting_service    import ReportingService
from services.ingestion_service    import IngestionService
from services.assistant_service    import AssistantService, QUICK_QUESTIONS
from services.audit_service        import AuditService
from services.tally_service        import TallyService
from services.gst_service          import GSTService

# ── Core engine ───────────────────────────────────────────────────────────────
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
from app.routes.simple_mode import router as simple_router

log = structlog.get_logger()


# ── Settings ──────────────────────────────────────────────────────────────────

class Settings(BaseSettings):
    database_url:      str = "postgresql://accounting:password@localhost/accounting"
    secret_key:        str = "change-me-in-production"
    openai_api_key:    str = ""
    anthropic_api_key: str = ""
    razorpay_key:      str = ""
    razorpay_secret:   str = ""
    redis_url:         str = "redis://localhost:6379/0"
    environment:       str = "development"
    frontend_url:      str = "http://localhost:5173"
    auto_post_threshold: float = 0.90   # confidence ≥ 90% → auto post
    review_threshold:    float = 0.70   # 70–90% → suggest, <70% → manual

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
    dsn       = settings.resolved_db_url
    last_error = None
    for attempt in range(1, 6):
        try:
            pool = await asyncpg.create_pool(dsn=dsn, min_size=2, max_size=10, command_timeout=60)
            log.info("db_pool_ready", attempt=attempt)
            last_error = None
            break
        except Exception as exc:
            last_error = exc
            log.warning("db_connect_retry", attempt=attempt, error=str(exc))
            await asyncio.sleep(attempt * 2)

    if last_error:
        raise RuntimeError(f"DB connection failed: {last_error}") from last_error

    # Init AI classifier
    try:
        app.state.classifier = TransactionClassifier(
            openai_api_key=settings.openai_api_key
        )
        log.info("ai_classifier_ready")
    except Exception as exc:
        app.state.classifier = TransactionClassifier.__new__(TransactionClassifier)
        app.state.classifier.model = None
        app.state.classifier._account_embeddings = {}
        app.state.classifier._account_index = []
        app.state.classifier._learned_map = {}
        app.state.classifier._openai_client = None
        log.warning("ai_classifier_fallback", error=str(exc))

    yield
    await pool.close()

async def get_pool() -> asyncpg.Pool:
    return pool


# ── App ───────────────────────────────────────────────────────────────────────

app = FastAPI(
    title="AI Accounting API — Indian Business",
    description="GST | Schedule III | Double-Entry | AI Classification | Tally Export",
    version="2.1.0",
    lifespan=lifespan,
    docs_url="/api/docs",
    redoc_url="/api/redoc",
)

register_middleware(app)
app.include_router(simple_router)

_allowed_origins = list(set(filter(None, [
    "http://localhost:3000",
    "http://localhost:5173",
    settings.frontend_url,
])))

app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Service factory helpers ───────────────────────────────────────────────────

def _txn_service(db): svc = TransactionService(db); svc.ai.set_classifier(app.state.classifier); return svc
def _ai_service(db):  svc = AIService(db);          svc.set_classifier(app.state.classifier);   return svc


# ════════════════════════════════════════════════════════════════════════════
# HEALTH
# ════════════════════════════════════════════════════════════════════════════

@app.get("/health")
async def health(db=Depends(get_pool)):
    async with db.acquire() as conn:
        await conn.fetchval("SELECT 1")
    from ai.classifier import EMBEDDINGS_AVAILABLE, OCR_AVAILABLE, OPENAI_AVAILABLE
    return {
        "status": "ok",
        "version": "2.1.0",
        "environment": settings.environment,
        "features": {
            "ai_embeddings": EMBEDDINGS_AVAILABLE,
            "openai_classification": OPENAI_AVAILABLE and bool(settings.openai_api_key),
            "ocr": OCR_AVAILABLE,
            "smart_assistant": bool(settings.anthropic_api_key),
            "gst_engine": True,
            "schedule_iii": True,
            "tally_export": True,
            "redis_queue": bool(settings.redis_url),
        }
    }


# ════════════════════════════════════════════════════════════════════════════
# AUTHENTICATION
# ════════════════════════════════════════════════════════════════════════════

class LoginRequest(BaseModel):
    email:    str
    password: str

class RegisterRequest(BaseModel):
    email:        str
    password:     str
    name:         str
    company_name: str
    gstin:        Optional[str] = None
    state_code:   str = "24"

@app.post("/api/v1/auth/login")
async def login(body: LoginRequest, db=Depends(get_pool)):
    async with db.acquire() as conn:
        user = await conn.fetchrow(
            "SELECT id::text, company_id::text, role, password_hash, is_active, name FROM users WHERE email=$1",
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
        "user_name":    user["name"],
    }

@app.post("/api/v1/auth/register")
async def register(body: RegisterRequest, db=Depends(get_pool)):
    async with db.acquire() as conn:
        existing = await conn.fetchval("SELECT id FROM users WHERE email=$1", body.email)
        if existing:
            raise HTTPException(409, "Email already registered")

        company_id = await conn.fetchval(
            "INSERT INTO companies (name, gstin, state_code) VALUES ($1, $2, $3) RETURNING id::text",
            body.company_name, body.gstin, body.state_code
        )
        user_id = await conn.fetchval(
            "INSERT INTO users (company_id, email, password_hash, name, role) VALUES ($1,$2,$3,$4,'owner') RETURNING id::text",
            company_id, body.email, hash_password(body.password), body.name
        )
        # Seed chart of accounts for new company
        await conn.execute("SELECT seed_chart_of_accounts($1::uuid)", company_id)

    token = create_token(user_id, company_id, "owner")
    return {"access_token": token, "token_type": "bearer", "company_id": company_id, "user_role": "owner"}

@app.get("/api/v1/auth/me")
async def me(db=Depends(get_pool), user: dict = Depends(get_current_user)):
    async with db.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT u.id::text, u.email, u.name, u.role, c.name AS company_name, c.gstin "
            "FROM users u JOIN companies c ON c.id = u.company_id WHERE u.id=$1::uuid",
            user["sub"]
        )
    if not row:
        raise HTTPException(404, "User not found")
    return {"success": True, "data": dict(row)}


# ════════════════════════════════════════════════════════════════════════════
# BANK STATEMENT INGESTION
# ════════════════════════════════════════════════════════════════════════════

@app.post("/api/v1/bank/upload/{bank_account_id}")
@app.post("/api/v1/upload/bank-statement/{bank_account_id}")
async def upload_bank_statement(
    bank_account_id: str,
    file: UploadFile = File(...),
    background_tasks: BackgroundTasks = BackgroundTasks(),
    db=Depends(get_pool),
    user: dict = Depends(get_current_user),
):
    """Upload PDF/CSV/Excel bank statement. Auto-parses, classifies, posts entries."""
    content = await file.read()
    service = IngestionService(db)
    result  = await service.ingest_bank_statement(
        company_id=user["company_id"],
        bank_account_id=bank_account_id,
        file_content=content,
        filename=file.filename or "",
        user_id=user["sub"],
    )
    background_tasks.add_task(_background_classify, user["company_id"], bank_account_id, db, user["sub"])
    return {"success": True, "data": result}

@app.get("/api/v1/bank/transactions")
async def get_bank_transactions(
    bank_account_id: Optional[str] = None,
    status: Optional[str] = None,
    from_date: Optional[str] = None,
    to_date: Optional[str] = None,
    limit: int = Query(default=100, le=500),
    offset: int = 0,
    db=Depends(get_pool),
    user: dict = Depends(get_current_user),
):
    """List bank transactions with filters."""
    conditions = ["bt.company_id = $1"]
    params: list = [user["company_id"]]
    idx = 2

    if bank_account_id:
        conditions.append(f"bt.bank_account_id = ${idx}::uuid")
        params.append(bank_account_id); idx += 1
    if status:
        conditions.append(f"bt.status = ${idx}")
        params.append(status); idx += 1
    if from_date:
        conditions.append(f"bt.txn_date >= ${idx}")
        params.append(date.fromisoformat(from_date)); idx += 1
    if to_date:
        conditions.append(f"bt.txn_date <= ${idx}")
        params.append(date.fromisoformat(to_date)); idx += 1

    where = " AND ".join(conditions)
    async with db.acquire() as conn:
        rows = await conn.fetch(
            f"""SELECT bt.id::text, bt.txn_date, bt.amount, bt.txn_type,
                       bt.narration, bt.reference, bt.balance, bt.status,
                       bt.payment_mode, bt.ai_match_confidence,
                       a.name AS suggested_account,
                       ba.bank_name
                FROM bank_transactions bt
                LEFT JOIN accounts a ON a.id = bt.ai_suggested_account_id
                LEFT JOIN bank_accounts ba ON ba.id = bt.bank_account_id
                WHERE {where}
                ORDER BY bt.txn_date DESC, bt.created_at DESC
                LIMIT ${idx} OFFSET ${idx+1}""",
            *params, limit, offset
        )
        total = await conn.fetchval(
            f"SELECT COUNT(*) FROM bank_transactions bt WHERE {where}",
            *params
        )
    return {
        "success": True,
        "data": [dict(r) for r in rows],
        "total": total,
        "limit": limit,
        "offset": offset,
    }

@app.get("/api/v1/bank/accounts")
async def list_bank_accounts(db=Depends(get_pool), user: dict = Depends(get_current_user)):
    async with db.acquire() as conn:
        rows = await conn.fetch(
            """SELECT ba.id::text, ba.bank_name, ba.account_number, ba.ifsc,
                      a.name AS ledger_name, a.code
               FROM bank_accounts ba
               JOIN accounts a ON a.id = ba.account_id
               WHERE ba.company_id=$1::uuid AND ba.is_active=TRUE""",
            user["company_id"]
        )
    return {"success": True, "data": [dict(r) for r in rows]}

@app.post("/api/v1/bank/parse-statement")
async def ai_parse_bank_statement(
    file: UploadFile = File(...),
    user: dict = Depends(get_current_user),
):
    """Parse any bank statement using AI engine — no external API."""
    from ai.engine import parse_and_classify_statement
    content  = await file.read()
    filename = file.filename or "statement.pdf"
    try:
        result = parse_and_classify_statement(content, filename)
        return {"success": True, "data": result}
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Parse error: {str(e)[:300]}")


# ════════════════════════════════════════════════════════════════════════════
# AI CLASSIFICATION ENGINE
# ════════════════════════════════════════════════════════════════════════════

class ClassifyRequest(BaseModel):
    narrations: list[str] = Field(..., min_length=1, max_length=100)

class CorrectionRequest(BaseModel):
    narration:             str
    original_account_id:   str
    corrected_account_id:  str

@app.post("/api/v1/ai/classify")
@app.post("/api/v1/classify")
async def classify(
    body: ClassifyRequest,
    db=Depends(get_pool),
    user: dict = Depends(get_current_user),
):
    """AI classify narrations → ledger heads with confidence scores."""
    svc     = _ai_service(db)
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
                "action":          "auto_post" if r.confidence >= settings.auto_post_threshold
                                   else "suggest" if r.confidence >= settings.review_threshold
                                   else "manual_review",
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
    """Record user correction — retrains AI dynamically."""
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
# JOURNAL ENTRY / VOUCHER ENGINE
# ════════════════════════════════════════════════════════════════════════════

class GenerateEntriesRequest(BaseModel):
    bank_transaction_ids: list[str]

class PostEntriesRequest(BaseModel):
    voucher_ids: list[str]

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

@app.post("/api/v1/entries/generate")
async def generate_journal_entries(
    body: GenerateEntriesRequest,
    db=Depends(get_pool),
    user: dict = Depends(get_current_user),
):
    """
    Generate double-entry journal entries from staged bank transactions.
    Applies GST split logic automatically.
    Returns draft entries for review before posting.
    """
    svc     = _txn_service(db)
    entries = await svc.generate_entries_from_bank_txns(
        company_id=user["company_id"],
        bank_txn_ids=body.bank_transaction_ids,
    )
    return {"success": True, "entries": entries, "count": len(entries)}

@app.post("/api/v1/entries/post")
async def post_journal_entries(
    body: PostEntriesRequest,
    db=Depends(get_pool),
    user: dict = Depends(get_current_user),
):
    """Post approved draft vouchers to ledger."""
    svc    = _txn_service(db)
    result = await svc.post_vouchers(
        company_id=user["company_id"],
        voucher_ids=body.voucher_ids,
        user_id=user["sub"],
    )
    return {"success": True, "posted": result["posted"], "errors": result["errors"]}

@app.get("/api/v1/entries/pending")
async def get_pending_entries(
    db=Depends(get_pool),
    user: dict = Depends(get_current_user),
):
    """Get entries pending approval (confidence 70–90%)."""
    async with db.acquire() as conn:
        rows = await conn.fetch(
            """SELECT v.id::text, v.voucher_no, v.voucher_type, v.date,
                      v.narration, v.ai_confidence, v.status, v.approval_status
               FROM vouchers v
               WHERE v.company_id=$1::uuid
                 AND v.approval_status='pending'
               ORDER BY v.date DESC, v.created_at DESC
               LIMIT 200""",
            user["company_id"]
        )
    return {"success": True, "data": [dict(r) for r in rows]}

@app.post("/api/v1/vouchers")
async def post_voucher(
    body: PostVoucherBody,
    db=Depends(get_pool),
    user: dict = Depends(get_current_user),
):
    engine = AccountingEngine(db)
    lines  = [
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
        created_by=user["sub"],
    )
    voucher_id = await engine.post_voucher(req)
    return {"success": True, "voucher_id": voucher_id}

@app.get("/api/v1/vouchers")
async def list_vouchers(
    voucher_type: Optional[str] = None,
    from_date: Optional[str] = None,
    to_date: Optional[str] = None,
    status: Optional[str] = None,
    limit: int = Query(default=50, le=500),
    offset: int = 0,
    db=Depends(get_pool),
    user: dict = Depends(get_current_user),
):
    conditions = ["v.company_id=$1::uuid"]
    params: list = [user["company_id"]]
    idx = 2

    if voucher_type:
        conditions.append(f"v.voucher_type=${idx}"); params.append(voucher_type); idx += 1
    if status:
        conditions.append(f"v.status=${idx}");        params.append(status);      idx += 1
    if from_date:
        conditions.append(f"v.date>=${idx}");         params.append(date.fromisoformat(from_date)); idx += 1
    if to_date:
        conditions.append(f"v.date<=${idx}");         params.append(date.fromisoformat(to_date));   idx += 1

    where = " AND ".join(conditions)
    async with db.acquire() as conn:
        rows = await conn.fetch(
            f"""SELECT v.id::text, v.voucher_no, v.voucher_type, v.date,
                       v.narration, v.reference, v.status, v.source,
                       v.ai_confidence, v.approval_status,
                       COALESCE(SUM(jl.dr_amount),0) AS total_amount
                FROM vouchers v
                LEFT JOIN journal_lines jl ON jl.voucher_id=v.id
                WHERE {where}
                GROUP BY v.id
                ORDER BY v.date DESC, v.created_at DESC
                LIMIT ${idx} OFFSET ${idx+1}""",
            *params, limit, offset
        )
    return {"success": True, "data": [dict(r) for r in rows]}

@app.get("/api/v1/vouchers/{voucher_id}")
async def get_voucher(
    voucher_id: str,
    db=Depends(get_pool),
    user: dict = Depends(get_current_user),
):
    async with db.acquire() as conn:
        v = await conn.fetchrow(
            "SELECT * FROM vouchers WHERE id=$1::uuid AND company_id=$2::uuid",
            voucher_id, user["company_id"]
        )
        if not v:
            raise HTTPException(404, "Voucher not found")
        lines = await conn.fetch(
            """SELECT jl.id::text, jl.dr_amount, jl.cr_amount, jl.narration,
                      a.name AS account_name, a.code AS account_code, a.nature
               FROM journal_lines jl
               JOIN accounts a ON a.id=jl.account_id
               WHERE jl.voucher_id=$1::uuid
               ORDER BY jl.sequence""",
            voucher_id
        )
    return {"success": True, "data": {**dict(v), "lines": [dict(l) for l in lines]}}

@app.patch("/api/v1/vouchers/{voucher_id}")
async def edit_voucher(
    voucher_id: str,
    body: EditVoucherBody,
    db=Depends(get_pool),
    user: dict = Depends(get_current_user),
):
    svc     = _txn_service(db)
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


# ════════════════════════════════════════════════════════════════════════════
# ACCOUNTS / LEDGER
# ════════════════════════════════════════════════════════════════════════════

@app.get("/api/v1/accounts")
async def list_accounts(
    nature: Optional[str] = None,
    account_type: Optional[str] = None,
    search: Optional[str] = None,
    db=Depends(get_pool),
    user: dict = Depends(get_current_user),
):
    conditions = ["a.company_id=$1::uuid", "a.is_active=TRUE"]
    params: list = [user["company_id"]]
    idx = 2
    if nature:
        conditions.append(f"a.nature=${idx}"); params.append(nature); idx += 1
    if account_type:
        conditions.append(f"a.account_type=${idx}"); params.append(account_type); idx += 1
    if search:
        conditions.append(f"(a.name ILIKE ${idx} OR a.code ILIKE ${idx})")
        params.append(f"%{search}%"); idx += 1

    where = " AND ".join(conditions)
    async with db.acquire() as conn:
        rows = await conn.fetch(
            f"""SELECT a.id::text, a.code, a.name, a.nature, a.account_type,
                       a.schedule_iii_head, a.opening_balance, a.opening_dr_cr,
                       COALESCE(ab.closing_balance, a.opening_balance) AS balance
                FROM accounts a
                LEFT JOIN account_balances ab ON ab.account_id = a.id
                WHERE {where}
                ORDER BY a.nature, a.code""",
            *params
        )
    return {"success": True, "data": [dict(r) for r in rows]}

@app.post("/api/v1/accounts")
async def create_account(
    body: dict = Body(...),
    db=Depends(get_pool),
    user: dict = Depends(get_current_user),
):
    async with db.acquire() as conn:
        existing = await conn.fetchval(
            "SELECT id FROM accounts WHERE company_id=$1::uuid AND code=$2",
            user["company_id"], body["code"]
        )
        if existing:
            raise HTTPException(409, f"Account code {body['code']} already exists")
        acc_id = await conn.fetchval(
            """INSERT INTO accounts (company_id, code, name, nature, account_type,
                                    schedule_iii_head, opening_balance, opening_dr_cr, gstin)
               VALUES ($1::uuid,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id::text""",
            user["company_id"], body["code"], body["name"], body["nature"],
            body.get("account_type", "other"), body.get("schedule_iii_head"),
            body.get("opening_balance", 0), body.get("opening_dr_cr", "dr"),
            body.get("gstin")
        )
    return {"success": True, "account_id": acc_id}

@app.get("/api/v1/accounts/{account_id}/ledger")
async def account_ledger(
    account_id: str,
    from_date: Optional[str] = None,
    to_date: Optional[str] = None,
    db=Depends(get_pool),
    user: dict = Depends(get_current_user),
):
    """Get account statement (ledger) for a specific account."""
    fd = date.fromisoformat(from_date) if from_date else date(date.today().year, 4, 1)
    td = date.fromisoformat(to_date)   if to_date   else date.today()
    async with db.acquire() as conn:
        rows = await conn.fetch(
            """SELECT v.date, v.voucher_no, v.voucher_type, jl.narration,
                      jl.dr_amount, jl.cr_amount, v.reference
               FROM journal_lines jl
               JOIN vouchers v ON v.id=jl.voucher_id
               WHERE jl.account_id=$1::uuid AND v.company_id=$2::uuid
                 AND v.date BETWEEN $3 AND $4 AND v.status='posted'
               ORDER BY v.date, v.created_at""",
            account_id, user["company_id"], fd, td
        )
    return {"success": True, "data": [dict(r) for r in rows]}


# ════════════════════════════════════════════════════════════════════════════
# GST ENGINE
# ════════════════════════════════════════════════════════════════════════════

@app.post("/api/v1/gst/split")
async def gst_split(
    body: dict = Body(...),
    user: dict = Depends(get_current_user),
):
    """
    Auto-split a GST-inclusive amount.
    Input: {"total_amount": 1180, "gst_rate": 18, "is_interstate": false}
    Output: {"taxable": 1000, "cgst": 90, "sgst": 90, "igst": 0}
    """
    from compliance.gst import GSTEngine
    from decimal import Decimal
    engine  = GSTEngine()
    total   = Decimal(str(body["total_amount"]))
    rate    = Decimal(str(body.get("gst_rate", 18)))
    inter   = body.get("is_interstate", False)
    result  = engine.split_gst_amount(total, rate, is_interstate=inter)
    return {"success": True, "data": result}

@app.post("/api/v1/gst/detect")
async def detect_gst_transaction(
    body: dict = Body(...),
    user: dict = Depends(get_current_user),
):
    """Detect if a narration / amount is a GST transaction and return split."""
    from services.gst_service import GSTService
    svc    = GSTService()
    result = svc.detect_and_split(
        narration=body.get("narration", ""),
        amount=body.get("amount", 0),
        company_state_code=body.get("state_code", "24"),
        party_state_code=body.get("party_state_code", "24"),
    )
    return {"success": True, "data": result}

@app.get("/api/v1/gst/summary")
async def gst_summary(
    period: Optional[str] = None,
    db=Depends(get_pool),
    user: dict = Depends(get_current_user),
):
    async with db.acquire() as conn:
        conditions = ["company_id=$1::uuid"]
        params: list = [user["company_id"]]
        if period:
            conditions.append("period=$2"); params.append(period)
        where = " AND ".join(conditions)
        rows = await conn.fetch(
            f"""SELECT txn_type,
                       SUM(taxable_value) AS taxable, SUM(cgst) AS cgst,
                       SUM(sgst) AS sgst, SUM(igst) AS igst, SUM(total_gst) AS total_gst
                FROM gst_transactions WHERE {where}
                GROUP BY txn_type""",
            *params
        )
    data = {r["txn_type"]: dict(r) for r in rows}
    output = data.get("output", {})
    input_ = data.get("input",  {})
    net_gst = (float(output.get("total_gst", 0)) - float(input_.get("total_gst", 0)))
    return {
        "success": True,
        "data": {
            "output_gst": output,
            "input_gst": input_,
            "net_gst_payable": net_gst,
            "period": period,
        }
    }

@app.get("/api/v1/gst/{company_id}/gstr1/{period}")
async def gstr1_report(company_id: str, period: str, db=Depends(get_pool)):
    from compliance.gst import GSTTransaction
    from decimal import Decimal
    async with db.acquire() as conn:
        company = await conn.fetchrow("SELECT gstin FROM companies WHERE id=$1::uuid", company_id)
        if not company or not company["gstin"]:
            raise HTTPException(400, "Company GSTIN not configured")
        txns = await conn.fetch(
            "SELECT * FROM gst_transactions WHERE company_id=$1::uuid AND period=$2 AND txn_type='output'",
            company_id, period
        )
    gst_engine = GSTEngine()
    gst_txns   = [
        GSTTransaction(
            party_gstin=t["party_gstin"], party_name=t["party_name"] or "",
            invoice_no=t["invoice_id"] or "", invoice_date=date.today(),
            place_of_supply=t["place_of_supply"] or "24",
            supply_type=t["supply_type"] or "B2B",
            hsn_sac=t["hsn_sac"],
            taxable_value=Decimal(str(t["taxable_value"])),
            gst_rate=Decimal(str(t["gst_rate"])),
            cgst=Decimal(str(t["cgst"])),
            sgst=Decimal(str(t["sgst"])),
            igst=Decimal(str(t["igst"])),
        )
        for t in txns
    ]
    return gst_engine.generate_gstr1(company["gstin"], period, gst_txns)

@app.get("/api/v1/gst/{company_id}/gstr3b/{period}")
async def gstr3b_report(company_id: str, period: str, db=Depends(get_pool)):
    svc = GSTService()
    data = await svc.generate_gstr3b(db, company_id, period)
    return {"success": True, "data": data}


# ════════════════════════════════════════════════════════════════════════════
# REPORTS (Schedule III)
# ════════════════════════════════════════════════════════════════════════════

@app.get("/api/v1/reports/trial-balance")
@app.get("/api/v2/reports/trial-balance")
async def trial_balance(
    as_of: Optional[str] = None,
    db=Depends(get_pool),
    user: dict = Depends(get_current_user),
):
    svc  = ReportingService(db)
    data = await svc.get_trial_balance(user["company_id"], as_of)
    return {"success": True, "data": data}

@app.get("/api/v1/reports/pnl")
@app.get("/api/v2/reports/pnl")
async def profit_and_loss(
    from_date: Optional[str] = None,
    to_date:   Optional[str] = None,
    lang:      str = "simple",
    db=Depends(get_pool),
    user: dict = Depends(get_current_user),
):
    svc  = ReportingService(db)
    fd   = date.fromisoformat(from_date) if from_date else None
    td   = date.fromisoformat(to_date)   if to_date   else None
    data = await svc.get_profit_and_loss(user["company_id"], fd, td)
    summary = await svc.generate_ai_summary(user["company_id"], data, "pnl", lang)
    return {"success": True, "data": data, "ai_summary": summary}

@app.get("/api/v1/reports/balance-sheet")
@app.get("/api/v2/reports/balance-sheet")
async def balance_sheet(
    as_of: Optional[str] = None,
    db=Depends(get_pool),
    user: dict = Depends(get_current_user),
):
    """Schedule III format Balance Sheet."""
    svc  = ReportingService(db)
    data = await svc.get_balance_sheet_schedule_iii(user["company_id"], as_of)
    return {"success": True, "data": data}

@app.get("/api/v2/reports/dashboard")
async def dashboard_summary(db=Depends(get_pool), user: dict = Depends(get_current_user)):
    svc  = ReportingService(db)
    data = await svc.get_dashboard_summary(user["company_id"])
    return {"success": True, "data": data}

@app.get("/api/v2/reports/cashflow")
async def cashflow(
    from_date: Optional[str] = None,
    to_date:   Optional[str] = None,
    db=Depends(get_pool),
    user: dict = Depends(get_current_user),
):
    svc  = ReportingService(db)
    fd   = date.fromisoformat(from_date) if from_date else None
    td   = date.fromisoformat(to_date)   if to_date   else None
    data = await svc.get_cash_flow(user["company_id"], fd, td)
    return {"success": True, "data": data}

@app.get("/api/v2/reports/expenses")
async def expense_breakdown(
    from_date: Optional[str] = None,
    to_date:   Optional[str] = None,
    db=Depends(get_pool),
    user: dict = Depends(get_current_user),
):
    svc  = ReportingService(db)
    fd   = date.fromisoformat(from_date) if from_date else None
    td   = date.fromisoformat(to_date)   if to_date   else None
    data = await svc.get_expense_breakdown(user["company_id"], fd, td)
    return {"success": True, "data": data}

@app.get("/api/v2/reports/aging/{report_type}")
async def aging_report(
    report_type: str,
    db=Depends(get_pool),
    user: dict = Depends(get_current_user),
):
    svc  = ReportingService(db)
    data = await svc.get_aging_report(user["company_id"], report_type)
    return {"success": True, "data": data}


# ════════════════════════════════════════════════════════════════════════════
# TALLY EXPORT
# ════════════════════════════════════════════════════════════════════════════

@app.get("/api/v1/export/tally")
async def export_tally_xml(
    from_date: Optional[str] = None,
    to_date:   Optional[str] = None,
    db=Depends(get_pool),
    user: dict = Depends(get_current_user),
):
    """Export vouchers as Tally Prime XML."""
    from fastapi.responses import Response
    svc = TallyService(db)
    fd  = date.fromisoformat(from_date) if from_date else None
    td  = date.fromisoformat(to_date)   if to_date   else None
    xml = await svc.export_vouchers_xml(user["company_id"], fd, td)
    return Response(content=xml, media_type="application/xml",
                    headers={"Content-Disposition": "attachment; filename=tally_export.xml"})

@app.get("/api/v1/export/ledgers-tally")
async def export_tally_ledgers(
    db=Depends(get_pool),
    user: dict = Depends(get_current_user),
):
    from fastapi.responses import Response
    svc = TallyService(db)
    xml = await svc.export_ledgers_xml(user["company_id"])
    return Response(content=xml, media_type="application/xml",
                    headers={"Content-Disposition": "attachment; filename=tally_ledgers.xml"})


# ════════════════════════════════════════════════════════════════════════════
# RECONCILIATION
# ════════════════════════════════════════════════════════════════════════════

@app.post("/api/v1/reconcile")
async def run_reconciliation(
    bank_account_id: Optional[str] = None,
    db=Depends(get_pool),
    user: dict = Depends(get_current_user),
):
    svc    = ReconciliationService(db)
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
    svc   = ReconciliationService(db)
    items = await svc.get_unmatched(user["company_id"])
    return {"success": True, "data": items}

@app.get("/api/v1/reconcile/summary")
async def reconcile_summary(db=Depends(get_pool), user: dict = Depends(get_current_user)):
    svc  = ReconciliationService(db)
    data = await svc.get_reconciliation_summary(user["company_id"])
    return {"success": True, "data": data}


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
    svc   = AuditService(db)
    items = await svc.get_history(user["company_id"], entity_type, entity_id, limit)
    return {"success": True, "data": items}


# ════════════════════════════════════════════════════════════════════════════
# SMART ASSISTANT
# ════════════════════════════════════════════════════════════════════════════

class AssistantMessage(BaseModel):
    message: str
    history: list[dict] = []

@app.post("/api/v1/assistant/chat")
async def assistant_chat(
    body: AssistantMessage,
    db=Depends(get_pool),
    user: dict = Depends(get_current_user),
):
    svc    = AssistantService(db)
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
# PAYROLL
# ════════════════════════════════════════════════════════════════════════════

@app.post("/api/v1/payroll/{company_id}/run/{period}")
async def run_payroll(company_id: str, period: str, db=Depends(get_pool)):
    async with db.acquire() as conn:
        employees = await conn.fetch(
            "SELECT * FROM employees WHERE company_id=$1::uuid AND is_active=TRUE", company_id
        )
    processor = PayrollProcessor()
    result    = processor.process([dict(e) for e in employees], period)
    totals    = result["totals"]
    return {
        "period": period,
        "employee_count": len(result["lines"]),
        "totals": {
            "gross_salary":             str(totals["gross"]),
            "net_payable_to_employees": str(totals["net_payable"]),
            "total_pf":  str(totals["pf_employee"] + totals["pf_employer"]),
            "total_esic": str(totals["esic_employee"] + totals["esic_employer"]),
            "total_tds":  str(totals["tds"]),
            "cost_to_company": str(totals["total_cost_to_company"]),
        }
    }


# ════════════════════════════════════════════════════════════════════════════
# BACKGROUND TASKS
# ════════════════════════════════════════════════════════════════════════════

async def _background_classify(company_id: str, bank_account_id: str, db, user_id: str):
    try:
        svc = _txn_service(db)
        async with db.acquire() as conn:
            txns = await conn.fetch(
                "SELECT * FROM bank_transactions WHERE bank_account_id=$1::uuid AND status='unmatched' LIMIT 200",
                bank_account_id
            )
        if txns:
            await svc.batch_auto_post(company_id, bank_account_id, [dict(t) for t in txns], user_id)
            log.info("background_classify_done", count=len(txns))
    except Exception as exc:
        log.error("background_classify_failed", error=str(exc))


# ════════════════════════════════════════════════════════════════════════════
# LEGACY ENDPOINTS (backward compatibility)
# ════════════════════════════════════════════════════════════════════════════

@app.post("/api/v1/bank/{bank_account_id}/import")
async def import_bank_statement_legacy(
    bank_account_id: str,
    file: UploadFile = File(...),
    db=Depends(get_pool),
):
    parser   = BankStatementParser()
    content  = await file.read()
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
                """INSERT INTO bank_transactions
                   (bank_account_id, txn_date, amount, txn_type, narration, reference, balance, status, raw_data)
                   VALUES ($1,$2,$3,$4,$5,$6,$7,'unmatched',$8)
                   ON CONFLICT DO NOTHING""",
                bank_account_id, txn.txn_date, txn.amount, txn.txn_type,
                txn.narration, txn.reference, txn.balance, str(txn.raw_data)
            )
            staged += 1
    return {"staged": staged, "total_parsed": len(transactions)}

@app.post("/api/v1/webhooks/invoice")
async def invoice_webhook(payload: dict, db=Depends(get_pool)):
    engine     = AccountingEngine(db)
    voucher_id = await engine.post_invoice(company_id=payload["company_id"], invoice_data=payload)
    return {"voucher_id": voucher_id, "status": "posted"}

@app.post("/api/v1/webhooks/razorpay/{company_id}")
async def razorpay_webhook(company_id: str, payload: dict, db=Depends(get_pool)):
    engine     = AccountingEngine(db)
    handler    = PaymentGatewayHandler(engine)
    voucher_id = await handler.handle_razorpay_payment(company_id, payload)
    return {"voucher_id": voucher_id}

@app.get("/api/v1/reports/{company_id}/trial-balance")
async def trial_balance_legacy(company_id: str, db=Depends(get_pool)):
    async with db.acquire() as conn:
        rows = await conn.fetch(
            "SELECT * FROM trial_balance WHERE company_id=$1::uuid ORDER BY nature, code", company_id
        )
    return {"trial_balance": [dict(r) for r in rows]}

@app.get("/api/v1/reports/{company_id}/balance-sheet")
async def balance_sheet_legacy(company_id: str, db=Depends(get_pool)):
    async with db.acquire() as conn:
        rows = await conn.fetch(
            "SELECT nature, SUM(closing_balance) AS total FROM account_balances WHERE company_id=$1::uuid GROUP BY nature",
            company_id
        )
    result = {r["nature"]: float(r["total"]) for r in rows}
    return {
        "assets":      result.get("asset",     0),
        "liabilities": result.get("liability", 0),
        "equity":      result.get("equity",    0),
        "income":      result.get("income",    0),
        "expenses":    result.get("expense",   0),
        "net_profit":  result.get("income",    0) - result.get("expense", 0),
    }
