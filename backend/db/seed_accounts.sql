-- ============================================================
-- Seed: Chart of Accounts — Schedule III | Companies Act, 2013
-- Indian GST-compliant account structure
-- Run AFTER schema_v2.sql
-- ============================================================

-- Usage: Replace <COMPANY_ID> with your actual company UUID before running
-- Example: psql $DATABASE_URL -v company_id="'your-uuid-here'" -f seed_accounts.sql
-- Then call: SELECT seed_chart_of_accounts(:'company_id'::uuid);

CREATE OR REPLACE FUNCTION seed_chart_of_accounts(p_company_id UUID)
RETURNS VOID AS $$
DECLARE
    -- Group IDs
    g_equity       UUID := uuid_generate_v4();
    g_nc_assets    UUID := uuid_generate_v4();
    g_c_assets     UUID := uuid_generate_v4();
    g_nc_liab      UUID := uuid_generate_v4();
    g_c_liab       UUID := uuid_generate_v4();
    g_income       UUID := uuid_generate_v4();
    g_expenses     UUID := uuid_generate_v4();
    g_fixed_assets UUID := uuid_generate_v4();
    g_investments  UUID := uuid_generate_v4();
    g_debtors      UUID := uuid_generate_v4();
    g_cash_bank    UUID := uuid_generate_v4();
    g_loans_adv    UUID := uuid_generate_v4();
    g_creditors    UUID := uuid_generate_v4();
    g_gst_liab     UUID := uuid_generate_v4();
    g_tds_liab     UUID := uuid_generate_v4();
    g_direct_exp   UUID := uuid_generate_v4();
    g_indirect_exp UUID := uuid_generate_v4();
    g_direct_inc   UUID := uuid_generate_v4();
    g_other_inc    UUID := uuid_generate_v4();
BEGIN

-- ── Account Groups ─────────────────────────────────────────────────────────

INSERT INTO account_groups (id, company_id, name, nature, schedule_iii_head, sequence) VALUES
    (g_equity,       p_company_id, 'Shareholders'' Funds',      'equity',    'Equity and Liabilities', 1),
    (g_nc_liab,      p_company_id, 'Non-Current Liabilities',   'liability', 'Equity and Liabilities', 2),
    (g_c_liab,       p_company_id, 'Current Liabilities',       'liability', 'Equity and Liabilities', 3),
    (g_nc_assets,    p_company_id, 'Non-Current Assets',        'asset',     'Assets', 4),
    (g_c_assets,     p_company_id, 'Current Assets',            'asset',     'Assets', 5),
    (g_income,       p_company_id, 'Revenue',                   'income',    'Statement of P&L', 6),
    (g_expenses,     p_company_id, 'Expenses',                  'expense',   'Statement of P&L', 7);

INSERT INTO account_groups (id, company_id, name, parent_id, nature, schedule_iii_head, sequence) VALUES
    (g_fixed_assets, p_company_id, 'Fixed Assets (Tangible)',   g_nc_assets, 'asset', 'Non-Current Assets', 1),
    (g_investments,  p_company_id, 'Investments',               g_nc_assets, 'asset', 'Non-Current Assets', 2),
    (g_debtors,      p_company_id, 'Trade Receivables',         g_c_assets,  'asset', 'Current Assets', 1),
    (g_cash_bank,    p_company_id, 'Cash & Cash Equivalents',   g_c_assets,  'asset', 'Current Assets', 2),
    (g_loans_adv,    p_company_id, 'Short-Term Loans & Advances',g_c_assets, 'asset', 'Current Assets', 3),
    (g_creditors,    p_company_id, 'Trade Payables',            g_c_liab,    'liability', 'Current Liabilities', 1),
    (g_gst_liab,     p_company_id, 'GST Liabilities',           g_c_liab,    'liability', 'Current Liabilities', 2),
    (g_tds_liab,     p_company_id, 'TDS/Tax Liabilities',       g_c_liab,    'liability', 'Current Liabilities', 3),
    (g_direct_exp,   p_company_id, 'Direct Expenses (COGS)',    g_expenses,  'expense', 'Expenses', 1),
    (g_indirect_exp, p_company_id, 'Indirect Expenses',         g_expenses,  'expense', 'Expenses', 2),
    (g_direct_inc,   p_company_id, 'Revenue from Operations',   g_income,    'income',  'Revenue', 1),
    (g_other_inc,    p_company_id, 'Other Income',              g_income,    'income',  'Revenue', 2);

-- ── Equity & Capital ───────────────────────────────────────────────────────

INSERT INTO accounts (company_id, group_id, code, name, nature, account_type, schedule_iii_head, is_system) VALUES
    (p_company_id, g_equity, '1000', 'Capital Account',           'equity', 'capital', 'Shareholders'' Funds', TRUE),
    (p_company_id, g_equity, '1001', 'Retained Earnings',         'equity', 'capital', 'Shareholders'' Funds', TRUE),
    (p_company_id, g_equity, '1002', 'Share Capital',             'equity', 'capital', 'Shareholders'' Funds', FALSE),
    (p_company_id, g_equity, '1003', 'Securities Premium Reserve','equity', 'capital', 'Shareholders'' Funds', FALSE),
    (p_company_id, g_equity, '1004', 'General Reserve',           'equity', 'capital', 'Shareholders'' Funds', FALSE),
    (p_company_id, g_equity, '1005', 'Drawings',                  'equity', 'capital', 'Shareholders'' Funds', FALSE);

-- ── Non-Current Liabilities ────────────────────────────────────────────────

INSERT INTO accounts (company_id, group_id, code, name, nature, account_type, schedule_iii_head) VALUES
    (p_company_id, g_nc_liab, '2000', 'Long-Term Borrowings',       'liability', 'loan', 'Non-Current Liabilities'),
    (p_company_id, g_nc_liab, '2001', 'Deferred Tax Liability',     'liability', 'other','Non-Current Liabilities'),
    (p_company_id, g_nc_liab, '2002', 'Long-Term Provisions',       'liability', 'other','Non-Current Liabilities');

-- ── Current Liabilities ────────────────────────────────────────────────────

INSERT INTO accounts (company_id, group_id, code, name, nature, account_type, schedule_iii_head) VALUES
    (p_company_id, g_creditors, '3000', 'Sundry Creditors',          'liability', 'creditor', 'Current Liabilities'),
    (p_company_id, g_creditors, '3001', 'Accounts Payable',          'liability', 'creditor', 'Current Liabilities'),
    (p_company_id, g_c_liab,    '3050', 'Short-Term Borrowings',     'liability', 'loan',     'Current Liabilities'),
    (p_company_id, g_c_liab,    '3051', 'Bank Overdraft',            'liability', 'bank',     'Current Liabilities'),
    (p_company_id, g_c_liab,    '3060', 'Salary Payable',            'liability', 'other',    'Current Liabilities'),
    (p_company_id, g_c_liab,    '3061', 'PF Payable (Employer)',     'liability', 'other',    'Current Liabilities'),
    (p_company_id, g_c_liab,    '3062', 'ESIC Payable',              'liability', 'other',    'Current Liabilities'),
    (p_company_id, g_c_liab,    '3063', 'Advance from Customers',    'liability', 'other',    'Current Liabilities');

-- ── GST Liabilities & Receivables ─────────────────────────────────────────

INSERT INTO accounts (company_id, group_id, code, name, nature, account_type, schedule_iii_head, is_system) VALUES
    -- Output GST (Liabilities)
    (p_company_id, g_gst_liab, '3100', 'Output GST (Payable)',     'liability', 'tax', 'Current Liabilities', TRUE),
    (p_company_id, g_gst_liab, '3101', 'Output CGST',             'liability', 'tax', 'Current Liabilities', TRUE),
    (p_company_id, g_gst_liab, '3102', 'Output SGST',             'liability', 'tax', 'Current Liabilities', TRUE),
    (p_company_id, g_gst_liab, '3103', 'Output IGST',             'liability', 'tax', 'Current Liabilities', TRUE),
    (p_company_id, g_gst_liab, '3104', 'GST TCS Collected',       'liability', 'tax', 'Current Liabilities', FALSE),
    -- Input GST (Assets / Receivable)
    (p_company_id, g_c_assets, '3110', 'Input GST (Receivable)',  'asset', 'tax', 'Current Assets', TRUE),
    (p_company_id, g_c_assets, '3111', 'Input CGST',              'asset', 'tax', 'Current Assets', TRUE),
    (p_company_id, g_c_assets, '3112', 'Input SGST',              'asset', 'tax', 'Current Assets', TRUE),
    (p_company_id, g_c_assets, '3113', 'Input IGST',              'asset', 'tax', 'Current Assets', TRUE),
    (p_company_id, g_c_assets, '3114', 'GST Advance Deposit',     'asset', 'tax', 'Current Assets', FALSE),
    -- TDS
    (p_company_id, g_tds_liab, '3200', 'TDS Payable',             'liability', 'tax', 'Current Liabilities', TRUE),
    (p_company_id, g_tds_liab, '3201', 'TDS Deducted at Source',  'liability', 'tax', 'Current Liabilities', FALSE),
    (p_company_id, g_c_assets, '3210', 'TDS Receivable',          'asset',     'tax', 'Current Assets', FALSE),
    (p_company_id, g_tds_liab, '3220', 'Advance Tax Paid',        'asset',     'tax', 'Current Assets', FALSE);

-- ── Non-Current Assets ─────────────────────────────────────────────────────

INSERT INTO accounts (company_id, group_id, code, name, nature, account_type, schedule_iii_head) VALUES
    (p_company_id, g_fixed_assets, '4000', 'Land & Building',          'asset', 'fixed_asset', 'Non-Current Assets'),
    (p_company_id, g_fixed_assets, '4001', 'Plant & Machinery',        'asset', 'fixed_asset', 'Non-Current Assets'),
    (p_company_id, g_fixed_assets, '4002', 'Office Equipment',         'asset', 'fixed_asset', 'Non-Current Assets'),
    (p_company_id, g_fixed_assets, '4003', 'Furniture & Fixtures',     'asset', 'fixed_asset', 'Non-Current Assets'),
    (p_company_id, g_fixed_assets, '4004', 'Computers & Peripherals',  'asset', 'fixed_asset', 'Non-Current Assets'),
    (p_company_id, g_fixed_assets, '4005', 'Vehicles',                 'asset', 'fixed_asset', 'Non-Current Assets'),
    (p_company_id, g_fixed_assets, '4010', 'Accumulated Depreciation', 'asset', 'fixed_asset', 'Non-Current Assets'),
    (p_company_id, g_investments,  '4100', 'Investments - Mutual Fund','asset', 'investment',  'Non-Current Assets'),
    (p_company_id, g_investments,  '4101', 'Investments - Shares',     'asset', 'investment',  'Non-Current Assets'),
    (p_company_id, g_nc_assets,    '4200', 'Security Deposits',        'asset', 'other',       'Non-Current Assets'),
    (p_company_id, g_nc_assets,    '4201', 'Goodwill',                 'asset', 'other',       'Non-Current Assets');

-- ── Current Assets ─────────────────────────────────────────────────────────

INSERT INTO accounts (company_id, group_id, code, name, nature, account_type, schedule_iii_head, is_system) VALUES
    (p_company_id, g_debtors,  '5000', 'Sundry Debtors',             'asset', 'debtor', 'Current Assets', FALSE),
    (p_company_id, g_debtors,  '5001', 'Accounts Receivable',        'asset', 'debtor', 'Current Assets', FALSE),
    (p_company_id, g_c_assets, '5010', 'Stock / Inventory',          'asset', 'other',  'Current Assets', FALSE),
    (p_company_id, g_c_assets, '5020', 'Prepaid Expenses',           'asset', 'other',  'Current Assets', FALSE),
    (p_company_id, g_loans_adv,'5030', 'Advance to Suppliers',       'asset', 'other',  'Current Assets', FALSE),
    (p_company_id, g_loans_adv,'5031', 'Advance to Employees',       'asset', 'other',  'Current Assets', FALSE),
    (p_company_id, g_loans_adv,'5032', 'Staff Loans',                'asset', 'other',  'Current Assets', FALSE);

-- ── Cash & Bank Accounts ───────────────────────────────────────────────────

INSERT INTO accounts (company_id, group_id, code, name, nature, account_type, schedule_iii_head, is_system) VALUES
    (p_company_id, g_cash_bank, '6000', 'Cash in Hand',              'asset', 'cash', 'Current Assets', TRUE),
    (p_company_id, g_cash_bank, '6001', 'Petty Cash',                'asset', 'cash', 'Current Assets', FALSE),
    (p_company_id, g_cash_bank, '6010', 'HDFC Bank - Current',       'asset', 'bank', 'Current Assets', FALSE),
    (p_company_id, g_cash_bank, '6011', 'SBI Bank - Current',        'asset', 'bank', 'Current Assets', FALSE),
    (p_company_id, g_cash_bank, '6012', 'ICICI Bank - Savings',      'asset', 'bank', 'Current Assets', FALSE),
    (p_company_id, g_cash_bank, '6013', 'Kotak Bank - Current',      'asset', 'bank', 'Current Assets', FALSE),
    (p_company_id, g_cash_bank, '6014', 'Axis Bank - Current',       'asset', 'bank', 'Current Assets', FALSE);

-- ── Revenue / Income ───────────────────────────────────────────────────────

INSERT INTO accounts (company_id, group_id, code, name, nature, account_type, schedule_iii_head) VALUES
    (p_company_id, g_direct_inc, '7000', 'Sales - Goods',            'income', 'income', 'Revenue from Operations'),
    (p_company_id, g_direct_inc, '7001', 'Sales - Services',         'income', 'income', 'Revenue from Operations'),
    (p_company_id, g_direct_inc, '7002', 'Sales Returns',            'income', 'income', 'Revenue from Operations'),
    (p_company_id, g_direct_inc, '7003', 'Export Sales',             'income', 'income', 'Revenue from Operations'),
    (p_company_id, g_other_inc,  '7100', 'Interest Income',          'income', 'income', 'Other Income'),
    (p_company_id, g_other_inc,  '7101', 'Dividend Income',          'income', 'income', 'Other Income'),
    (p_company_id, g_other_inc,  '7102', 'Rental Income',            'income', 'income', 'Other Income'),
    (p_company_id, g_other_inc,  '7103', 'Discount Received',        'income', 'income', 'Other Income'),
    (p_company_id, g_other_inc,  '7104', 'Profit on Asset Sale',     'income', 'income', 'Other Income'),
    (p_company_id, g_other_inc,  '7105', 'Miscellaneous Income',     'income', 'income', 'Other Income');

-- ── Direct Expenses (COGS) ─────────────────────────────────────────────────

INSERT INTO accounts (company_id, group_id, code, name, nature, account_type, schedule_iii_head) VALUES
    (p_company_id, g_direct_exp, '8000', 'Purchases - Goods',        'expense', 'expense', 'Cost of Goods Sold'),
    (p_company_id, g_direct_exp, '8001', 'Purchases - Services',     'expense', 'expense', 'Cost of Goods Sold'),
    (p_company_id, g_direct_exp, '8002', 'Freight & Cartage Inward', 'expense', 'expense', 'Cost of Goods Sold'),
    (p_company_id, g_direct_exp, '8003', 'Import Duties',            'expense', 'expense', 'Cost of Goods Sold'),
    (p_company_id, g_direct_exp, '8004', 'Stock Consumed',           'expense', 'expense', 'Cost of Goods Sold');

-- ── Indirect Expenses ──────────────────────────────────────────────────────

INSERT INTO accounts (company_id, group_id, code, name, nature, account_type, schedule_iii_head) VALUES
    (p_company_id, g_indirect_exp, '8100', 'Salaries & Wages',        'expense', 'expense', 'Employee Benefit Expense'),
    (p_company_id, g_indirect_exp, '8101', 'Director Remuneration',   'expense', 'expense', 'Employee Benefit Expense'),
    (p_company_id, g_indirect_exp, '8102', 'PF Contribution (Employer)','expense','expense','Employee Benefit Expense'),
    (p_company_id, g_indirect_exp, '8103', 'ESIC Contribution (Employer)','expense','expense','Employee Benefit Expense'),
    (p_company_id, g_indirect_exp, '8104', 'Gratuity Expense',        'expense', 'expense', 'Employee Benefit Expense'),
    (p_company_id, g_indirect_exp, '8110', 'Rent',                    'expense', 'expense', 'Other Expenses'),
    (p_company_id, g_indirect_exp, '8111', 'Electricity & Power',     'expense', 'expense', 'Other Expenses'),
    (p_company_id, g_indirect_exp, '8112', 'Internet & Telephone',    'expense', 'expense', 'Other Expenses'),
    (p_company_id, g_indirect_exp, '8113', 'Office Maintenance',      'expense', 'expense', 'Other Expenses'),
    (p_company_id, g_indirect_exp, '8114', 'Office Supplies & Stationery','expense','expense','Other Expenses'),
    (p_company_id, g_indirect_exp, '8115', 'Software & Subscriptions','expense', 'expense', 'Other Expenses'),
    (p_company_id, g_indirect_exp, '8116', 'Travel & Conveyance',     'expense', 'expense', 'Other Expenses'),
    (p_company_id, g_indirect_exp, '8117', 'Vehicle & Fuel Expense',  'expense', 'expense', 'Other Expenses'),
    (p_company_id, g_indirect_exp, '8118', 'Advertising & Marketing', 'expense', 'expense', 'Other Expenses'),
    (p_company_id, g_indirect_exp, '8119', 'Professional Fees (CA/CS)','expense','expense', 'Other Expenses'),
    (p_company_id, g_indirect_exp, '8120', 'Legal Fees',              'expense', 'expense', 'Other Expenses'),
    (p_company_id, g_indirect_exp, '8121', 'Audit Fees',              'expense', 'expense', 'Other Expenses'),
    (p_company_id, g_indirect_exp, '8122', 'Printing & Stationery',   'expense', 'expense', 'Other Expenses'),
    (p_company_id, g_indirect_exp, '8123', 'Postage & Courier',       'expense', 'expense', 'Other Expenses'),
    (p_company_id, g_indirect_exp, '8124', 'Insurance Expense',       'expense', 'expense', 'Other Expenses'),
    (p_company_id, g_indirect_exp, '8125', 'Repairs & Maintenance',   'expense', 'expense', 'Other Expenses'),
    (p_company_id, g_indirect_exp, '8126', 'Depreciation',            'expense', 'expense', 'Depreciation'),
    (p_company_id, g_indirect_exp, '8127', 'Amortisation',            'expense', 'expense', 'Depreciation'),
    (p_company_id, g_indirect_exp, '8130', 'Bank Charges',            'expense', 'expense', 'Finance Costs'),
    (p_company_id, g_indirect_exp, '8131', 'Interest on Loan',        'expense', 'expense', 'Finance Costs'),
    (p_company_id, g_indirect_exp, '8132', 'Loan Processing Fee',     'expense', 'expense', 'Finance Costs'),
    (p_company_id, g_indirect_exp, '8133', 'Interest on Overdraft',   'expense', 'expense', 'Finance Costs'),
    (p_company_id, g_indirect_exp, '8140', 'GST Late Fee / Penalty',  'expense', 'expense', 'Other Expenses'),
    (p_company_id, g_indirect_exp, '8141', 'Income Tax Expense',      'expense', 'expense', 'Tax Expense'),
    (p_company_id, g_indirect_exp, '8142', 'Deferred Tax Expense',    'expense', 'expense', 'Tax Expense'),
    (p_company_id, g_indirect_exp, '8150', 'Commission & Brokerage',  'expense', 'expense', 'Other Expenses'),
    (p_company_id, g_indirect_exp, '8151', 'Donations & CSR',         'expense', 'expense', 'Other Expenses'),
    (p_company_id, g_indirect_exp, '8152', 'Training & Development',  'expense', 'expense', 'Other Expenses'),
    (p_company_id, g_indirect_exp, '8199', 'Miscellaneous Expenses',  'expense', 'expense', 'Other Expenses');

END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- SAMPLE DATA INSERTION  (for testing — remove in production)
-- ============================================================

DO $$
DECLARE
    sample_company UUID;
    sample_user    UUID;
BEGIN
    -- Create sample company
    INSERT INTO companies (id, name, gstin, pan, address, city, state, state_code, financial_year)
    VALUES (
        uuid_generate_v4(),
        'Sample Business Pvt Ltd',
        '24AABCS1429B1ZB',
        'AABCS1429B',
        '123, Commerce Street, Athwa',
        'Surat',
        'Gujarat',
        '24',
        '2024-25'
    ) RETURNING id INTO sample_company;

    -- Create admin user (password: Admin@123)
    INSERT INTO users (company_id, email, password_hash, name, role)
    VALUES (
        sample_company,
        'admin@sample.com',
        '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TiGniMJM.KJU.kd5nCX7ZX9K5oNG',
        'Admin User',
        'owner'
    ) RETURNING id INTO sample_user;

    -- Seed chart of accounts
    PERFORM seed_chart_of_accounts(sample_company);

    -- Create a sample bank account linked to HDFC
    INSERT INTO bank_accounts (company_id, account_id, bank_name, account_number, ifsc, branch)
    SELECT sample_company, id, 'HDFC Bank', '12345678901234', 'HDFC0001234', 'Surat Main'
    FROM accounts WHERE company_id = sample_company AND code = '6010';

    RAISE NOTICE 'Sample data created. Company ID: %', sample_company;
END $$;
