// src/pages/Companies.jsx
import { useState } from 'react'
import { Plus, Building2, Trash2, Edit2, Check, X, AlertTriangle } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import toast from 'react-hot-toast'

const BIZ_TYPES = [
  'Private Limited', 'Public Limited', 'Partnership Firm',
  'Proprietorship', 'LLP', 'OPC', 'Trust / NGO',
]

const COLORS = ['#2563EB','#7C3AED','#059669','#DC2626','#D97706','#0891B2','#BE185D']

export default function Companies() {
  const { companies, activeCompany, switchCompany, addCompany, deleteCompany } = useAuth()
  const [showAdd, setShowAdd]   = useState(false)
  const [delId, setDelId]       = useState(null)
  const [form, setForm]         = useState({ name: '', type: 'Private Limited', gstin: '', fy: '2024-25', color: COLORS[0] })

  const handleAdd = () => {
    if (!form.name.trim()) return toast.error('Company name is required')
    addCompany(form)
    setShowAdd(false)
    setForm({ name: '', type: 'Private Limited', gstin: '', fy: '2024-25', color: COLORS[0] })
    toast.success('Company added successfully')
  }

  const handleDelete = (id) => {
    if (companies.length === 1) return toast.error('You must have at least one company')
    deleteCompany(id)
    setDelId(null)
    toast.success('Company removed')
  }

  return (
    <div className="page-wrap page-enter">
      <div className="page-header">
        <div>
          <h1 className="page-title">Companies</h1>
          <p className="page-sub">Manage multiple companies under one FINIX account</p>
        </div>
        <div className="page-actions">
          <button className="btn btn-primary" onClick={() => setShowAdd(true)}>
            <Plus size={14} /> Add Company
          </button>
        </div>
      </div>

      {/* Company grid */}
      <div className="co-grid">
        {companies.map(co => (
          <div
            key={co.id}
            className={`co-card${activeCompany?.id === co.id ? ' selected' : ''}`}
            onClick={() => switchCompany(co)}
          >
            {activeCompany?.id === co.id && (
              <div className="co-card-badge">
                <span className="badge badge-blue">
                  <Check size={9} /> Active
                </span>
              </div>
            )}
            <div className="co-card-av" style={{ background: co.color }}>
              {co.initials}
            </div>
            <div className="co-card-name">{co.name}</div>
            <div className="co-card-type">{co.type}</div>
            {co.gstin && (
              <div style={{ fontFamily: 'var(--mono)', fontSize: 'var(--fs-xs)', color: 'var(--text-3)', marginTop: 6 }}>
                GSTIN: {co.gstin}
              </div>
            )}
            <div style={{ display: 'flex', gap: 6, marginTop: 14 }}>
              <button
                className="btn btn-secondary btn-sm"
                style={{ flex: 1 }}
                onClick={(e) => { e.stopPropagation(); switchCompany(co) }}
              >
                {activeCompany?.id === co.id ? 'Active' : 'Switch to'}
              </button>
              <button
                className="btn btn-sm"
                style={{ background: 'var(--danger-l)', color: 'var(--danger)', border: '1px solid var(--danger-b)' }}
                onClick={(e) => { e.stopPropagation(); setDelId(co.id) }}
                title="Delete company"
              >
                <Trash2 size={12} />
              </button>
            </div>
          </div>
        ))}

        {/* Add card */}
        <div className="add-co-card" onClick={() => setShowAdd(true)}>
          <Plus size={22} />
          <div style={{ fontSize: 'var(--fs-sm)', fontWeight: 600 }}>Add New Company</div>
          <div style={{ fontSize: 'var(--fs-xs)' }}>Set up another entity for accounting</div>
        </div>
      </div>

      {/* Info box */}
      <div style={{
        marginTop: 24, padding: '14px 16px',
        background: 'var(--info-l)', border: '1px solid var(--info-b)',
        borderRadius: 'var(--r-lg)', fontSize: 'var(--fs-sm)', color: 'var(--info-l)',
        display: 'flex', gap: 10, alignItems: 'flex-start',
        color: '#0C4A6E'
      }}>
        <Building2 size={16} style={{ marginTop: 1, flexShrink: 0, color: 'var(--info)' }} />
        <div>
          <div style={{ fontWeight: 600, marginBottom: 3 }}>Multi-Company Accounting</div>
          Each company has its own separate chart of accounts, vouchers, GST filings and payroll.
          Switch between companies using the company selector in the top navigation bar.
          Your login credentials work across all companies.
        </div>
      </div>

      {/* Add Company Modal */}
      {showAdd && (
        <div className="overlay" onClick={() => setShowAdd(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <span className="modal-title">Add New Company</span>
              <button className="btn btn-ghost btn-icon" onClick={() => setShowAdd(false)}><X size={17} /></button>
            </div>
            <div className="modal-body">
              <div className="field-group">
                <label className="field-label">Company Name *</label>
                <input
                  className="input"
                  placeholder="e.g. Sharma Traders Pvt Ltd"
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  autoFocus
                />
              </div>

              <div className="input-group">
                <div className="field-group">
                  <label className="field-label">Business Type</label>
                  <select className="input select" value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}>
                    {BIZ_TYPES.map(t => <option key={t}>{t}</option>)}
                  </select>
                </div>
                <div className="field-group">
                  <label className="field-label">Financial Year</label>
                  <select className="input select" value={form.fy} onChange={e => setForm(f => ({ ...f, fy: e.target.value }))}>
                    <option>2024-25</option>
                    <option>2023-24</option>
                    <option>2022-23</option>
                  </select>
                </div>
              </div>

              <div className="field-group">
                <label className="field-label">GSTIN (Optional)</label>
                <input
                  className="input"
                  placeholder="e.g. 27AABCA1234C1ZX"
                  value={form.gstin}
                  onChange={e => setForm(f => ({ ...f, gstin: e.target.value.toUpperCase() }))}
                  style={{ fontFamily: 'var(--mono)', fontSize: 'var(--fs-sm)' }}
                  maxLength={15}
                />
              </div>

              <div className="field-group">
                <label className="field-label">Company Color</label>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {COLORS.map(c => (
                    <button
                      key={c}
                      onClick={() => setForm(f => ({ ...f, color: c }))}
                      style={{
                        width: 28, height: 28, borderRadius: 6, background: c,
                        border: form.color === c ? '2px solid var(--text)' : '2px solid transparent',
                        cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center'
                      }}
                    >
                      {form.color === c && <Check size={13} color="white" />}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="modal-foot">
              <button className="btn btn-secondary" onClick={() => setShowAdd(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleAdd}>
                <Plus size={14} /> Add Company
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirm modal */}
      {delId && (
        <div className="overlay" onClick={() => setDelId(null)}>
          <div className="modal" style={{ maxWidth: 380 }} onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <span className="modal-title" style={{ color: 'var(--danger)' }}>
                <AlertTriangle size={16} style={{ display: 'inline', marginRight: 6 }} />
                Delete Company
              </span>
              <button className="btn btn-ghost btn-icon" onClick={() => setDelId(null)}><X size={17} /></button>
            </div>
            <div className="modal-body">
              <p style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-2)', lineHeight: 1.6 }}>
                Are you sure you want to remove <strong>{companies.find(c => c.id === delId)?.name}</strong>?
                This will remove access to this company from your account.
                All accounting data will be preserved and can be re-added later.
              </p>
            </div>
            <div className="modal-foot">
              <button className="btn btn-secondary" onClick={() => setDelId(null)}>Cancel</button>
              <button className="btn btn-danger" onClick={() => handleDelete(delId)}>
                <Trash2 size={14} /> Yes, Remove
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
