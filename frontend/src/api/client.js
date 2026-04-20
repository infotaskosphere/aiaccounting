// src/api/client.js  (v2 — UPGRADED)
// Centralized API layer — all backend calls go through here

import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
})

// ── Auth token injection ──────────────────────────────────────────────────
api.interceptors.request.use(cfg => {
  const token = localStorage.getItem('token')
  if (token) cfg.headers.Authorization = `Bearer ${token}`
  return cfg
})

// ── Error normaliser ──────────────────────────────────────────────────────
api.interceptors.response.use(
  res => res,
  err => {
    if (err.response?.status === 401) {
      localStorage.removeItem('token')
      localStorage.removeItem('company_id')
      window.location.href = '/login'
    }
    return Promise.reject(err)
  }
)

export const getCompanyId = () =>
  localStorage.getItem('company_id') || 'demo-company-uuid'

const cid = () => getCompanyId()

// ════════════════════════════════════════════════════════════════════════════
// AUTH
// ════════════════════════════════════════════════════════════════════════════
export const authApi = {
  login:    (email, password) => api.post('/v1/auth/login', { email, password }),
  register: (data) => api.post('/v1/auth/register', data),
}

// ════════════════════════════════════════════════════════════════════════════
// UPLOAD & INGESTION  (new)
// ════════════════════════════════════════════════════════════════════════════
export const uploadApi = {
  bankStatement: (bankAccountId, file) => {
    const form = new FormData()
    form.append('file', file)
    return api.post(`/v1/upload/bank-statement/${bankAccountId}`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
  },
  invoice: (file, invoiceType = 'sales') => {
    const form = new FormData()
    form.append('file', file)
    return api.post(`/v1/upload/invoice?invoice_type=${invoiceType}`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
  },
  getClassifiedTransactions: (bankAccountId) =>
    api.get(`/v1/bank-transactions/classified?bank_account_id=${bankAccountId}`),
  correctClassification: (data) => api.post('/v1/ai/correct', data),
  confirmAndPost: (data) => api.post('/v1/transactions/batch-post', data),
}

// ════════════════════════════════════════════════════════════════════════════
// SMART ASSISTANT  (new)
// ════════════════════════════════════════════════════════════════════════════
export const assistantApi = {
  chat:           (message, history = []) => api.post('/v1/assistant/chat', { message, history }),
  quickQuestions: ()                       => api.get('/v1/assistant/quick-questions'),
}

// ════════════════════════════════════════════════════════════════════════════
// AI FEATURES  (new)
// ════════════════════════════════════════════════════════════════════════════
export const aiApi = {
  classify:       (narrations) => api.post('/v1/ai/classify', { narrations }),
  correct:        (data)       => api.post('/v1/ai/correct', data),
  suggestLedger:  (narration)  => api.get(`/v1/ai/suggest-ledger?narration=${encodeURIComponent(narration)}`),
  learningStats:  ()           => api.get('/v1/ai/learning-stats'),
  anomalies:      ()           => api.get('/v1/ai/anomalies'),
}

// ════════════════════════════════════════════════════════════════════════════
// RECONCILIATION  (upgraded)
// ════════════════════════════════════════════════════════════════════════════
export const reconcileApi = {
  run:          (bankAccountId) => api.post(`/v1/reconcile${bankAccountId ? `?bank_account_id=${bankAccountId}` : ''}`),
  confirmMatch: (bankTxnId, voucherId) => api.post('/v1/reconcile/confirm', null, { params: { bank_txn_id: bankTxnId, voucher_id: voucherId } }),
  unmatch:      (bankTxnId) => api.post(`/v1/reconcile/unmatch?bank_txn_id=${bankTxnId}`),
  getUnmatched: ()          => api.get('/v1/reconcile/unmatched'),
  getSummary:   ()          => api.get('/v1/reconcile/summary'),
}

// ════════════════════════════════════════════════════════════════════════════
// REPORTING v2  (upgraded — instant intelligent reports)
// ════════════════════════════════════════════════════════════════════════════
export const reportingApi = {
  getDashboard:      ()           => api.get('/v2/reports/dashboard'),
  getPnL:            (from, to, lang='simple') =>
    api.get(`/v2/reports/pnl${_qs({from_date:from, to_date:to, lang})}`),
  getCashflow:       (from, to)   => api.get(`/v2/reports/cashflow${_qs({from_date:from, to_date:to})}`),
  getAging:          (type)       => api.get(`/v2/reports/aging/${type}`),
  getExpenses:       (from, to)   => api.get(`/v2/reports/expenses${_qs({from_date:from, to_date:to})}`),

  // Legacy v1
  getTrialBalance:  () => api.get(`/v1/reports/${cid()}/trial-balance`),
  getBalanceSheet:  () => api.get(`/v1/reports/${cid()}/balance-sheet`),
}

// ════════════════════════════════════════════════════════════════════════════
// VOUCHERS / JOURNAL
// ════════════════════════════════════════════════════════════════════════════
export const vouchersApi = {
  list:    (params = {}) => api.get('/v1/vouchers', { params: { company_id: cid(), ...params } }),
  create:  (data)        => api.post('/v1/vouchers', { ...data, company_id: cid() }),
  edit:    (id, data)    => api.patch(`/v1/vouchers/${id}`, data),
  approve: (id)          => api.post(`/v1/vouchers/${id}/approve`),
  reverse: (id)          => api.post(`/v1/vouchers/${id}/reverse`),
  getLedger: (accountId, params = {}) =>
    api.get(`/v1/ledger/${accountId}`, { params: { company_id: cid(), ...params } }),
}

// ════════════════════════════════════════════════════════════════════════════
// ACCOUNTS
// ════════════════════════════════════════════════════════════════════════════
export const accountsApi = {
  list:   ()     => api.get(`/v1/accounts?company_id=${cid()}`),
  create: (data) => api.post('/v1/accounts', { ...data, company_id: cid() }),
}

// ════════════════════════════════════════════════════════════════════════════
// BANK
// ════════════════════════════════════════════════════════════════════════════
export const bankApi = {
  getBankAccounts: () => api.get(`/v1/bank-accounts?company_id=${cid()}`),
  importStatement: (bankAccountId, file) => {
    const form = new FormData()
    form.append('file', file)
    return api.post(`/v1/bank/${bankAccountId}/import`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
  },
}

// ════════════════════════════════════════════════════════════════════════════
// SIMPLE MODE  (new)
// ════════════════════════════════════════════════════════════════════════════
export const simpleModeApi = {
  postTransaction: (data) => api.post('/v1/simple/transaction', data),
  getRecent:       ()     => api.get(`/v1/simple/recent?company_id=${cid()}`),
  getSummary:      ()     => api.get(`/v1/simple/summary?company_id=${cid()}`),
}

// ════════════════════════════════════════════════════════════════════════════
// GST
// ════════════════════════════════════════════════════════════════════════════
export const gstApi = {
  getGSTR1: (period) => api.get(`/v1/gst/${cid()}/gstr1/${period}`),
  getGSTR3B: (period) => api.get(`/v1/gst/${cid()}/gstr3b/${period}`),
}

// ════════════════════════════════════════════════════════════════════════════
// PAYROLL
// ════════════════════════════════════════════════════════════════════════════
export const payrollApi = {
  run:   (period) => api.post(`/v1/payroll/${cid()}/run/${period}`),
  list:  ()       => api.get(`/v1/employees?company_id=${cid()}`),
}

// ════════════════════════════════════════════════════════════════════════════
// AUDIT LOG  (new)
// ════════════════════════════════════════════════════════════════════════════
export const auditApi = {
  get: (entityType, entityId, limit = 50) =>
    api.get(`/v1/audit`, { params: { entity_type: entityType, entity_id: entityId, limit } }),
}

// ════════════════════════════════════════════════════════════════════════════
// COMPANIES
// ════════════════════════════════════════════════════════════════════════════
export const companiesApi = {
  list:   ()     => api.get('/v1/companies'),
  create: (data) => api.post('/v1/companies', data),
}

// ── Helpers ───────────────────────────────────────────────────────────────
function _qs(params) {
  const q = Object.entries(params)
    .filter(([, v]) => v != null)
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join('&')
  return q ? `?${q}` : ''
}

// Legacy compat — keep existing imports working
export const dashboardApi = {
  getBalanceSheet:   () => reportingApi.getBalanceSheet(),
  getTrialBalance:   () => reportingApi.getTrialBalance(),
  getRecentVouchers: () => vouchersApi.list({ limit: 10 }),
  getCashflow:       () => reportingApi.getCashflow(),
}
