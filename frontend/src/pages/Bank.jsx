// src/pages/Bank.jsx — FIXED: AI parsing via backend (no CORS, no direct Anthropic calls)
import { useState, useCallback, useEffect } from 'react'
import { useDropzone } from 'react-dropzone'
import { useSearchParams } from 'react-router-dom'
import {
  Upload, CheckCircle, X, Zap, RefreshCw, FileText,
  CreditCard, Brain, Download, Search,
  Filter, Edit3, Trash2, ArrowUpCircle, ArrowDownCircle
} from 'lucide-react'
import toast from 'react-hot-toast'
import { loadCompanyData, addBankTransactions, updateBankTransaction, clearBankTransactions } from '../api/companyStore'
import { useAuth } from '../context/AuthContext'
import { fmt, fmtDate } from '../utils/format'

const API_BASE = '/api/v1'

const statusBadge = {
  matched:          'badge-green',
  manually_matched: 'badge-green',
  unmatched:        'badge-amber',
  ignored:          'badge-gray',
}

const ACCOUNT_OPTIONS = [
  'Sales Revenue', 'Purchase/Materials', 'Salaries & Wages', 'Rent',
  'Electricity & Utilities', 'Bank Charges', 'GST Payment', 'TDS Payment',
  'Loan Repayment', 'Advertising & Marketing', 'Office Supplies',
  'Travel & Conveyance', 'Professional Fees', 'Software Subscriptions',
  'Insurance Premium', 'Interest Income', 'Interest Expense',
  'ATM Cash Withdrawal', 'Miscellaneous Income', 'Miscellaneous Expense',
]

const ConfBar = ({ value, color }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
    <div className="progress-wrap" style={{ flex: 1, height: 5 }}>
      <div className="progress-fill" style={{ width: `${value * 100}%`, background: color }} />
    </div>
    <span style={{ fontSize: '0.72rem', fontWeight: 700, color, minWidth: 32 }}>{(value * 100).toFixed(0)}%</span>
  </div>
)

const Spinner = ({ size = 14, color = '#D97706' }) => (
  <span style={{
    width: size, height: size,
    border: `2px solid rgba(0,0,0,0.1)`,
    borderTopColor: color,
    borderRadius: '50%',
    display: 'inline-block',
    animation: 'spin 0.7s linear infinite',
    flexShrink: 0,
  }} />
)

export default function Bank() {
  const { activeCompany } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const tab = searchParams.get('tab') || 'accounts'

  const [transactions, setTransactions] = useState([])
  const [filter, setFilter] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [uploadedFile, setUploadedFile] = useState(null)
  const [parseStatus, setParseStatus] = useState('')
  const [parseProgress, setParseProgress] = useState(0)
  const [editingId, setEditingId] = useState(null)
  const [editAccount, setEditAccount] = useState('')
  const [sortBy, setSortBy] = useState('date_desc')
  const [showFilters, setShowFilters] = useState(false)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [minAmount, setMinAmount] = useState('')
  const [maxAmount, setMaxAmount] = useState('')
  const [txnTypeFilter, setTxnTypeFilter] = useState('all')

  const loadTxns = () => {
    const data = loadCompanyData(activeCompany?.id)
    setTransactions(data.bankTransactions || [])
  }

  useEffect(() => { loadTxns() }, [activeCompany?.id])

  const onDrop = useCallback(files => {
    const file = files[0]
    if (!file) return
    setUploadedFile(file)
    toast.success(`${file.name} ready to import`)
  }, [])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'text/csv': ['.csv'],
      'application/pdf': ['.pdf'],
      'application/vnd.ms-excel': ['.xls'],
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'text/plain': ['.txt'],
    },
    maxSize: 20 * 1024 * 1024,
  })

  // ── Main import handler — calls BACKEND, not Anthropic directly ──────────
  const handleImport = async () => {
    if (!uploadedFile) return toast.error('Please upload a file first')
    setLoading(true)
    setParseProgress(0)

    try {
      setParseStatus('Uploading file to server…')
      setParseProgress(15)

      const formData = new FormData()
      formData.append('file', uploadedFile)

      const token = localStorage.getItem('token')
      setParseStatus('AI is reading and extracting transactions…')
      setParseProgress(40)

      const response = await fetch(`${API_BASE}/bank/parse-statement`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      })

      setParseProgress(80)

      if (!response.ok) {
        const errBody = await response.json().catch(() => ({}))
        const detail = errBody.detail || `Server error ${response.status}`
        if (response.status === 503) throw new Error('AI not configured on server. Add ANTHROPIC_API_KEY to backend .env')
        if (response.status === 401) throw new Error('Session expired. Please log in again.')
        if (response.status === 404) throw new Error(
          'Backend endpoint not found (404). The backend needs to be redeployed with the latest main.py. ' +
          'Push your code changes to trigger a Render redeploy.'
        )
        throw new Error(detail)
      }

      // FIX: response.json() throws "Unexpected end of JSON input" when the
      // server returns an empty body (pdfplumber crash, timeout, auth error).
      // Parse safely so the outer catch gives a readable message.
      let result
      try {
        result = await response.json()
      } catch {
        throw new Error(
          'Server returned an unreadable response. Possible causes: ' +
          '(1) pdfplumber not installed — add it to requirements-render.txt and redeploy, ' +
          '(2) PDF is image-only/scanned — export as CSV from your bank instead, ' +
          '(3) request timed out on Render free tier. Check Render logs for details.'
        )
      }
      const { transactions: parsed, total_parsed } = result.data

      setParseProgress(95)
      setParseStatus(`Saving ${total_parsed} transactions…`)

      if (result.data?.warning) {
        toast(`⚠️ ${result.data.warning}`, { duration: 6000, icon: '⚠️' })
      }

      if (!parsed || parsed.length === 0) {
        throw new Error('No transactions found. Check that the file is a valid bank statement.')
      }

      // Deduplicate
      const existing = loadCompanyData(activeCompany?.id).bankTransactions || []
      const existingKeys = new Set(existing.map(t => `${t.txn_date}|${t.amount}|${t.narration}`))
      const newTxns = parsed.filter(t => !existingKeys.has(`${t.txn_date}|${t.amount}|${t.narration}`))
      const dupes = parsed.length - newTxns.length

      if (newTxns.length > 0) {
        addBankTransactions(activeCompany?.id, newTxns)
        loadTxns()
      }

      setParseProgress(100)
      let msg = `✅ ${newTxns.length} transactions imported from ${uploadedFile.name}`
      if (dupes > 0) msg += ` (${dupes} duplicates skipped)`
      toast.success(msg)
      setUploadedFile(null)

    } catch (err) {
      console.error('Import error:', err)
      toast.error(`Import failed: ${err.message}`)
    }

    setLoading(false)
    setParseStatus('')
    setParseProgress(0)
  }

  const handleAutoReconcile = () => {
    const data = loadCompanyData(activeCompany?.id)
    let count = 0
    data.bankTransactions.forEach(t => {
      if (t.status === 'unmatched' && (t.confidence || 0) > 0.85) {
        updateBankTransaction(activeCompany?.id, t.id, { status: 'matched' })
        count++
      }
    })
    loadTxns()
    toast.success(count > 0 ? `Auto-reconciled ${count} transactions ✓` : 'No high-confidence transactions to auto-reconcile')
  }

  const acceptMatch = (id) => {
    updateBankTransaction(activeCompany?.id, id, { status: 'matched' })
    loadTxns()
    toast.success('Transaction matched ✓')
  }

  const acceptMatchWithAccount = (id, account) => {
    updateBankTransaction(activeCompany?.id, id, { status: 'matched', ai_suggested_account: account })
    loadTxns()
    setEditingId(null)
    toast.success('Transaction matched ✓')
  }

  const ignoreTransaction = (id) => {
    updateBankTransaction(activeCompany?.id, id, { status: 'ignored' })
    loadTxns()
    toast('Transaction ignored', { icon: '🔕' })
  }

  const unignoreTransaction = (id) => {
    updateBankTransaction(activeCompany?.id, id, { status: 'unmatched' })
    loadTxns()
  }

  const unmatchTransaction = (id) => {
    updateBankTransaction(activeCompany?.id, id, { status: 'unmatched' })
    loadTxns()
  }

  const handleClearAll = () => {
    if (!window.confirm('Clear all imported transactions? This cannot be undone.')) return
    clearBankTransactions(activeCompany?.id)
    loadTxns()
    toast.success('All transactions cleared')
  }

  const handleExportCSV = () => {
    const rows = [
      ['Date', 'Narration', 'Type', 'Amount', 'Balance', 'Suggested Account', 'Status', 'Confidence'],
      ...transactions.map(t => [
        t.txn_date, `"${(t.narration || '').replace(/"/g, '""')}"`,
        t.txn_type, t.amount, t.balance,
        t.ai_suggested_account, t.status,
        ((t.confidence || 0) * 100).toFixed(0) + '%',
      ])
    ]
    const csv = rows.map(r => r.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url
    a.download = `transactions_${new Date().toISOString().slice(0, 10)}.csv`
    a.click(); URL.revokeObjectURL(url)
    toast.success('Exported to CSV')
  }

  const getFiltered = () => {
    let list = [...transactions]
    if (filter !== 'all') {
      if (filter === 'matched') list = list.filter(t => t.status === 'matched' || t.status === 'manually_matched')
      else list = list.filter(t => t.status === filter)
    }
    if (txnTypeFilter !== 'all') list = list.filter(t => t.txn_type === txnTypeFilter)
    if (dateFrom) list = list.filter(t => t.txn_date >= dateFrom)
    if (dateTo) list = list.filter(t => t.txn_date <= dateTo)
    if (minAmount) list = list.filter(t => t.amount >= parseFloat(minAmount))
    if (maxAmount) list = list.filter(t => t.amount <= parseFloat(maxAmount))
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      list = list.filter(t =>
        (t.narration || '').toLowerCase().includes(q) ||
        (t.ai_suggested_account || '').toLowerCase().includes(q) ||
        (t.reference || '').toLowerCase().includes(q)
      )
    }
    list.sort((a, b) => {
      if (sortBy === 'date_desc') return (b.txn_date || '').localeCompare(a.txn_date || '')
      if (sortBy === 'date_asc') return (a.txn_date || '').localeCompare(b.txn_date || '')
      if (sortBy === 'amount_desc') return b.amount - a.amount
      if (sortBy === 'amount_asc') return a.amount - b.amount
      if (sortBy === 'confidence') return (b.confidence || 0) - (a.confidence || 0)
      return 0
    })
    return list
  }

  const filtered = getFiltered()
  const counts = {
    all: transactions.length,
    unmatched: transactions.filter(t => t.status === 'unmatched').length,
    matched: transactions.filter(t => t.status === 'matched' || t.status === 'manually_matched').length,
    ignored: transactions.filter(t => t.status === 'ignored').length,
  }
  const matchedPct = counts.all > 0 ? Math.round((counts.matched / counts.all) * 100) : 0
  const totalCredit = transactions.filter(t => t.txn_type === 'credit').reduce((s, t) => s + t.amount, 0)
  const totalDebit = transactions.filter(t => t.txn_type === 'debit').reduce((s, t) => s + t.amount, 0)

  return (
    <div className="page-enter">
      <div className="page-header">
        <div>
          <h1 className="page-title">Banking</h1>
          <p className="page-subtitle">Import statements · AI classification · Reconciliation</p>
        </div>
        <div className="page-actions">
          {transactions.length > 0 && (
            <>
              <button className="btn btn-secondary" onClick={handleExportCSV}><Download size={15} /> Export CSV</button>
              <button className="btn btn-secondary" onClick={handleClearAll} style={{ color: 'var(--danger)' }}><Trash2 size={15} /> Clear All</button>
            </>
          )}
          <button className="btn btn-secondary"><FileText size={15} /> Statement History</button>
          <button className="btn btn-primary" onClick={handleAutoReconcile} disabled={loading || counts.all === 0}>
            {loading ? <><Spinner color="white" /> Processing...</> : <><Zap size={15} /> AI Auto-Reconcile</>}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 2, marginBottom: 20, background: 'var(--surface-2)', padding: 4, borderRadius: 'var(--r-md)', width: 'fit-content', border: '1px solid var(--border)' }}>
        {[
          { key: 'accounts', label: 'Bank Accounts', icon: CreditCard },
          { key: 'reconcile', label: 'Reconciliation', icon: RefreshCw },
          { key: 'import', label: 'Import Statement', icon: Upload },
        ].map(t => (
          <button key={t.key} onClick={() => setSearchParams({ tab: t.key })}
            className={tab === t.key ? 'btn btn-primary' : 'btn btn-secondary'}
            style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '7px 16px', fontSize: '0.83rem' }}>
            <t.icon size={14} /> {t.label}
          </button>
        ))}
      </div>

      {/* KPIs */}
      <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(5, 1fr)', marginBottom: 24 }}>
        {[
          { label: 'Total Imported', value: counts.all, color: 'blue', sub: 'transactions' },
          { label: 'Matched', value: counts.matched, color: 'green', sub: 'auto + manual' },
          { label: 'Pending Review', value: counts.unmatched, color: 'red', sub: 'needs attention' },
          { label: 'Total Credits', value: `₹${fmt(totalCredit)}`, color: 'green', sub: 'money in' },
          { label: 'Total Debits', value: `₹${fmt(totalDebit)}`, color: 'red', sub: 'money out' },
        ].map(s => (
          <div key={s.label} className={`kpi-card ${s.color}`} style={{ padding: '16px 18px' }}>
            <div className="kpi-label">{s.label}</div>
            <div className="kpi-value" style={{ fontSize: '1.35rem', marginBottom: 4 }}>{s.value}</div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-3)' }}>{s.sub}</div>
          </div>
        ))}
      </div>

      {counts.all > 0 && (
        <div className="card" style={{ padding: '16px 20px', marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>Reconciliation Progress</span>
            <span style={{ fontSize: '0.85rem', fontWeight: 700, color: matchedPct >= 70 ? 'var(--success)' : 'var(--warning)' }}>{matchedPct}% complete</span>
          </div>
          <div className="progress-wrap" style={{ height: 10, borderRadius: 99 }}>
            <div className="progress-fill" style={{ width: `${matchedPct}%`, background: matchedPct >= 70 ? 'var(--success)' : 'var(--warning)', borderRadius: 99 }} />
          </div>
          <div style={{ display: 'flex', gap: 20, marginTop: 10 }}>
            {[['var(--success)', `${counts.matched} Matched`], ['var(--warning)', `${counts.unmatched} Pending`], ['var(--text-3)', `${counts.ignored} Ignored`]].map(([dot, label]) => (
              <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.78rem', color: 'var(--text-2)' }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: dot }} />{label}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid-2" style={{ gap: 20 }}>

        {/* Left panel: upload + classification */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="card">
            <div className="card-header"><span className="card-title">Import Bank Statement</span></div>
            <div className="card-body">
              <div {...getRootProps()} className={`dropzone${isDragActive ? ' active' : ''}`}>
                <input {...getInputProps()} />
                <Upload size={28} color="var(--text-3)" style={{ margin: '0 auto 12px' }} />
                {uploadedFile ? (
                  <>
                    <p style={{ fontWeight: 600, color: 'var(--success)', marginBottom: 4 }}>{uploadedFile.name}</p>
                    <p style={{ fontSize: '0.8rem', color: 'var(--text-3)' }}>{(uploadedFile.size / 1024).toFixed(0)} KB · Ready to import</p>
                    <button onClick={e => { e.stopPropagation(); setUploadedFile(null) }}
                      style={{ marginTop: 8, fontSize: '0.75rem', color: 'var(--danger)', background: 'none', border: 'none', cursor: 'pointer' }}>
                      ✕ Remove
                    </button>
                  </>
                ) : (
                  <>
                    <p style={{ fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>{isDragActive ? 'Drop it here ✓' : 'Drag & drop or click to browse'}</p>
                    <p style={{ fontSize: '0.78rem', color: 'var(--text-3)' }}>PDF (SBI, HDFC, ICICI, Kotak, Axis…) · CSV · Excel · Max 20 MB</p>
                  </>
                )}
              </div>

              <div style={{ marginTop: 10, padding: '10px 12px', background: 'linear-gradient(135deg,#EFF6FF,#F5F3FF)', border: '1px solid #C7D2FE', borderRadius: 8, display: 'flex', gap: 8, alignItems: 'center' }}>
                <Brain size={16} color="#2563EB" />
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#1E40AF' }}>Built-in AI Parsing</div>
                  <div style={{ fontSize: 11, color: '#3730A3' }}>Reads your actual PDF/CSV — no template needed. Powered by Claude AI on server.</div>
                </div>
              </div>

              <div style={{ marginTop: 10, padding: '10px 12px', background: 'var(--surface-2)', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}>
                <p style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-2)', marginBottom: 4 }}>✅ Supported Banks & Formats</p>
                <p style={{ fontSize: '0.78rem', color: 'var(--text-3)', lineHeight: 1.8 }}>
                  SBI · HDFC · ICICI · Axis · Kotak · Yes Bank · IDFC First · Federal · UCO · PNB · BOI · Canara · Any PDF statement
                </p>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-3)', marginTop: 4 }}>Formats: PDF · CSV · Excel (.xlsx/.xls) · Text</p>
              </div>

              {loading && (
                <div style={{ marginTop: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 8, fontSize: 12, color: '#92400E', marginBottom: 8 }}>
                    <Spinner /> {parseStatus}
                  </div>
                  <div style={{ height: 6, background: 'var(--border)', borderRadius: 99 }}>
                    <div style={{ height: '100%', width: `${parseProgress}%`, background: 'var(--primary)', borderRadius: 99, transition: 'width 0.4s ease' }} />
                  </div>
                </div>
              )}

              <button className="btn btn-primary" style={{ width: '100%', marginTop: 12, justifyContent: 'center' }}
                onClick={handleImport} disabled={!uploadedFile || loading}>
                {loading ? <><Spinner color="white" /> AI Reading Statement…</> : <><Upload size={15} /> Import & AI Classify</>}
              </button>
            </div>
          </div>

          {/* AI classification stats */}
          <div className="card">
            <div className="card-header">
              <span className="card-title">AI Classification</span>
              <span className="badge badge-blue"><Zap size={10} /> Active</span>
            </div>
            <div className="card-body">
              {(() => {
                const total = transactions.length || 1
                const high = transactions.filter(t => (t.confidence || 0) > 0.85).length
                const mid = transactions.filter(t => (t.confidence || 0) >= 0.60 && (t.confidence || 0) <= 0.85).length
                const low = transactions.filter(t => (t.confidence || 0) < 0.60).length
                return [
                  { label: 'Auto-posted (>85%)', pct: Math.round(high / total * 100), color: 'var(--success)', count: high },
                  { label: 'Needs review (60–85%)', pct: Math.round(mid / total * 100), color: 'var(--warning)', count: mid },
                  { label: 'Manual required (<60%)', pct: Math.round(low / total * 100), color: 'var(--danger)', count: low },
                ].map(item => (
                  <div key={item.label} style={{ marginBottom: 14 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-2)' }}>{item.label}</span>
                      <span style={{ fontSize: '0.8rem', fontWeight: 700, color: item.color }}>{item.pct}% ({item.count})</span>
                    </div>
                    <div className="progress-wrap"><div className="progress-fill" style={{ width: `${item.pct}%`, background: item.color }} /></div>
                  </div>
                ))
              })()}
            </div>
          </div>

          {/* Account breakdown */}
          {transactions.length > 0 && (
            <div className="card">
              <div className="card-header"><span className="card-title">By Account Category</span></div>
              <div className="card-body" style={{ maxHeight: 220, overflowY: 'auto' }}>
                {Object.entries(
                  transactions.reduce((acc, t) => {
                    const key = t.ai_suggested_account || 'Uncategorized'
                    if (!acc[key]) acc[key] = { count: 0, total: 0 }
                    acc[key].count++; acc[key].total += t.amount
                    return acc
                  }, {})
                ).sort((a, b) => b[1].total - a[1].total).slice(0, 10).map(([account, { count, total }]) => (
                  <div key={account} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0', borderBottom: '1px solid var(--border)', fontSize: '0.8rem' }}>
                    <span style={{ color: 'var(--text-2)', flex: 1 }}>{account}</span>
                    <span style={{ color: 'var(--text-3)', marginLeft: 8 }}>{count}</span>
                    <span style={{ fontWeight: 600, marginLeft: 12, fontFamily: 'var(--font-mono)' }}>₹{fmt(total)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right panel: transactions list */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column' }}>
          <div className="card-header" style={{ paddingBottom: 14, flexWrap: 'wrap', gap: 10 }}>
            <span className="card-title">Bank Transactions</span>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={{ position: 'relative' }}>
                <Search size={13} style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)' }} />
                <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Search…"
                  style={{ paddingLeft: 28, paddingRight: 8, height: 30, border: '1px solid var(--border)', borderRadius: 'var(--radius)', fontSize: '0.8rem', background: 'var(--bg)', color: 'var(--text)', width: 140 }} />
              </div>
              <select value={sortBy} onChange={e => setSortBy(e.target.value)}
                style={{ height: 30, border: '1px solid var(--border)', borderRadius: 'var(--radius)', fontSize: '0.78rem', background: 'var(--bg)', color: 'var(--text)', padding: '0 6px' }}>
                <option value="date_desc">Newest first</option>
                <option value="date_asc">Oldest first</option>
                <option value="amount_desc">Largest amount</option>
                <option value="amount_asc">Smallest amount</option>
                <option value="confidence">Confidence</option>
              </select>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowFilters(v => !v)} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <Filter size={12} /> Filters {showFilters ? '▲' : '▼'}
              </button>
            </div>
          </div>

          {showFilters && (
            <div style={{ padding: '12px 20px', background: 'var(--surface-2)', borderBottom: '1px solid var(--border)', display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <div style={{ display: 'flex', gap: 4, alignItems: 'center', fontSize: '0.78rem' }}>
                <span style={{ color: 'var(--text-3)' }}>Type:</span>
                {['all', 'credit', 'debit'].map(f => (
                  <button key={f} className={txnTypeFilter === f ? 'btn btn-primary btn-sm' : 'btn btn-ghost btn-sm'}
                    style={{ textTransform: 'capitalize', padding: '3px 10px' }} onClick={() => setTxnTypeFilter(f)}>{f}</button>
                ))}
              </div>
              <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                style={{ height: 28, border: '1px solid var(--border)', borderRadius: 'var(--radius)', fontSize: '0.78rem', padding: '0 6px', background: 'var(--bg)', color: 'var(--text)' }} />
              <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                style={{ height: 28, border: '1px solid var(--border)', borderRadius: 'var(--radius)', fontSize: '0.78rem', padding: '0 6px', background: 'var(--bg)', color: 'var(--text)' }} />
              <input type="number" value={minAmount} onChange={e => setMinAmount(e.target.value)} placeholder="Min ₹"
                style={{ width: 80, height: 28, border: '1px solid var(--border)', borderRadius: 'var(--radius)', fontSize: '0.78rem', padding: '0 6px', background: 'var(--bg)', color: 'var(--text)' }} />
              <input type="number" value={maxAmount} onChange={e => setMaxAmount(e.target.value)} placeholder="Max ₹"
                style={{ width: 80, height: 28, border: '1px solid var(--border)', borderRadius: 'var(--radius)', fontSize: '0.78rem', padding: '0 6px', background: 'var(--bg)', color: 'var(--text)' }} />
              <button className="btn btn-ghost btn-sm" onClick={() => { setDateFrom(''); setDateTo(''); setMinAmount(''); setMaxAmount(''); setTxnTypeFilter('all') }}>Clear</button>
            </div>
          )}

          <div style={{ padding: '8px 20px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 4 }}>
            {['all', 'unmatched', 'matched', 'ignored'].map(f => (
              <button key={f} className={filter === f ? 'btn btn-primary btn-sm' : 'btn btn-ghost btn-sm'}
                style={{ textTransform: 'capitalize' }} onClick={() => setFilter(f)}>
                {f} <span style={{ marginLeft: 4, opacity: 0.7, fontSize: '0.7rem' }}>({f === 'all' ? counts.all : f === 'matched' ? counts.matched : counts[f] || 0})</span>
              </button>
            ))}
          </div>

          <div style={{ flex: 1, overflowY: 'auto', maxHeight: 600 }}>
            {filtered.length === 0 ? (
              <div style={{ padding: '48px 0', textAlign: 'center', color: 'var(--text-3)' }}>
                <div style={{ fontSize: '2.5rem', marginBottom: 8 }}>🏦</div>
                <div style={{ fontSize: 13, marginBottom: 4 }}>
                  {transactions.length === 0 ? 'No transactions imported yet' : 'No transactions match your filters'}
                </div>
                {transactions.length === 0 && <div style={{ fontSize: 12 }}>Upload your bank statement PDF to get started</div>}
              </div>
            ) : filtered.map(txn => (
              <div key={txn.id} style={{
                padding: '14px 20px', borderBottom: '1px solid var(--border)',
                background: txn.status === 'unmatched' ? '#FFFBEB' : txn.status === 'ignored' ? 'var(--surface-2)' : 'var(--surface)',
                opacity: txn.status === 'ignored' ? 0.65 : 1,
              }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 6 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: '0.875rem', marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {txn.txn_type === 'credit'
                        ? <ArrowDownCircle size={12} style={{ display: 'inline', color: 'var(--success)', marginRight: 5 }} />
                        : <ArrowUpCircle size={12} style={{ display: 'inline', color: 'var(--danger)', marginRight: 5 }} />}
                      {txn.narration}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-3)', display: 'flex', gap: 8 }}>
                      <span>{fmtDate(txn.txn_date)}</span>
                      {txn.reference && <span>Ref: {txn.reference}</span>}
                      {txn.balance > 0 && <span>Bal: ₹{fmt(txn.balance)}</span>}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', marginLeft: 12 }}>
                    <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: '0.9rem', color: txn.txn_type === 'credit' ? 'var(--success)' : 'var(--danger)' }}>
                      {txn.txn_type === 'credit' ? '+' : '−'}₹{fmt(txn.amount)}
                    </div>
                    <span className={`badge ${statusBadge[txn.status] || 'badge-gray'}`} style={{ marginTop: 4 }}>{(txn.status || '').replace('_', ' ')}</span>
                  </div>
                </div>

                {txn.status === 'unmatched' && (
                  <div style={{ background: 'var(--primary-light)', border: '1px solid #C7D2FE', borderRadius: 'var(--radius)', padding: '9px 12px' }}>
                    {editingId === txn.id ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <select value={editAccount} onChange={e => setEditAccount(e.target.value)}
                          style={{ flex: 1, height: 30, border: '1px solid var(--border)', borderRadius: 'var(--radius)', fontSize: '0.8rem', background: 'var(--bg)', color: 'var(--text)', padding: '0 6px' }}>
                          {ACCOUNT_OPTIONS.map(a => <option key={a}>{a}</option>)}
                        </select>
                        <button className="btn btn-sm" style={{ background: 'var(--success)', color: 'white' }} onClick={() => acceptMatchWithAccount(txn.id, editAccount)}>
                          <CheckCircle size={12} /> Save
                        </button>
                        <button className="btn btn-ghost btn-sm" onClick={() => setEditingId(null)}>Cancel</button>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 4 }}>
                            <Zap size={11} color="var(--primary)" />
                            <span style={{ fontSize: '0.72rem', color: 'var(--primary)', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase' }}>AI Suggests</span>
                          </div>
                          <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text)' }}>{txn.ai_suggested_account || 'Miscellaneous Expense'}</span>
                          <ConfBar value={txn.confidence || 0.75} color={(txn.confidence || 0.75) > 0.85 ? 'var(--success)' : 'var(--warning)'} />
                        </div>
                        <div style={{ display: 'flex', gap: 5 }}>
                          <button className="btn btn-sm" style={{ background: 'var(--success)', color: 'white' }} onClick={() => acceptMatch(txn.id)}>
                            <CheckCircle size={12} /> Accept
                          </button>
                          <button className="btn btn-ghost btn-sm" title="Change account"
                            onClick={() => { setEditingId(txn.id); setEditAccount(txn.ai_suggested_account || ACCOUNT_OPTIONS[0]) }}>
                            <Edit3 size={12} />
                          </button>
                          <button className="btn btn-ghost btn-sm" title="Ignore" onClick={() => ignoreTransaction(txn.id)}>
                            <X size={12} />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {(txn.status === 'matched' || txn.status === 'manually_matched') && (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--success)', marginTop: 4 }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><CheckCircle size={12} /> Matched → {txn.ai_suggested_account}</span>
                    <button className="btn btn-ghost btn-sm" style={{ fontSize: '0.7rem', padding: '2px 8px' }} onClick={() => unmatchTransaction(txn.id)}>Undo</button>
                  </div>
                )}

                {txn.status === 'ignored' && (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--text-3)', marginTop: 4 }}>
                    <span>Ignored</span>
                    <button className="btn btn-ghost btn-sm" style={{ fontSize: '0.7rem' }} onClick={() => unignoreTransaction(txn.id)}>Restore</button>
                  </div>
                )}
              </div>
            ))}
          </div>

          {filtered.length > 0 && (
            <div style={{ padding: '10px 20px', borderTop: '1px solid var(--border)', fontSize: '0.78rem', color: 'var(--text-3)', display: 'flex', justifyContent: 'space-between' }}>
              <span>Showing {filtered.length} of {transactions.length}</span>
              <span style={{ color: 'var(--success)' }}>+₹{fmt(filtered.filter(t => t.txn_type === 'credit').reduce((s, t) => s + t.amount, 0))}</span>
              <span style={{ color: 'var(--danger)' }}>−₹{fmt(filtered.filter(t => t.txn_type === 'debit').reduce((s, t) => s + t.amount, 0))}</span>
            </div>
          )}
        </div>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
