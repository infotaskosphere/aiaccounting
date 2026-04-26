-- ============================================================
-- AI Accounting System - PostgreSQL Schema v2.1 (PRODUCTION)
-- Indian Business | GST | Schedule III | Double-Entry
-- ============================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "vector";   -- pgvector for AI embeddings (install separately)

-- ============================================================
-- HELPER FUNCTIONS
-- ============================================================

CREATE OR REPLACE FUNCTION next_voucher_no(p_company_id UUID, p_type TEXT)
RETURNS TEXT AS $$
DECLARE
    prefix TEXT;
    seq    INT;
    fy     TEXT;
BEGIN
    SELECT financial_year INTO fy FROM companies WHERE id = p_company_id;
    prefix := UPPER(LEFT(p_type, 3)) || '/' || REPLACE(COALESCE(fy, '2024-25'), '-', '');
    SELECT COALESCE(MAX(CAST(SPLIT_PART(voucher_no, '/', 3) AS INT)), 0) + 1
      INTO seq
      FROM vouchers
     WHERE company_id = p_company_id
       AND voucher_type = p_type;
    RETURN prefix || '/' || LPAD(seq::TEXT, 5, '0');
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- MULTI-TENANCY
-- ============================================================

CREATE TABLE companies (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name            TEXT NOT NULL,
    gstin           TEXT,
    pan             TEXT,
    cin             TEXT,                        -- Company Identification Number
    tan             TEXT,                        -- TDS deduction number
    address         TEXT,
    city            TEXT,
    state           TEXT,
    state_code      TEXT DEFAULT '24',           -- Gujarat default
    pincode         TEXT,
    financial_year  TEXT DEFAULT '2024-25',
    currency        TEXT DEFAULT 'INR',
    mode            TEXT DEFAULT 'accountant' CHECK (mode IN ('accountant','simple')),
    logo_url        TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE users (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id      UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    email           TEXT NOT NULL UNIQUE,
    password_hash   TEXT NOT NULL,
    name            TEXT,
    role            TEXT NOT NULL DEFAULT 'accountant'
                    CHECK (role IN ('owner','manager','accountant','viewer')),
    is_active       BOOLEAN DEFAULT TRUE,
    last_login_at   TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- CHART OF ACCOUNTS  (Schedule III of Companies Act, 2013)
-- ============================================================

CREATE TABLE account_groups (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id      UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    parent_id       UUID REFERENCES account_groups(id),
    nature          TEXT NOT NULL CHECK (nature IN ('asset','liability','equity','income','expense')),
    schedule_iii_head TEXT,                      -- "Non-Current Assets", "Current Assets", etc.
    sequence        INT DEFAULT 0
);

CREATE TABLE accounts (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id      UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    group_id        UUID REFERENCES account_groups(id),
    code            TEXT NOT NULL,
    name            TEXT NOT NULL,
    nature          TEXT NOT NULL CHECK (nature IN ('asset','liability','equity','income','expense')),
    account_type    TEXT NOT NULL CHECK (account_type IN (
                        'bank','cash','debtor','creditor',
                        'income','expense','tax','capital',
                        'fixed_asset','investment','loan','other'
                    )),
    schedule_iii_head TEXT,                      -- Schedule III sub-head
    gstin           TEXT,
    pan             TEXT,
    opening_balance NUMERIC(18,2) DEFAULT 0,
    opening_dr_cr   TEXT DEFAULT 'dr' CHECK (opening_dr_cr IN ('dr','cr')),
    is_system       BOOLEAN DEFAULT FALSE,
    is_active       BOOLEAN DEFAULT TRUE,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (company_id, code)
);

CREATE INDEX idx_accounts_company      ON accounts(company_id);
CREATE INDEX idx_accounts_nature       ON accounts(company_id, nature);
CREATE INDEX idx_accounts_name_trgm    ON accounts USING GIN (name gin_trgm_ops);
CREATE INDEX idx_accounts_type         ON accounts(company_id, account_type);

-- ============================================================
-- VOUCHERS & JOURNAL ENTRIES
-- ============================================================

CREATE TABLE vouchers (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id      UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    voucher_no      TEXT NOT NULL,
    voucher_type    TEXT NOT NULL CHECK (voucher_type IN (
                        'journal','payment','receipt','contra',
                        'sales','purchase','debit_note','credit_note'
                    )),
    date            DATE NOT NULL,
    narration       TEXT,
    reference       TEXT,
    source          TEXT DEFAULT 'manual' CHECK (source IN (
                        'manual','invoice_webhook','bank_import',
                        'payment_gateway','payroll','ai_suggested','ai_auto'
                    )),
    ai_confidence   NUMERIC(5,4),
    status          TEXT DEFAULT 'posted' CHECK (status IN ('draft','pending_approval','posted','reversed')),
    approval_status TEXT DEFAULT 'auto' CHECK (approval_status IN ('auto','pending','approved','rejected')),
    approved_by     UUID REFERENCES users(id),
    approved_at     TIMESTAMPTZ,
    reversed_by     UUID REFERENCES vouchers(id),
    created_by      UUID REFERENCES users(id),
    tally_exported  BOOLEAN DEFAULT FALSE,
    tally_exported_at TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (company_id, voucher_no)
);

CREATE INDEX idx_vouchers_company_date  ON vouchers(company_id, date DESC);
CREATE INDEX idx_vouchers_status        ON vouchers(status);
CREATE INDEX idx_vouchers_source        ON vouchers(source);
CREATE INDEX idx_vouchers_approval      ON vouchers(approval_status);

CREATE TABLE journal_lines (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    voucher_id      UUID NOT NULL REFERENCES vouchers(id) ON DELETE CASCADE,
    account_id      UUID NOT NULL REFERENCES accounts(id),
    dr_amount       NUMERIC(18,2) DEFAULT 0 CHECK (dr_amount >= 0),
    cr_amount       NUMERIC(18,2) DEFAULT 0 CHECK (cr_amount >= 0),
    narration       TEXT,
    cost_center     TEXT,
    project_code    TEXT,
    sequence        INT DEFAULT 0,
    CHECK ((dr_amount > 0 AND cr_amount = 0) OR (cr_amount > 0 AND dr_amount = 0))
);

CREATE INDEX idx_journal_lines_voucher  ON journal_lines(voucher_id);
CREATE INDEX idx_journal_lines_account  ON journal_lines(account_id);

-- ============================================================
-- BANK ACCOUNTS & TRANSACTIONS
-- ============================================================

CREATE TABLE bank_accounts (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id      UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    account_id      UUID NOT NULL REFERENCES accounts(id),
    bank_name       TEXT NOT NULL,
    account_number  TEXT NOT NULL,
    ifsc            TEXT,
    branch          TEXT,
    is_active       BOOLEAN DEFAULT TRUE,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE bank_transactions (
    id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    bank_account_id       UUID NOT NULL REFERENCES bank_accounts(id),
    company_id            UUID,
    txn_date              DATE NOT NULL,
    value_date            DATE,
    amount                NUMERIC(18,2) NOT NULL,
    txn_type              TEXT CHECK (txn_type IN ('debit','credit')),
    narration             TEXT,
    reference             TEXT,
    cheque_number         TEXT,
    balance               NUMERIC(18,2),
    payment_mode          TEXT,                     -- UPI|NEFT|IMPS|RTGS|CHEQUE|CASH
    upi_id                TEXT,
    status                TEXT DEFAULT 'unmatched'
                          CHECK (status IN ('unmatched','matched','review','excluded','auto_posted')),
    matched_voucher_id    UUID REFERENCES vouchers(id),
    ai_match_confidence   NUMERIC(5,4),
    ai_suggested_account_id UUID REFERENCES accounts(id),
    reconciled_at         TIMESTAMPTZ,
    reconciled_by         UUID REFERENCES users(id),
    raw_data              TEXT,
    created_at            TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (bank_account_id, txn_date, amount, narration)
);

CREATE INDEX idx_bank_txn_status        ON bank_transactions(status);
CREATE INDEX idx_bank_txn_date          ON bank_transactions(txn_date DESC);
CREATE INDEX idx_bank_txn_company       ON bank_transactions(company_id);
CREATE INDEX idx_bank_txn_bank_account  ON bank_transactions(bank_account_id);

-- ============================================================
-- GST TRANSACTIONS
-- ============================================================

CREATE TABLE gst_transactions (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id      UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    voucher_id      UUID REFERENCES vouchers(id),
    invoice_id      TEXT,
    txn_type        TEXT CHECK (txn_type IN ('input','output')),
    party_gstin     TEXT,
    party_name      TEXT,
    place_of_supply TEXT,
    supply_type     TEXT DEFAULT 'B2B',
    hsn_sac         TEXT,
    taxable_value   NUMERIC(18,2) NOT NULL DEFAULT 0,
    gst_rate        NUMERIC(5,2) NOT NULL DEFAULT 0,
    cgst            NUMERIC(18,2) DEFAULT 0,
    sgst            NUMERIC(18,2) DEFAULT 0,
    igst            NUMERIC(18,2) DEFAULT 0,
    cess            NUMERIC(18,2) DEFAULT 0,
    total_gst       NUMERIC(18,2) DEFAULT 0,
    total_amount    NUMERIC(18,2) DEFAULT 0,
    is_reverse_charge BOOLEAN DEFAULT FALSE,
    period          TEXT,                           -- "032024" MMYYYY
    gstr1_filed     BOOLEAN DEFAULT FALSE,
    gstr3b_filed    BOOLEAN DEFAULT FALSE,
    gstr2b_matched  BOOLEAN DEFAULT FALSE,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_gst_company    ON gst_transactions(company_id, period);
CREATE INDEX idx_gst_type       ON gst_transactions(txn_type);
CREATE INDEX idx_gst_voucher    ON gst_transactions(voucher_id);

-- ============================================================
-- AI CLASSIFICATION & TRAINING DATA
-- ============================================================

CREATE TABLE ai_classifications (
    id                    BIGSERIAL PRIMARY KEY,
    company_id            UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    narration             TEXT NOT NULL,
    narration_normalized  TEXT,
    suggested_account_id  UUID REFERENCES accounts(id),
    confirmed_account_id  UUID REFERENCES accounts(id),
    confidence            NUMERIC(5,4),
    method                TEXT,                    -- rule|embedding|openai|exact|fallback
    corrected_by          UUID REFERENCES users(id),
    corrected_at          TIMESTAMPTZ,
    correction_count      INT DEFAULT 0,
    embedding             vector(384),             -- sentence-transformers embedding
    created_at            TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (company_id, narration)
);

CREATE INDEX idx_ai_class_company       ON ai_classifications(company_id);
CREATE INDEX idx_ai_class_confirmed     ON ai_classifications(company_id, confirmed_account_id)
                                         WHERE confirmed_account_id IS NOT NULL;

CREATE TABLE ai_training_data (
    id              BIGSERIAL PRIMARY KEY,
    company_id      UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    narration       TEXT NOT NULL,
    account_id      UUID NOT NULL REFERENCES accounts(id),
    account_name    TEXT,
    source          TEXT DEFAULT 'correction',     -- correction|seed|import
    weight          NUMERIC(4,2) DEFAULT 1.0,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_training_company ON ai_training_data(company_id);

-- ============================================================
-- IMMUTABLE AUDIT LOG
-- ============================================================

CREATE TABLE audit_log (
    id              BIGSERIAL PRIMARY KEY,
    company_id      UUID NOT NULL,
    entity_type     TEXT NOT NULL,
    entity_id       TEXT NOT NULL,
    action          TEXT NOT NULL,
    actor_id        UUID REFERENCES users(id),
    before_data     JSONB,
    after_data      JSONB,
    ip_address      TEXT,
    user_agent      TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_audit_entity   ON audit_log(entity_type, entity_id);
CREATE INDEX idx_audit_company  ON audit_log(company_id, created_at DESC);
CREATE INDEX idx_audit_actor    ON audit_log(actor_id);

-- ============================================================
-- PAYROLL
-- ============================================================

CREATE TABLE employees (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id      UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    employee_code   TEXT NOT NULL,
    name            TEXT NOT NULL,
    pan             TEXT,
    pf_number       TEXT,
    esic_number     TEXT,
    bank_account    TEXT,
    ifsc            TEXT,
    basic_salary    NUMERIC(18,2) NOT NULL DEFAULT 0,
    hra             NUMERIC(18,2) DEFAULT 0,
    special_allowance NUMERIC(18,2) DEFAULT 0,
    department      TEXT,
    designation     TEXT,
    doj             DATE,                          -- Date of Joining
    is_active       BOOLEAN DEFAULT TRUE,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (company_id, employee_code)
);

CREATE TABLE payroll_runs (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id      UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    period          TEXT NOT NULL,
    voucher_id      UUID REFERENCES vouchers(id),
    total_gross     NUMERIC(18,2) DEFAULT 0,
    total_net       NUMERIC(18,2) DEFAULT 0,
    total_pf        NUMERIC(18,2) DEFAULT 0,
    total_esic      NUMERIC(18,2) DEFAULT 0,
    total_tds       NUMERIC(18,2) DEFAULT 0,
    employee_count  INT DEFAULT 0,
    status          TEXT DEFAULT 'draft' CHECK (status IN ('draft','processed','paid')),
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- RECONCILIATION SESSIONS
-- ============================================================

CREATE TABLE reconciliation_sessions (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id      UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    bank_account_id UUID REFERENCES bank_accounts(id),
    period_from     DATE,
    period_to       DATE,
    opening_balance NUMERIC(18,2) DEFAULT 0,
    closing_balance NUMERIC(18,2) DEFAULT 0,
    matched_count   INT DEFAULT 0,
    unmatched_count INT DEFAULT 0,
    status          TEXT DEFAULT 'open' CHECK (status IN ('open','completed')),
    created_by      UUID REFERENCES users(id),
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- VIEWS FOR REPORTING
-- ============================================================

-- Running balance view
CREATE VIEW account_balances AS
SELECT
    a.company_id,
    a.id            AS account_id,
    a.code,
    a.name,
    a.nature,
    a.account_type,
    a.schedule_iii_head,
    a.opening_balance,
    a.opening_dr_cr,
    COALESCE(SUM(jl.dr_amount), 0)                               AS total_dr,
    COALESCE(SUM(jl.cr_amount), 0)                               AS total_cr,
    CASE
        WHEN a.opening_dr_cr = 'dr'
             THEN a.opening_balance + COALESCE(SUM(jl.dr_amount),0) - COALESCE(SUM(jl.cr_amount),0)
        ELSE  a.opening_balance + COALESCE(SUM(jl.cr_amount),0) - COALESCE(SUM(jl.dr_amount),0)
    END                                                           AS closing_balance,
    CASE
        WHEN a.nature IN ('asset','expense')  THEN 'dr'
        ELSE                                       'cr'
    END                                                           AS normal_balance_side
FROM accounts a
LEFT JOIN journal_lines jl ON jl.account_id = a.id
LEFT JOIN vouchers v       ON v.id = jl.voucher_id AND v.status = 'posted'
GROUP BY a.id;

-- Trial balance view
CREATE VIEW trial_balance AS
SELECT
    ab.company_id,
    ab.code,
    ab.name,
    ab.nature,
    ab.account_type,
    ab.schedule_iii_head,
    ab.opening_balance,
    ab.opening_dr_cr,
    ab.total_dr,
    ab.total_cr,
    ab.closing_balance,
    ab.normal_balance_side,
    CASE WHEN ab.normal_balance_side = 'dr' AND ab.closing_balance >= 0
         THEN ab.closing_balance ELSE 0 END                       AS closing_dr,
    CASE WHEN ab.normal_balance_side = 'cr' AND ab.closing_balance >= 0
         THEN ab.closing_balance ELSE 0 END                       AS closing_cr
FROM account_balances ab
WHERE ab.closing_balance <> 0 OR ab.total_dr <> 0 OR ab.total_cr <> 0;

-- ============================================================
-- INDEXES for Performance
-- ============================================================

CREATE INDEX idx_vouchers_date_company  ON vouchers(date, company_id);
CREATE INDEX idx_jl_account_voucher     ON journal_lines(account_id, voucher_id);
