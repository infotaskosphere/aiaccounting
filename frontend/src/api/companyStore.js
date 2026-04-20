// src/api/companyStore.js
// Real per-company data store persisted in localStorage.
// New companies start with ZERO data — no mock fallback.

const STORE_KEY = (id) => `finix_data_${id}`

// ── Empty skeleton for a brand-new company ────────────────────────────────
function emptyCompanyData() {
  return {
    dashboard: {
      balanceSheet: { assets:0, liabilities:0, equity:0, income:0, expenses:0, net_profit:0 },
      cashflow: [],
      recentVouchers: [],
      alerts: [],
    },
    vouchers: [],
    bankTransactions: [],
    gst: {
      period: '',
      output: { taxable:0, cgst:0, sgst:0, igst:0, total:0 },
      input:  { taxable:0, cgst:0, sgst:0, igst:0, total:0 },
      net_payable: { cgst:0, sgst:0, igst:0, total:0 },
      b2b_count:0, b2c_count:0, transactions:[],
    },
    payroll: {
      period:'',
      employees:[],
      totals:{ gross:0, pf_employee:0, esic_employee:0, tds:0, net:0, ctc:0 },
    },
  }
}

// ── Load company data from localStorage ──────────────────────────────────
export function loadCompanyData(companyId) {
  if (!companyId) return emptyCompanyData()
  try {
    const raw = localStorage.getItem(STORE_KEY(companyId))
    if (raw) return JSON.parse(raw)
  } catch (_) {}
  return emptyCompanyData()
}

// ── Save company data to localStorage ────────────────────────────────────
export function saveCompanyData(companyId, data) {
  if (!companyId) return
  try {
    localStorage.setItem(STORE_KEY(companyId), JSON.stringify(data))
  } catch (_) {}
}

// ── Add a voucher and recalculate dashboard ───────────────────────────────
export function addVoucher(companyId, voucher) {
  const data = loadCompanyData(companyId)
  const newVoucher = {
    id: `v-${Date.now()}`,
    voucher_no: generateVoucherNo(data.vouchers, voucher.voucher_type || voucher.type),
    ...voucher,
    voucher_type: voucher.voucher_type || voucher.type,
    status: 'posted',
    source: voucher.source || 'manual',
    created_at: new Date().toISOString(),
  }
  data.vouchers = [newVoucher, ...data.vouchers]
  data.dashboard.recentVouchers = data.vouchers.slice(0, 10)
  recalcDashboard(data)
  saveCompanyData(companyId, data)
  return newVoucher
}

// ── Add bank transactions from imported statement ─────────────────────────
export function addBankTransactions(companyId, transactions) {
  const data = loadCompanyData(companyId)
  const existingIds = new Set(data.bankTransactions.map(t => t.id))
  const newTxns = transactions
    .filter(t => !existingIds.has(t.id))
    .map((t, i) => ({
      ...t,
      id: t.id || `bt-${Date.now()}-${i}`,
      status: 'unmatched',
    }))
  data.bankTransactions = [...newTxns, ...data.bankTransactions]
  saveCompanyData(companyId, data)
  return newTxns
}

// ── Update a bank transaction status ─────────────────────────────────────
export function updateBankTransaction(companyId, txnId, updates) {
  const data = loadCompanyData(companyId)
  data.bankTransactions = data.bankTransactions.map(t =>
    t.id === txnId ? { ...t, ...updates } : t
  )
  saveCompanyData(companyId, data)
}

// ── Recalculate dashboard totals from voucher list ────────────────────────
function recalcDashboard(data) {
  let income = 0, expenses = 0
  for (const v of data.vouchers) {
    const amt = Number(v.amount) || 0
    if (['sales', 'receipt'].includes(v.voucher_type)) income += amt
    if (['purchase', 'payment'].includes(v.voucher_type)) expenses += amt
  }
  const net_profit = income - expenses
  data.dashboard.balanceSheet = {
    assets: income,
    liabilities: expenses,
    equity: net_profit,
    income,
    expenses,
    net_profit,
  }

  // Monthly cashflow from vouchers (last 6 months)
  const monthMap = {}
  for (const v of data.vouchers) {
    if (!v.date) continue
    const d = new Date(v.date)
    const key = d.toLocaleString('default', { month: 'short' })
    if (!monthMap[key]) monthMap[key] = { month: key, inflow: 0, outflow: 0, _ts: d.getTime() }
    const amt = Number(v.amount) || 0
    if (['sales', 'receipt'].includes(v.voucher_type)) monthMap[key].inflow += amt
    else monthMap[key].outflow += amt
  }
  data.dashboard.cashflow = Object.values(monthMap)
    .sort((a, b) => a._ts - b._ts)
    .slice(-6)
    .map(({ _ts, ...rest }) => rest)
}

// ── Generate voucher number ───────────────────────────────────────────────
function generateVoucherNo(vouchers, type) {
  const prefixMap = { sales:'SI', purchase:'PI', receipt:'RV', payment:'PV', journal:'JV', contra:'CV' }
  const prefix = prefixMap[type] || 'JV'
  const year = new Date().getFullYear()
  const count = vouchers.filter(v => (v.voucher_no || '').startsWith(prefix)).length + 1
  return `${prefix}-${year}-${String(count).padStart(4, '0')}`
}

// ── Clear all data for a company ──────────────────────────────────────────
export function clearCompanyData(companyId) {
  if (!companyId) return
  localStorage.removeItem(STORE_KEY(companyId))
}
