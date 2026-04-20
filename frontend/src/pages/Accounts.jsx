// src/pages/Accounts.jsx — Chart of Accounts using real companyStore (zero balances for new companies)
import { useState } from 'react'
import { Plus, Search, Download, ChevronDown, ChevronRight, Edit2, X } from 'lucide-react'
import { fmt } from '../utils/format'
import { loadCompanyData, getAccountsWithBalances, saveAccount, DEFAULT_ACCOUNTS } from '../api/companyStore'
import { useAuth } from '../context/AuthContext'

const NATURE_COLOR = { asset:'blue', liability:'red', income:'green', expense:'amber' }
const NATURE_LABEL = { asset:'Asset', liability:'Liability', income:'Income', expense:'Expense' }

const GROUPS_BY_NATURE = {
  liability: ['Share Capital','Reserves & Surplus','Long-term Borrowings','Trade Payables','Other Current Liabilities'],
  asset:     ['Tangible Fixed Assets','Intangible Assets','Non-current Investments','Long-term Loans & Advances','Inventories','Trade Receivables','Cash & Cash Equivalents','Other Current Assets'],
  income:    ['Revenue from Operations','Other Income'],
  expense:   ['Cost of Goods Sold','Employee Benefit Expense','Depreciation & Amortisation','Finance Costs','Other Expenses'],
}

const EMPTY_FORM = { code:'', name:'', group:'', nature:'asset', type:'Expense', balance:'' }

export default function Accounts() {
  const { activeCompany } = useAuth()
  const [search,   setSearch]   = useState('')
  const [nature,   setNature]   = useState('all')
  const [expanded, setExpanded] = useState({})
  const [showModal, setModal]   = useState(false)
  const [editAcc,  setEditAcc]  = useState(null)
  const [form,     setForm]     = useState(EMPTY_FORM)
  const [refresh,  setRefresh]  = useState(0)

  // Live balances from real vouchers
  const accounts = getAccountsWithBalances(activeCompany?.id)

  const filtered = accounts.filter(a => {
    const matchN = nature === 'all' || a.nature === nature
    const matchS = !search || a.name.toLowerCase().includes(search.toLowerCase()) ||
                   a.code.includes(search) || a.group.toLowerCase().includes(search.toLowerCase())
    return matchN && matchS
  })

  const grouped = filtered.reduce((acc, a) => {
    if (!acc[a.group]) acc[a.group] = []
    acc[a.group].push(a)
    return acc
  }, {})

  const toggle = (g) => setExpanded(e => ({ ...e, [g]: e[g] === false ? true : false }))

  const totalAssets      = accounts.filter(a => a.nature === 'asset').reduce((s,a) => s + a.balance, 0)
  const totalLiabilities = accounts.filter(a => a.nature === 'liability').reduce((s,a) => s + a.balance, 0)
  const totalIncome      = accounts.filter(a => a.nature === 'income').reduce((s,a) => s + a.balance, 0)
  const totalExpense     = accounts.filter(a => a.nature === 'expense').reduce((s,a) => s + a.balance, 0)

  const openAdd = () => { setEditAcc(null); setForm(EMPTY_FORM); setModal(true) }
  const openEdit = (a) => { setEditAcc(a); setForm({ code:a.code, name:a.name, group:a.group, nature:a.nature, type:a.type, balance:a.balance }); setModal(true) }

  const handleSave = () => {
    if (!form.code.trim() || !form.name.trim() || !form.group.trim()) return
    saveAccount(activeCompany?.id, {
      id: editAcc?.id,
      code: form.code.trim(),
      name: form.name.trim(),
      group: form.group.trim(),
      nature: form.nature,
      type: form.type,
      balance: parseFloat(form.balance) || 0,
    })
    setModal(false)
    setRefresh(r => r+1)
  }

  const availableGroups = GROUPS_BY_NATURE[form.nature] || []

  return (
    <div className="page-enter" key={refresh}>
      <div className="page-header">
        <div>
          <h1 className="page-title">Chart of Accounts</h1>
          <p className="page-subtitle">Account master — grouped as per Schedule III, Companies Act 2013</p>
        </div>
        <div className="page-actions">
          <button className="btn btn-secondary"><Download size={15}/> Export</button>
          <button className="btn btn-primary" onClick={openAdd}><Plus size={15}/> Add Account</button>
        </div>
      </div>

      {/* Summary KPIs — live from vouchers (all zero until vouchers posted) */}
      <div style={{ display:'flex', gap:12, marginBottom:20 }}>
        {[
          { label:'Total Assets',      value:totalAssets,      color:'var(--accent)'  },
          { label:'Total Liabilities', value:totalLiabilities, color:'var(--danger)'  },
          { label:'Total Income',      value:totalIncome,      color:'var(--success)' },
          { label:'Total Expenses',    value:totalExpense,     color:'var(--warning)' },
        ].map(s => (
          <div key={s.label} className="card" style={{ flex:1, padding:'14px 18px' }}>
            <div style={{ fontSize:'0.72rem', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.07em', color:'var(--text-3)', marginBottom:5 }}>{s.label}</div>
            <div style={{ fontFamily:'var(--font-mono)', fontSize:'1.2rem', fontWeight:700, color: s.value === 0 ? 'var(--text-4)' : s.color }}>
              {s.value === 0 ? '₹0' : `₹${fmt(s.value)}`}
            </div>
            {s.value === 0 && <div style={{ fontSize:'0.7rem', color:'var(--text-4)', marginTop:2 }}>No entries yet</div>}
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="card" style={{ padding:'12px 16px', marginBottom:16, display:'flex', gap:10, alignItems:'center' }}>
        <div style={{ position:'relative', flex:1 }}>
          <Search size={14} style={{ position:'absolute', left:10, top:'50%', transform:'translateY(-50%)', color:'var(--text-4)' }}/>
          <input className="input" style={{ paddingLeft:32 }} placeholder="Search accounts by name, code or group…"
            value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        {['all','asset','liability','income','expense'].map(n => (
          <button key={n} className={`btn ${nature===n ? 'btn-primary' : 'btn-secondary'}`}
            style={{ padding:'6px 14px', fontSize:'0.78rem', textTransform:'capitalize' }}
            onClick={() => setNature(n)}>
            {n === 'all' ? 'All' : NATURE_LABEL[n]}
          </button>
        ))}
      </div>

      {/* Grouped Table */}
      <div className="card" style={{ overflow:'hidden' }}>
        <table style={{ width:'100%', borderCollapse:'collapse' }}>
          <thead>
            <tr style={{ background:'var(--surface-2)', borderBottom:'1px solid var(--border)' }}>
              {['Code','Account Name','Group','Type','Nature','Balance (₹)',''].map(h => (
                <th key={h} style={{ padding:'10px 14px', textAlign: h==='Balance (₹)' ? 'right' : 'left',
                  fontSize:'0.72rem', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.06em', color:'var(--text-3)' }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Object.entries(grouped).map(([group, accs]) => {
              const isOpen = expanded[group] !== false
              const groupTotal = accs.reduce((s,a) => s + a.balance, 0)
              const n = accs[0]?.nature
              return [
                <tr key={`g-${group}`} onClick={() => toggle(group)}
                  style={{ background:'var(--surface-2)', cursor:'pointer', borderBottom:'1px solid var(--border)' }}>
                  <td colSpan={5} style={{ padding:'8px 14px' }}>
                    <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                      {isOpen ? <ChevronDown size={13}/> : <ChevronRight size={13}/>}
                      <span style={{ fontWeight:700, fontSize:'0.8rem' }}>{group}</span>
                      <span style={{ fontSize:'0.72rem', color:'var(--text-4)' }}>({accs.length})</span>
                      {n && <span className={`badge badge-${NATURE_COLOR[n]}`}>{NATURE_LABEL[n]}</span>}
                    </div>
                  </td>
                  <td style={{ padding:'8px 14px', textAlign:'right', fontFamily:'var(--font-mono)', fontWeight:700, fontSize:'0.82rem',
                    color: groupTotal === 0 ? 'var(--text-4)' : 'var(--text)' }}>
                    {groupTotal === 0 ? '—' : `₹${fmt(groupTotal)}`}
                  </td>
                  <td/>
                </tr>,
                isOpen && accs.map(a => (
                  <tr key={a.id} style={{ borderBottom:'1px solid var(--border)' }}>
                    <td style={{ padding:'9px 14px 9px 32px', fontFamily:'var(--font-mono)', fontSize:'0.78rem', color:'var(--text-3)' }}>{a.code}</td>
                    <td style={{ padding:'9px 14px', fontSize:'var(--fs-sm)', fontWeight:500 }}>{a.name}</td>
                    <td style={{ padding:'9px 14px', fontSize:'0.78rem', color:'var(--text-3)' }}>{a.group}</td>
                    <td style={{ padding:'9px 14px', fontSize:'0.78rem', color:'var(--text-3)' }}>{a.type}</td>
                    <td style={{ padding:'9px 14px' }}>
                      <span className={`badge badge-${NATURE_COLOR[a.nature]}`}>{NATURE_LABEL[a.nature]}</span>
                    </td>
                    <td style={{ padding:'9px 14px', textAlign:'right', fontFamily:'var(--font-mono)', fontSize:'0.82rem',
                      fontWeight: a.balance !== 0 ? 600 : 400,
                      color: a.balance < 0 ? 'var(--danger)' : a.balance === 0 ? 'var(--text-4)' : 'var(--text)' }}>
                      {a.balance === 0 ? '—' : a.balance < 0 ? `(${fmt(Math.abs(a.balance))})` : fmt(a.balance)}
                    </td>
                    <td style={{ padding:'9px 14px' }}>
                      <button className="btn btn-secondary" style={{ padding:'3px 8px', fontSize:'0.72rem' }} onClick={() => openEdit(a)}>
                        <Edit2 size={11}/> Edit
                      </button>
                    </td>
                  </tr>
                ))
              ]
            })}
          </tbody>
        </table>
      </div>

      {/* Add / Edit Account Modal */}
      {showModal && (
        <div className="overlay" onClick={() => setModal(false)}>
          <div className="modal" style={{ maxWidth:500 }} onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <span className="modal-title">{editAcc ? 'Edit Account' : 'Add New Account'}</span>
              <button className="btn btn-ghost btn-icon" onClick={() => setModal(false)}><X size={17}/></button>
            </div>
            <div className="modal-body" style={{ display:'grid', gap:14 }}>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 2fr', gap:12 }}>
                <div className="field-group">
                  <label className="field-label">Account Code *</label>
                  <input className="input" placeholder="e.g. 9411" value={form.code} onChange={e => setForm(f => ({...f, code:e.target.value}))}/>
                </div>
                <div className="field-group">
                  <label className="field-label">Account Name *</label>
                  <input className="input" placeholder="e.g. Courier Charges" value={form.name} onChange={e => setForm(f => ({...f, name:e.target.value}))}/>
                </div>
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                <div className="field-group">
                  <label className="field-label">Nature *</label>
                  <select className="input" value={form.nature} onChange={e => setForm(f => ({...f, nature:e.target.value, group:''}))}>
                    <option value="asset">Asset</option>
                    <option value="liability">Liability</option>
                    <option value="income">Income</option>
                    <option value="expense">Expense</option>
                  </select>
                </div>
                <div className="field-group">
                  <label className="field-label">Group *</label>
                  <select className="input" value={form.group} onChange={e => setForm(f => ({...f, group:e.target.value}))}>
                    <option value="">Select group…</option>
                    {availableGroups.map(g => <option key={g} value={g}>{g}</option>)}
                    <option value="__custom">+ Custom group</option>
                  </select>
                </div>
              </div>
              {form.group === '__custom' && (
                <div className="field-group">
                  <label className="field-label">Custom Group Name</label>
                  <input className="input" placeholder="Enter group name" onChange={e => setForm(f => ({...f, group:e.target.value}))}/>
                </div>
              )}
              <div className="field-group">
                <label className="field-label">Opening Balance (₹)</label>
                <input className="input" type="number" placeholder="0" value={form.balance} onChange={e => setForm(f => ({...f, balance:e.target.value}))}/>
              </div>
            </div>
            <div className="modal-foot">
              <button className="btn btn-secondary" onClick={() => setModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={!form.code || !form.name || !form.group || form.group === '__custom'}>
                {editAcc ? 'Save Changes' : 'Create Account'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
