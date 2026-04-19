# backend/app/models.py
# Pydantic v2 models — request validation + response serialization

from __future__ import annotations
from datetime import date
from decimal import Decimal
from typing import Optional
from pydantic import BaseModel, Field, field_validator


# ── Auth ───────────────────────────────────────────────────────────────────

class LoginRequest(BaseModel):
    email:    str
    password: str

class TokenResponse(BaseModel):
    access_token: str
    token_type:   str = "bearer"
    company_id:   str
    user_role:    str


# ── Company ────────────────────────────────────────────────────────────────

class CompanyCreate(BaseModel):
    name:           str
    gstin:          Optional[str] = None
    pan:            Optional[str] = None
    address:        Optional[str] = None
    financial_year: str = "2024-25"


# ── Accounts ───────────────────────────────────────────────────────────────

class AccountCreate(BaseModel):
    code:            str
    name:            str
    nature:          str   # asset | liability | equity | income | expense
    account_type:    str   # bank | cash | debtor | creditor | income | expense | tax | capital
    group_id:        Optional[str] = None
    opening_balance: Decimal = Decimal("0")
    opening_dr_cr:   str = "dr"
    gstin:           Optional[str] = None

class AccountResponse(BaseModel):
    id:           str
    code:         str
    name:         str
    nature:       str
    account_type: str
    balance:      Decimal = Decimal("0")


# ── Journal Lines ──────────────────────────────────────────────────────────

class JournalLineIn(BaseModel):
    account_id: str
    dr_amount:  Decimal = Decimal("0")
    cr_amount:  Decimal = Decimal("0")
    narration:  str = ""

    @field_validator("dr_amount", "cr_amount")
    @classmethod
    def non_negative(cls, v: Decimal) -> Decimal:
        if v < 0:
            raise ValueError("Amount cannot be negative")
        return v


# ── Vouchers ───────────────────────────────────────────────────────────────

class VoucherCreate(BaseModel):
    company_id:   str
    voucher_type: str   # journal | payment | receipt | sales | purchase | contra
    date:         date
    narration:    str
    reference:    str = ""
    lines:        list[JournalLineIn] = Field(..., min_length=2)

    @field_validator("voucher_type")
    @classmethod
    def valid_type(cls, v: str) -> str:
        allowed = {"journal","payment","receipt","sales","purchase","contra","debit_note","credit_note"}
        if v not in allowed:
            raise ValueError(f"voucher_type must be one of {allowed}")
        return v

class VoucherResponse(BaseModel):
    voucher_id: str
    voucher_no: str
    status:     str


# ── Invoice Webhook ────────────────────────────────────────────────────────

class InvoiceWebhookPayload(BaseModel):
    company_id:       str
    invoice_no:       str
    invoice_type:     str = "sales"   # sales | purchase
    invoice_date:     str             # ISO date string
    party_name:       str
    party_account_id: Optional[str] = None
    subtotal:         Decimal
    cgst:             Decimal = Decimal("0")
    sgst:             Decimal = Decimal("0")
    igst:             Decimal = Decimal("0")
    total:            Decimal
    external_id:      Optional[str] = None


# ── Bank Import ────────────────────────────────────────────────────────────

class BankImportResponse(BaseModel):
    staged:        int
    total_parsed:  int
    file_type:     str
    bank_account_id: str


# ── AI Classification ──────────────────────────────────────────────────────

class ClassifyRequest(BaseModel):
    company_id: str
    narrations: list[str] = Field(..., min_length=1, max_length=100)

class ClassifyResult(BaseModel):
    narration:       str
    account_id:      str
    account_name:    str
    confidence:      float
    method:          str   # exact | rule | embedding | fallback
    requires_review: bool

class ClassifyResponse(BaseModel):
    results: list[ClassifyResult]


# ── Reconciliation ─────────────────────────────────────────────────────────

class ReconcileResponse(BaseModel):
    auto_matched:  int
    needs_review:  int
    total_scanned: int


# ── GST ────────────────────────────────────────────────────────────────────

class GSTTransactionIn(BaseModel):
    party_gstin:     Optional[str] = None
    party_name:      str
    invoice_no:      str
    invoice_date:    date
    place_of_supply: str = "29"
    supply_type:     str = "B2B"
    hsn_sac:         Optional[str] = None
    taxable_value:   Decimal
    gst_rate:        Decimal
    cgst:            Decimal = Decimal("0")
    sgst:            Decimal = Decimal("0")
    igst:            Decimal = Decimal("0")
    cess:            Decimal = Decimal("0")


# ── Payroll ────────────────────────────────────────────────────────────────

class EmployeeCreate(BaseModel):
    employee_code:     str
    name:              str
    pan:               Optional[str] = None
    pf_number:         Optional[str] = None
    esic_number:       Optional[str] = None
    bank_account:      Optional[str] = None
    ifsc:              Optional[str] = None
    basic_salary:      Decimal
    hra:               Decimal = Decimal("0")
    special_allowance: Decimal = Decimal("0")

class PayrollRunResponse(BaseModel):
    period:          str
    employee_count:  int
    totals:          dict


# ── Reports ────────────────────────────────────────────────────────────────

class BalanceSheetResponse(BaseModel):
    assets:      float
    liabilities: float
    equity:      float
    income:      float
    expenses:    float
    net_profit:  float
