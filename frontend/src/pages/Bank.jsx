// src/pages/Bank.jsx
import { useState, useCallback, useEffect } from 'react'
import { useDropzone } from 'react-dropzone'
import { useSearchParams } from 'react-router-dom'
import { Upload, CheckCircle, X, Zap, AlertCircle, RefreshCw, FileText, CreditCard } from 'lucide-react'
import toast from 'react-hot-toast'
import { getCompanyData } from '../api/mockData'
import { useAuth } from '../context/AuthContext'
import { fmt, fmtDate } from '../utils/format'

const statusBadge = {
  matched:          'badge-green',
  manually_matched: 'badge-green',
  unmatched:        'badge-amber',
  ignored:          'badge-gray',
}

const ConfBar = ({ value, color }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
    <div className="progress-wrap" style={{ flex: 1, height: 5 }}>
      <div className="progress-fill" style={{ width: `${value * 100}%`, background: color }} />
    </div>
    <span style={{ fontSize: '0.72rem', fontWeight: 700, color, minWidth: 32 }}>
      {(value * 100).toFixed(0)}%
    </span>
  </div>
)

export default function Bank() {
  const { activeCompany } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const tab = searchParams.get('tab') || 'accounts'
  const [transactions, setTransactions] = useState(() => getCompanyData(activeCompany?.id).bankTransactions)
  const [filter, setFilter]             = useState('all')
  const [loading, setLoading]           = useState(false)
  const [uploadedFile, setUploadedFile] = useState(null)

  // Refresh transactions when company changes
  useEffect(() => {
    setTransactions(getCompanyData(activeCompany?.id).bankTransactions)
  }, [activeCompany?.id])
  const onDrop = useCallback(files => {
    const file = files[0]
    if (!file) return
    setUploadedFile(file)
    toast.success(`${file.name} ready to import`)
  }, [])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'text/csv':            ['.csv'],
      'application/vnd.ms-excel': ['.xls'],
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'application/pdf':     ['.pdf'],
    },
  })

  const handleImport = () => {
    if (!uploadedFile) return toast.error('Please upload a file first')
    setLoading(true)
    setTimeout(() => {
      setLoading(false)
      toast.success('8 transactions imported · AI classification running...')
      setUploadedFile(null)
    }, 1800)
  }

  const handleAutoReconcile = () => {
    setLoading(true)
    setTimeout(() => {
      setTransactions(prev =>
        prev.map(t =>
          t.status === 'unmatched' && t.confidence > 0.85
            ? { ...t, status: 'matched' }
            : t
        )
      )
      setLoading(false)
      toast.success('Auto-reconciliation complete · 5 transactions matched')
    }, 2000)
  }

  const acceptMatch = id => {
    setTransactions(prev => prev.map(t => t.id === id ? { ...t, status: 'matched' } : t))
    toast.success('Transaction matched ✓')
  }

  const ignoreTransaction = id => {
    setTransactions(prev => prev.map(t => t.id === id ? { ...t, status: 'ignored' } : t))
  }

  const filtered = transactions.filter(t =>
    filter === 'all' ? true : t.status === filter
  )

  const counts = {
    all:       transactions.length,
    unmatched: transactions.filter(t => t.status === 'unmatched').length,
    matched:   transactions.filter(t => t.status === 'matched' || t.status === 'manually_matched').length,
    ignored:   transactions.filter(t => t.status === 'ignored').length,
  }

  const matchedPct = Math.round((counts.matched / counts.all) * 100)

  return (
    <div className="page-enter">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Banking</h1>
          <p className="page-subtitle">Bank accounts · Reconciliation · Import statements</p>
        </div>
        <div className="page-actions">
          <button className="btn btn-secondary">
            <FileText size={15} /> Statement History
          </button>
          <button className="btn btn-primary" onClick={handleAutoReconcile} disabled={loading}>
            {loading
              ? <><span style={{ width: 14, height: 14, border: '2px solid rgba(255,255,255,0.4)', borderTopColor: 'white', borderRadius: '50%', display: 'inline-block', animation: 'spin 0.7s linear infinite' }} /> Processing...</>
              : <><Zap size={15} /> AI Auto-Reconcile</>
            }
          </button>
        </div>
      </div>

      {/* Tab Bar */}
      <div style={{ display:'flex', gap:2, marginBottom:20, background:'var(--surface-2)', padding:4, borderRadius:'var(--r-md)', width:'fit-content', border:'1px solid var(--border)' }}>
        {[
          { key:'accounts',    label:'Bank Accounts',    icon:CreditCard },
          { key:'reconcile',   label:'Reconciliation',   icon:RefreshCw },
          { key:'import',      label:'Import Statement', icon:Upload },
        ].map(t => (
          <button key={t.key}
            onClick={() => setSearchParams({ tab: t.key })}
            className={tab===t.key ? 'btn btn-primary' : 'btn btn-secondary'}
            style={{ display:'flex', alignItems:'center', gap:7, padding:'7px 16px', fontSize:'0.83rem' }}>
            <t.icon size={14}/> {t.label}
          </button>
        ))}
      </div>

      {/* Stats */}
      <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)', marginBottom: 24 }}>
        {[
          { label: 'Total Imported', value: counts.all, color: 'blue', sub: 'transactions' },
          { label: 'Matched',        value: counts.matched, color: 'green', sub: 'auto + manual' },
          { label: 'Pending Review', value: counts.unmatched, color: 'red', sub: 'needs attention' },
          { label: 'AI Accuracy',    value: '96.4%', color: 'purple', sub: 'this month' },
        ].map(s => (
          <div key={s.label} className={`kpi-card ${s.color}`} style={{ padding: '16px 18px' }}>
            <div className="kpi-label">{s.label}</div>
            <div className="kpi-value" style={{ fontSize: '1.5rem', marginBottom: 4 }}>{s.value}</div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-3)' }}>{s.sub}</div>
          </div>
        ))}
      </div>

      {/* Reconciliation progress bar */}
      <div className="card" style={{ padding: '16px 20px', marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text)' }}>
            Reconciliation Progress
          </span>
          <span style={{ fontSize: '0.85rem', fontWeight: 700, color: matchedPct >= 70 ? 'var(--success)' : 'var(--warning)' }}>
            {matchedPct}% complete
          </span>
        </div>
        <div className="progress-wrap" style={{ height: 10, borderRadius: 99 }}>
          <div className="progress-fill" style={{
            width: `${matchedPct}%`,
            background: matchedPct >= 70 ? 'var(--success)' : 'var(--warning)',
            borderRadius: 99,
          }} />
        </div>
        <div style={{ display: 'flex', gap: 20, marginTop: 10 }}>
          {[
            { dot: 'var(--success)', label: `${counts.matched} Matched` },
            { dot: 'var(--warning)', label: `${counts.unmatched} Pending` },
            { dot: 'var(--text-3)',  label: `${counts.ignored} Ignored` },
          ].map(item => (
            <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.78rem', color: 'var(--text-2)' }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: item.dot }} />
              {item.label}
            </div>
          ))}
        </div>
      </div>

      <div className="grid-2" style={{ gap: 20 }}>
        {/* Upload Panel */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="card">
            <div className="card-header">
              <span className="card-title">Import Bank Statement</span>
            </div>
            <div className="card-body">
              <div {...getRootProps()} className={`dropzone${isDragActive ? ' active' : ''}`}>
                <input {...getInputProps()} />
                <Upload size={28} color="var(--text-3)" style={{ margin: '0 auto 12px' }} />
                {uploadedFile ? (
                  <>
                    <p style={{ fontWeight: 600, color: 'var(--success)', marginBottom: 4 }}>{uploadedFile.name}</p>
                    <p style={{ fontSize: '0.8rem', color: 'var(--text-3)' }}>
                      {(uploadedFile.size / 1024).toFixed(0)} KB · Ready to import
                    </p>
                  </>
                ) : (
                  <>
                    <p style={{ fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>
                      {isDragActive ? 'Drop it here ✓' : 'Drag & drop or click to browse'}
                    </p>
                    <p style={{ fontSize: '0.78rem', color: 'var(--text-3)' }}>CSV, Excel (.xlsx), or PDF</p>
                  </>
                )}
              </div>

              <div style={{ marginTop: 14, padding: '12px 14px', background: 'var(--surface-2)', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}>
                <p style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-2)', marginBottom: 5 }}>Supported Banks</p>
                <p style={{ fontSize: '0.78rem', color: 'var(--text-3)', lineHeight: 1.6 }}>
                  HDFC · SBI · ICICI · Axis · Kotak · Yes Bank · IDFC First
                </p>
              </div>

              <button
                className="btn btn-primary"
                style={{ width: '100%', marginTop: 12, justifyContent: 'center' }}
                onClick={handleImport}
                disabled={!uploadedFile || loading}
              >
                {loading
                  ? 'Processing...'
                  : <><Upload size={15} /> Import & Classify</>
                }
              </button>
            </div>
          </div>

          {/* AI classification breakdown */}
          <div className="card">
            <div className="card-header">
              <span className="card-title">AI Classification</span>
              <span className="badge badge-blue">
                <Zap size={10} /> Active
              </span>
            </div>
            <div className="card-body">
              {[
                { label: 'Auto-posted (>85%)',       pct: 71, color: 'var(--success)' },
                { label: 'Needs review (60–85%)',    pct: 18, color: 'var(--warning)' },
                { label: 'Manual required (<60%)',   pct: 11, color: 'var(--danger)' },
              ].map(item => (
                <div key={item.label} style={{ marginBottom: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-2)' }}>{item.label}</span>
                    <span style={{ fontSize: '0.8rem', fontWeight: 700, color: item.color }}>{item.pct}%</span>
                  </div>
                  <div className="progress-wrap">
                    <div className="progress-fill" style={{ width: `${item.pct}%`, background: item.color }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Transactions Panel */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column' }}>
          <div className="card-header" style={{ paddingBottom: 14 }}>
            <span className="card-title">Bank Transactions</span>
            <div style={{ display: 'flex', gap: 4, background: 'var(--bg)', borderRadius: 'var(--radius)', padding: 3 }}>
              {['all', 'unmatched', 'matched'].map(f => (
                <button
                  key={f}
                  className={filter === f ? 'btn btn-primary btn-sm' : 'btn btn-ghost btn-sm'}
                  style={{ textTransform: 'capitalize' }}
                  onClick={() => setFilter(f)}
                >
                  {f}
                  <span style={{ marginLeft: 4, opacity: 0.7, fontSize: '0.7rem' }}>({counts[f]})</span>
                </button>
              ))}
            </div>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', borderTop: '1px solid var(--border)', maxHeight: 580 }}>
            {filtered.map(txn => (
              <div
                key={txn.id}
                style={{
                  padding: '14px 20px',
                  borderBottom: '1px solid var(--border)',
                  background: txn.status === 'unmatched' ? '#FFFBEB' : 'var(--surface)',
                  transition: 'background var(--dur)',
                }}
              >
                {/* Row top */}
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 6 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: '0.875rem', marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {txn.narration}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-3)', display: 'flex', gap: 8 }}>
                      <span>{fmtDate(txn.txn_date)}</span>
                      <span style={{ color: txn.txn_type === 'credit' ? 'var(--success)' : 'var(--danger)', fontWeight: 600 }}>
                        {txn.txn_type.toUpperCase()}
                      </span>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', marginLeft: 12 }}>
                    <div style={{
                      fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: '0.9rem',
                      color: txn.txn_type === 'credit' ? 'var(--success)' : 'var(--danger)'
                    }}>
                      {txn.txn_type === 'credit' ? '+' : '−'}₹{fmt(txn.amount)}
                    </div>
                    <span className={`badge ${statusBadge[txn.status]}`} style={{ marginTop: 4 }}>
                      {txn.status.replace('_', ' ')}
                    </span>
                  </div>
                </div>

                {/* AI suggestion row */}
                {txn.status === 'unmatched' && txn.ai_suggested_account && (
                  <div style={{
                    background: 'var(--primary-light)',
                    border: '1px solid #C7D2FE',
                    borderRadius: 'var(--radius)',
                    padding: '9px 12px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 10,
                  }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 4 }}>
                        <Zap size={11} color="var(--primary)" />
                        <span style={{ fontSize: '0.72rem', color: 'var(--primary)', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase' }}>AI Suggests</span>
                      </div>
                      <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text)' }}>
                        {txn.ai_suggested_account}
                      </span>
                      <ConfBar
                        value={txn.confidence}
                        color={txn.confidence > 0.85 ? 'var(--success)' : 'var(--warning)'}
                      />
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button className="btn btn-sm" style={{ background: 'var(--success)', color: 'white' }} onClick={() => acceptMatch(txn.id)}>
                        <CheckCircle size={12} /> Accept
                      </button>
                      <button className="btn btn-ghost btn-sm" onClick={() => ignoreTransaction(txn.id)}>
                        <X size={12} />
                      </button>
                    </div>
                  </div>
                )}

                {/* Matched badge */}
                {(txn.status === 'matched' || txn.status === 'manually_matched') && txn.matched_voucher && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.75rem', color: 'var(--success)', marginTop: 4 }}>
                    <CheckCircle size={12} />
                    <span>Matched to <strong>{txn.matched_voucher}</strong></span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
