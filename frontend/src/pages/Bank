// src/pages/Bank.jsx
import { useState, useCallback } from 'react'
import { useDropzone } from 'react-dropzone'
import { Upload, CheckCircle, X, Zap, AlertCircle, RefreshCw } from 'lucide-react'
import toast from 'react-hot-toast'
import { mockBankTransactions } from '../api/mockData'
import { fmt } from '../utils/format'

const statusColor = {
  matched:         'badge-green',
  manually_matched:'badge-green',
  unmatched:       'badge-amber',
  ignored:         'badge-gray',
}

export default function Bank() {
  const [transactions, setTransactions] = useState(mockBankTransactions)
  const [filter, setFilter] = useState('all')
  const [loading, setLoading] = useState(false)
  const [uploadedFile, setUploadedFile] = useState(null)

  const onDrop = useCallback(files => {
    const file = files[0]
    if (!file) return
    setUploadedFile(file)
    toast.success(`${file.name} ready to import`)
  }, [])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop, accept: { 'text/csv': ['.csv'], 'application/vnd.ms-excel': ['.xls'],
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'application/pdf': ['.pdf'] }
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
        prev.map(t => t.status === 'unmatched' && t.confidence > 0.85
          ? { ...t, status: 'matched' } : t)
      )
      setLoading(false)
      toast.success('Auto-reconciliation complete · 5 matched')
    }, 2000)
  }

  const acceptMatch = (id) => {
    setTransactions(prev => prev.map(t => t.id === id ? { ...t, status: 'matched' } : t))
    toast.success('Transaction matched')
  }

  const ignoreTransaction = (id) => {
    setTransactions(prev => prev.map(t => t.id === id ? { ...t, status: 'ignored' } : t))
  }

  const filtered = transactions.filter(t =>
    filter === 'all' ? true : t.status === filter
  )

  const counts = {
    all: transactions.length,
    unmatched: transactions.filter(t => t.status === 'unmatched').length,
    matched: transactions.filter(t => t.status === 'matched' || t.status === 'manually_matched').length,
  }

  return (
    <div className="page-enter">
      <div className="page-header">
        <div className="page-header-left">
          <h1>Bank & Reconciliation</h1>
          <p>Import bank statements · AI auto-matches · Manual review</p>
        </div>
        <button className="btn btn-accent" onClick={handleAutoReconcile} disabled={loading}>
          {loading ? <span className="spinner" style={{ width: 14, height: 14 }} /> : <Zap size={14} />}
          Auto-Reconcile AI
        </button>
      </div>

      <div className="page-body">
        {/* Stats row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
          {[
            { label: 'Total Imported', value: transactions.length, color: '#1a1a1a' },
            { label: 'Matched', value: counts.matched, color: '#16a34a' },
            { label: 'Pending Review', value: counts.unmatched, color: '#d97706' },
            { label: 'AI Accuracy', value: '96.4%', color: '#2563eb' },
          ].map(s => (
            <div key={s.label} className="card" style={{ padding: '16px 20px' }}>
              <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#9b9590', marginBottom: 6 }}>{s.label}</div>
              <div style={{ fontFamily: 'DM Serif Display, serif', fontSize: '1.6rem', color: s.color }}>{s.value}</div>
            </div>
          ))}
        </div>

        <div className="grid-2" style={{ gap: 20 }}>
          {/* Upload panel */}
          <div>
            <div className="card mb-3">
              <div className="card-header"><h3>Import Bank Statement</h3></div>
              <div className="card-body">
                <div {...getRootProps()} className={`dropzone${isDragActive ? ' active' : ''}`}>
                  <input {...getInputProps()} />
                  <Upload size={28} color="#9b9590" style={{ margin: '0 auto 10px' }} />
                  {uploadedFile ? (
                    <>
                      <p style={{ fontWeight: 500, color: '#16a34a' }}>{uploadedFile.name}</p>
                      <p className="text-sm text-muted" style={{ marginTop: 4 }}>
                        {(uploadedFile.size / 1024).toFixed(0)} KB · Ready to import
                      </p>
                    </>
                  ) : (
                    <>
                      <p style={{ fontWeight: 500, marginBottom: 4 }}>
                        {isDragActive ? 'Drop it here' : 'Drag & drop or click to upload'}
                      </p>
                      <p className="text-sm text-muted">CSV, Excel (.xlsx), or PDF bank statement</p>
                    </>
                  )}
                </div>

                <div style={{ marginTop: 16, padding: '12px', background: '#f7f5f0', borderRadius: 8, fontSize: '0.8rem', color: '#5a5750' }}>
                  <strong style={{ display: 'block', marginBottom: 4 }}>Supported banks</strong>
                  HDFC, SBI, ICICI, Axis, Kotak, Yes Bank, IDFC First
                </div>

                <button className="btn btn-primary w-full" style={{ marginTop: 12 }}
                  onClick={handleImport} disabled={!uploadedFile || loading}>
                  {loading ? <><span className="spinner" style={{ width: 14, height: 14 }} /> Processing...</>
                    : 'Import & Classify'}
                </button>
              </div>
            </div>

            {/* AI Legend */}
            <div className="card">
              <div className="card-header"><h3>AI Classification</h3></div>
              <div className="card-body">
                <p className="text-sm text-muted mb-2">
                  The AI reads each bank narration and maps it to the correct ledger account.
                  Transactions above 85% confidence are auto-posted.
                </p>
                {[
                  { label: 'Auto-posted (>85%)', pct: 71, color: '#16a34a' },
                  { label: 'Needs review (60–85%)', pct: 18, color: '#d97706' },
                  { label: 'Manual required (<60%)', pct: 11, color: '#dc2626' },
                ].map(item => (
                  <div key={item.label} style={{ marginBottom: 10 }}>
                    <div className="flex justify-between" style={{ marginBottom: 4 }}>
                      <span style={{ fontSize: '0.8rem' }}>{item.label}</span>
                      <span style={{ fontSize: '0.8rem', fontWeight: 500, color: item.color }}>{item.pct}%</span>
                    </div>
                    <div style={{ height: 5, background: '#f0ede6', borderRadius: 3, overflow: 'hidden' }}>
                      <div style={{ width: `${item.pct}%`, height: '100%', background: item.color, borderRadius: 3 }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Transactions panel */}
          <div className="card" style={{ display: 'flex', flexDirection: 'column' }}>
            <div className="card-header">
              <h3>Bank Transactions</h3>
              <div className="flex gap-1">
                {(['all','unmatched','matched']).map(f => (
                  <button key={f} className={`btn btn-sm ${filter === f ? 'btn-primary' : 'btn-ghost'}`}
                    onClick={() => setFilter(f)} style={{ textTransform: 'capitalize' }}>
                    {f} {counts[f] !== undefined && <span style={{ marginLeft: 3, opacity: 0.7 }}>({counts[f]})</span>}
                  </button>
                ))}
              </div>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', maxHeight: 520 }}>
              {filtered.map(txn => (
                <div key={txn.id} style={{
                  padding: '14px 20px',
                  borderBottom: '1px solid #f7f5f0',
                  background: txn.status === 'unmatched' ? '#fffbf5' : '#fff',
                }}>
                  <div className="flex justify-between items-center" style={{ marginBottom: 6 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 500, fontSize: '0.875rem', marginBottom: 2 }}>{txn.narration}</div>
                      <div style={{ fontSize: '0.75rem', color: '#9b9590' }}>
                        {txn.txn_date} · <span style={{ color: txn.txn_type === 'credit' ? '#16a34a' : '#dc2626', fontWeight: 500 }}>
                          {txn.txn_type === 'credit' ? 'CR' : 'DR'}
                        </span>
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontWeight: 600, fontSize: '0.9rem',
                        color: txn.txn_type === 'credit' ? '#16a34a' : '#dc2626' }}>
                        {txn.txn_type === 'credit' ? '+' : '−'}₹{fmt(txn.amount)}
                      </div>
                      <span className={`badge ${statusColor[txn.status]}`} style={{ marginTop: 3 }}>
                        {txn.status}
                      </span>
                    </div>
                  </div>

                  {txn.status === 'unmatched' && txn.ai_suggested_account && (
                    <div style={{
                      background: '#f0f7ff', border: '1px solid #bfdbfe',
                      borderRadius: 6, padding: '8px 12px',
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    }}>
                      <div>
                        <span style={{ fontSize: '0.75rem', color: '#1e40af', fontWeight: 500 }}>AI suggests: </span>
                        <span style={{ fontSize: '0.8rem', color: '#1a1a1a' }}>{txn.ai_suggested_account}</span>
                        <div className="conf-bar" style={{ marginTop: 4 }}>
                          <div className="conf-bar-fill" style={{
                            width: `${txn.confidence * 100}%`,
                            background: txn.confidence > 0.85 ? '#16a34a' : '#d97706'
                          }} />
                        </div>
                        <span style={{ fontSize: '0.7rem', color: '#9b9590', marginLeft: 6 }}>
                          {(txn.confidence * 100).toFixed(0)}%
                        </span>
                      </div>
                      <div className="flex gap-1">
                        <button className="btn btn-sm btn-accent" onClick={() => acceptMatch(txn.id)}>
                          <CheckCircle size={12} /> Accept
                        </button>
                        <button className="btn btn-sm btn-ghost" onClick={() => ignoreTransaction(txn.id)}>
                          <X size={12} />
                        </button>
                      </div>
                    </div>
                  )}

                  {txn.status === 'matched' && txn.matched_voucher && (
                    <div style={{ fontSize: '0.75rem', color: '#16a34a', display: 'flex', alignItems: 'center', gap: 4 }}>
                      <CheckCircle size={11} /> Matched to {txn.matched_voucher}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
