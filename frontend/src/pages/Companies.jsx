// src/pages/Companies.jsx — FIXED: FY year properly saved + updateCompany
import { useState } from 'react'
import { Plus, Building2, Trash2, Check, X, AlertTriangle, Edit2 } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import toast from 'react-hot-toast'

const BIZ_TYPES = [
  'Private Limited', 'Public Limited', 'Partnership Firm',
  'Proprietorship', 'LLP', 'OPC', 'Trust / NGO',
]

const COLORS = ['#2563EB','#7C3AED','#059669','#DC2626','#D97706','#0891B2','#BE185D']

// Generate FY options from 2019-20 to 2030-31
const FY_OPTIONS = Array.from({ length: 12 }, (_, i) => {
  const start = 2019 + i
  const end   = String(start + 1).slice(-2)
  return `${start}-${end}`
}).reverse()

// FormModal is defined OUTSIDE Companies so React never remounts it on re-render.
// Defining a component inside another component causes React to treat it as a new
// type on every render → full unmount/remount → input flicker + lost focus.
function FormModal({ title, onSave, onClose, form, setForm }) {
  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <span className="modal-title">{title}</span>
          <button className="btn btn-ghost btn-icon" onClick={onClose}><X size={17} /></button>
        </div>
        <div className="modal-body">
          <div className="field-group">
            <label className="field-label">Company Name *</label>
            <input
              className="input" placeholder="e.g. Sharma Traders Pvt Ltd"
              value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} autoFocus
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
                {FY_OPTIONS.map(fy => <option key={fy} value={fy}>{`FY ${fy}`}</option>)}
              </select>
            </div>
          </div>
          <div className="field-group">
            <label className="field-label">GSTIN (Optional)</label>
            <input
              className="input" placeholder="e.g. 27AABCA1234C1ZX"
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
                  key={c} onClick={() => setForm(f => ({ ...f, color: c }))}
                  style={{
                    width: 28, height: 28, borderRadius: 6, background: c,
                    border: form.color === c ? '3px solid var(--text)' : '2px solid transparent',
                    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center'
                  }}>
                  {form.color === c && <Check size={13} color="white" />}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="modal-foot">
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={onSave}><Plus size={14} /> {title.includes('Edit') ? 'Save Changes' : 'Add Company'}</button>
        </div>
      </div>
    </div>
  )
}

export default function Companies() {
  const { companies, activeCompany, switchCompany, addCompany, updateCompany, deleteCompany } = useAuth()
  const [showAdd,  setShowAdd]  = useState(false)
  const [editId,   setEditId]   = useState(null)
  const [delId,    setDelId]    = useState(null)
  const [form, setForm] = useState({ name: '', type: 'Private Limited', gstin: '', fy: '2025-26', color: COLORS[0] })

  const openEdit = (co) => {
    const fyRaw = co.fy?.replace('FY ', '') || '2025-26'
    setForm({ name: co.name, type: co.type, gstin: co.gstin || '', fy: fyRaw, color: co.color })
    setEditId(co.id)
  }

  const handleAdd = () => {
    if (!form.name.trim()) return toast.error('Company name is required')
    addCompany(form)
    setShowAdd(false)
    setForm({ name: '', type: 'Private Limited', gstin: '', fy: '2025-26', color: COLORS[0] })
    toast.success('Company added successfully')
  }

  const handleEdit = () => {
    if (!form.name.trim()) return toast.error('Company name is required')
    updateCompany(editId, {
      ...form,
      initials: form.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase(),
    })
    setEditId(null)
    toast.success('Company updated')
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
          <button className="btn btn-primary" onClick={() => { setForm({ name: '', type: 'Private Limited', gstin: '', fy: '2025-26', color: COLORS[0] }); setShowAdd(true) }}>
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
                <span className="badge badge-blue"><Check size={9} /> Active</span>
              </div>
            )}
            <div className="co-card-av" style={{ background: co.color }}>{co.initials}</div>
            <div className="co-card-name">{co.name}</div>
            {co.legalName && co.legalName !== co.name && (
              <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-3)', marginTop: 2 }}>
                {co.legalName}
              </div>
            )}
            <div className="co-card-type">{co.type}</div>
            {/* FY display */}
            <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--accent)', fontWeight: 600, marginTop: 4 }}>
              {co.fy}
            </div>
            {co.gstin && (
              <div style={{ fontFamily: 'var(--mono)', fontSize: 'var(--fs-xs)', color: 'var(--text-3)', marginTop: 4 }}>
                GSTIN: {co.gstin}
              </div>
            )}
            <div style={{ display: 'flex', gap: 6, marginTop: 14 }}>
              <button
                className="btn btn-secondary btn-sm" style={{ flex: 1 }}
                onClick={e => { e.stopPropagation(); switchCompany(co) }}
              >
                {activeCompany?.id === co.id ? 'Active' : 'Switch to'}
              </button>
              <button
                className="btn btn-sm"
                style={{ background: 'var(--surface-2)', color: 'var(--text-3)', border: '1px solid var(--border)' }}
                onClick={e => { e.stopPropagation(); openEdit(co) }}
                title="Edit company"
              >
                <Edit2 size={12} />
              </button>
              <button
                className="btn btn-sm"
                style={{ background: 'var(--danger-l)', color: 'var(--danger)', border: '1px solid var(--danger-b)' }}
                onClick={e => { e.stopPropagation(); setDelId(co.id) }}
                title="Delete company"
              >
                <Trash2 size={12} />
              </button>
            </div>
          </div>
        ))}

        {/* Add card */}
        <div className="add-co-card" onClick={() => { setForm({ name: '', type: 'Private Limited', gstin: '', fy: '2025-26', color: COLORS[0] }); setShowAdd(true) }}>
          <Plus size={22} />
          <div style={{ fontSize: 'var(--fs-sm)', fontWeight: 600 }}>Add New Company</div>
          <div style={{ fontSize: 'var(--fs-xs)' }}>Set up another entity for accounting</div>
        </div>
      </div>

      {/* Info box */}
      <div style={{
        marginTop: 24, padding: '14px 16px',
        background: 'var(--info-l)', border: '1px solid var(--info-b)',
        borderRadius: 'var(--r-lg)', fontSize: 'var(--fs-sm)',
        display: 'flex', gap: 10, alignItems: 'flex-start', color: '#0C4A6E'
      }}>
        <Building2 size={16} style={{ marginTop: 1, flexShrink: 0, color: 'var(--info)' }} />
        <div>
          <div style={{ fontWeight: 600, marginBottom: 3 }}>Multi-Company Accounting</div>
          Each company has its own separate chart of accounts, vouchers, GST filings and payroll.
          Switch between companies using the company selector in the top navigation bar.
          Your login credentials work across all companies.
          <br /><strong style={{ color: 'var(--info)' }}>Data is saved to browser localStorage</strong> — changes persist across page reloads.
        </div>
      </div>

      {/* Add Modal */}
      {showAdd && <FormModal title="Add New Company" onSave={handleAdd} onClose={() => setShowAdd(false)} form={form} setForm={setForm} />}

      {/* Edit Modal */}
      {editId && <FormModal title="Edit Company" onSave={handleEdit} onClose={() => setEditId(null)} form={form} setForm={setForm} />}

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
                All accounting data will be preserved and can be re-added later.
              </p>
            </div>
            <div className="modal-foot">
              <button className="btn btn-secondary" onClick={() => setDelId(null)}>Cancel</button>
              <button className="btn btn-danger" onClick={() => handleDelete(delId)}><Trash2 size={14} /> Yes, Remove</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
