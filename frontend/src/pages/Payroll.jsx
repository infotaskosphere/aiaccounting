// src/pages/Payroll.jsx  — FIXED: working add / edit / remove employees
import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Users, Download, Play, CheckCircle, TrendingUp, UserCircle, FileText, Plus, Pencil, Trash2, X, Save } from 'lucide-react'
import { loadCompanyData, saveCompanyData } from '../api/companyStore'
import { useAuth } from '../context/AuthContext'
import { fmt, fmtCr } from '../utils/format'
import toast from 'react-hot-toast'

const PERIODS = ['March 2024', 'February 2024', 'January 2024']

function calcDerived(e) {
  const basic = Number(e.basic)||0, hra = Number(e.hra)||0, special = Number(e.special)||0
  const gross = basic+hra+special
  const pf = Math.round(basic*0.12)
  const esic = gross<=21000 ? Math.round(gross*0.0075) : 0
  const tds = gross>50000 ? Math.round((gross*12-50000)*0.05/12) : 0
  return { ...e, gross, pf, esic, tds, net: gross-pf-esic-tds }
}

function EmpModal({ emp, onSave, onClose }) {
  const [form, setForm] = useState({ name:emp?.name||'', designation:emp?.designation||'', basic:emp?.basic||'', hra:emp?.hra||'', special:emp?.special||'', pan:emp?.pan||'', bank:emp?.bank||'', ifsc:emp?.ifsc||'' })
  const set = (k,v) => setForm(f=>({...f,[k]:v}))
  const preview = calcDerived(form)
  const save = () => {
    if(!form.name.trim()){ toast.error('Name required'); return }
    if(!form.basic||Number(form.basic)<=0){ toast.error('Basic salary required'); return }
    onSave({...preview, id:emp?.id||`emp-${Date.now()}`})
  }
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{maxWidth:580}} onClick={e=>e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-title">{emp?.id?'Edit Employee':'Add New Employee'}</span>
          <button className="icon-btn" onClick={onClose}><X size={18}/></button>
        </div>
        <div className="modal-body" style={{display:'grid',gap:14}}>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
            <div className="form-group"><label className="form-label">Full Name *</label><input className="input" value={form.name} onChange={e=>set('name',e.target.value)} placeholder="e.g. Ravi Joshi"/></div>
            <div className="form-group"><label className="form-label">Designation</label><input className="input" value={form.designation} onChange={e=>set('designation',e.target.value)} placeholder="e.g. Accountant"/></div>
          </div>
          <div style={{background:'var(--surface-2)',borderRadius:8,padding:14,border:'1px solid var(--border)'}}>
            <div style={{fontSize:12,fontWeight:700,marginBottom:10,color:'var(--text-2)'}}>SALARY COMPONENTS</div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:12}}>
              {[['basic','Basic (₹) *'],['hra','HRA (₹)'],['special','Special Allow. (₹)']].map(([k,label])=>(
                <div key={k} className="form-group"><label className="form-label">{label}</label><input className="input" type="number" min="0" value={form[k]} onChange={e=>set(k,e.target.value)} placeholder="0"/></div>
              ))}
            </div>
            <div style={{marginTop:12,padding:'10px 14px',background:'var(--primary-l)',borderRadius:6,display:'flex',gap:20,flexWrap:'wrap',fontSize:12}}>
              {[['Gross',preview.gross],['PF (12%)',preview.pf],['ESIC',preview.esic],['TDS',preview.tds]].map(([l,v])=>(
                <div key={l}><span style={{color:'var(--text-3)'}}>{l}: </span><strong style={{fontFamily:'var(--font-mono)',color:'var(--accent)'}}>₹{fmt(v)}</strong></div>
              ))}
              <div><span style={{color:'var(--text-3)'}}>Net Pay: </span><strong style={{fontFamily:'var(--font-mono)',color:'var(--success)',fontSize:13}}>₹{fmt(preview.net)}</strong></div>
            </div>
          </div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:12}}>
            <div className="form-group"><label className="form-label">PAN</label><input className="input" value={form.pan} onChange={e=>set('pan',e.target.value.toUpperCase())} placeholder="ABCDE1234F" maxLength={10}/></div>
            <div className="form-group"><label className="form-label">Bank A/C No.</label><input className="input" value={form.bank} onChange={e=>set('bank',e.target.value)} placeholder="Account number"/></div>
            <div className="form-group"><label className="form-label">IFSC Code</label><input className="input" value={form.ifsc} onChange={e=>set('ifsc',e.target.value.toUpperCase())} placeholder="SBIN0001234"/></div>
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={save}><Save size={13}/> {emp?.id?'Save Changes':'Add Employee'}</button>
        </div>
      </div>
    </div>
  )
}

function DeleteConfirm({ emp, onConfirm, onClose }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{maxWidth:380}} onClick={e=>e.stopPropagation()}>
        <div className="modal-header"><span className="modal-title">Remove Employee</span><button className="icon-btn" onClick={onClose}><X size={18}/></button></div>
        <div className="modal-body">
          <p style={{fontSize:14,color:'var(--text-2)',marginBottom:6}}>Remove <strong>{emp.name}</strong> from payroll?</p>
          <p style={{fontSize:12,color:'var(--text-3)'}}>Historical payroll records will be preserved.</p>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn" style={{background:'var(--danger)',color:'#fff'}} onClick={onConfirm}><Trash2 size={13}/> Remove</button>
        </div>
      </div>
    </div>
  )
}

export default function Payroll() {
  const { activeCompany } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const tab = searchParams.get('tab') || 'salary'
  const [period, setPeriod] = useState('March 2024')
  const [ran, setRan] = useState(false)
  const [loading, setLoading] = useState(false)
  const companyData = loadCompanyData(activeCompany?.id)
  const payrollData = companyData.payroll
  const [employees, setEmployees] = useState(()=>payrollData.employees)
  const [addModal, setAddModal] = useState(false)
  const [editEmp, setEditEmp] = useState(null)
  const [deleteEmp, setDeleteEmp] = useState(null)

  const totals = employees.reduce((acc,e)=>({
    gross: acc.gross+(e.gross||0), pf_employee: acc.pf_employee+(e.pf||0),
    esic_employee: acc.esic_employee+(e.esic||0), tds: acc.tds+(e.tds||0),
    net: acc.net+(e.net||0), ctc: acc.ctc+(e.gross||0)+(e.pf||0)*2,
  }),{gross:0,pf_employee:0,esic_employee:0,tds:0,net:0,ctc:0})

  const handleRun=()=>{ setLoading(true); setTimeout(()=>{setLoading(false);setRan(true)},1600) }
  const handleAdd=(emp)=>{
    const updated = [...employees, emp]
    setEmployees(updated)
    const d = loadCompanyData(activeCompany?.id)
    d.payroll.employees = updated
    saveCompanyData(activeCompany?.id, d)
    setAddModal(false); toast.success(`${emp.name} added`)
  }
  const handleEdit=(emp)=>{
    const updated = employees.map(e=>e.id===emp.id?emp:e)
    setEmployees(updated)
    const d = loadCompanyData(activeCompany?.id)
    d.payroll.employees = updated
    saveCompanyData(activeCompany?.id, d)
    setEditEmp(null); toast.success('Employee updated')
  }
  const handleDelete=()=>{
    const updated = employees.filter(e=>e.id!==deleteEmp.id)
    setEmployees(updated)
    const d = loadCompanyData(activeCompany?.id)
    d.payroll.employees = updated
    saveCompanyData(activeCompany?.id, d)
    toast.success(`${deleteEmp.name} removed`); setDeleteEmp(null)
  }

  const summary=[
    {label:'Total Employees',value:employees.length,color:'blue',suffix:'active'},
    {label:'Gross Salary',value:fmtCr(totals.gross),color:'purple',suffix:'total CTC'},
    {label:'Net Payable',value:fmtCr(totals.net),color:'green',suffix:'to employees'},
    {label:'Total Deductions',value:fmtCr(totals.pf_employee+totals.esic_employee+totals.tds),color:'red',suffix:'PF + ESIC + TDS'},
  ]

  return (
    <div className="page-enter">
      <div className="page-header">
        <div><h1 className="page-title">Payroll</h1><p className="page-subtitle">Salary processing · Employee master · PF / ESIC / TDS compliance</p></div>
        <div className="page-actions">
          <select className="input select" style={{minWidth:160}} value={period} onChange={e=>setPeriod(e.target.value)}>{PERIODS.map(p=><option key={p}>{p}</option>)}</select>
          <button className="btn btn-secondary"><Download size={15}/> Export</button>
          {tab==='salary'&&<button className="btn btn-primary" onClick={handleRun} disabled={loading||ran}>{loading?<><span style={{width:14,height:14,border:'2px solid rgba(255,255,255,.4)',borderTopColor:'white',borderRadius:'50%',display:'inline-block',animation:'spin .7s linear infinite'}}/> Processing...</>:ran?<><CheckCircle size={15}/> Payroll Posted</>:<><Play size={15}/> Run Payroll</>}</button>}
          {tab==='employees'&&<button className="btn btn-primary" onClick={()=>setAddModal(true)}><Plus size={14}/> Add Employee</button>}
        </div>
      </div>

      <div style={{display:'flex',gap:2,marginBottom:20,background:'var(--surface-2)',padding:4,borderRadius:'var(--r-md)',width:'fit-content',border:'1px solid var(--border)'}}>
        {[{key:'salary',label:'Salary Processing',icon:Play},{key:'employees',label:'Employee Master',icon:UserCircle},{key:'statutory',label:'PF / ESIC / TDS',icon:FileText}].map(t=>(
          <button key={t.key} onClick={()=>setSearchParams({tab:t.key})} className={tab===t.key?'btn btn-primary':'btn btn-secondary'} style={{display:'flex',alignItems:'center',gap:7,padding:'7px 16px',fontSize:'0.83rem'}}><t.icon size={14}/> {t.label}</button>
        ))}
      </div>

      {ran&&tab==='salary'&&<div className="alert-banner success" style={{marginBottom:20}}><CheckCircle size={15}/><span className="alert-msg">Payroll for {period} processed · Journal entries posted · Bank transfer file ready</span></div>}

      {tab==='salary'&&<>
        <div className="kpi-grid" style={{marginBottom:24}}>{summary.map(s=>(<div key={s.label} className={`kpi-card ${s.color}`}><div className="kpi-label">{s.label}</div><div className="kpi-value" style={{fontSize:'1.5rem'}}>{s.value}</div><div style={{fontSize:'0.72rem',color:'var(--text-3)',marginTop:4}}>{s.suffix}</div></div>))}</div>
        <div className="table-wrap">
          <div style={{padding:'16px 20px',borderBottom:'1px solid var(--border)',display:'flex',alignItems:'center',justifyContent:'space-between'}}><span style={{fontWeight:700,fontSize:'0.9rem'}}>Employee Salary Sheet — {period}</span><span className="badge badge-gray">{employees.length} employees</span></div>
          <table className="tbl"><thead><tr><th>Employee</th><th style={{textAlign:'right'}}>Basic</th><th style={{textAlign:'right'}}>HRA</th><th style={{textAlign:'right'}}>Special</th><th style={{textAlign:'right'}}>Gross</th><th style={{textAlign:'right'}}>PF</th><th style={{textAlign:'right'}}>ESIC</th><th style={{textAlign:'right'}}>TDS</th><th style={{textAlign:'right'}}>Net Pay</th></tr></thead>
          <tbody>{employees.map(emp=>(
            <tr key={emp.id}><td><div style={{display:'flex',alignItems:'center',gap:10}}><div style={{width:32,height:32,borderRadius:'50%',background:`hsl(${emp.name.charCodeAt(0)*7%360},60%,70%)`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:'0.72rem',fontWeight:700,color:'white',flexShrink:0}}>{emp.name.split(' ').map(n=>n[0]).join('').slice(0,2)}</div><div><div style={{fontWeight:600,fontSize:'0.875rem'}}>{emp.name}</div><div style={{fontSize:'0.75rem',color:'var(--text-3)'}}>{emp.designation}</div></div></div></td>
            <td style={{textAlign:'right'}}><span className="mono">₹{fmt(emp.basic)}</span></td><td style={{textAlign:'right'}}><span className="mono">₹{fmt(emp.hra)}</span></td><td style={{textAlign:'right'}}><span className="mono">₹{fmt(emp.special)}</span></td><td style={{textAlign:'right'}}><span className="mono" style={{fontWeight:700}}>₹{fmt(emp.gross)}</span></td><td style={{textAlign:'right'}}><span className="amt-dr">₹{fmt(emp.pf)}</span></td><td style={{textAlign:'right'}}><span className="amt-dr">{emp.esic>0?`₹${fmt(emp.esic)}`:<span style={{color:'var(--text-3)'}}>—</span>}</span></td><td style={{textAlign:'right'}}><span className="amt-dr">{emp.tds>0?`₹${fmt(emp.tds)}`:<span style={{color:'var(--text-3)'}}>—</span>}</span></td><td style={{textAlign:'right'}}><span className="amt-cr" style={{fontSize:'0.9rem',fontWeight:800}}>₹{fmt(emp.net)}</span></td></tr>
          ))}</tbody>
          <tfoot style={{background:'var(--surface-2)'}}><tr><td style={{padding:'13px 16px',fontWeight:700}}>Totals</td><td colSpan={3}/><td style={{textAlign:'right',padding:'13px 16px',fontFamily:'var(--font-mono)',fontWeight:800}}>₹{fmt(totals.gross)}</td><td style={{textAlign:'right',padding:'13px 16px',fontFamily:'var(--font-mono)',fontWeight:700,color:'var(--danger)'}}>₹{fmt(totals.pf_employee)}</td><td style={{textAlign:'right',padding:'13px 16px',fontFamily:'var(--font-mono)',fontWeight:700,color:'var(--danger)'}}>₹{fmt(totals.esic_employee)}</td><td style={{textAlign:'right',padding:'13px 16px',fontFamily:'var(--font-mono)',fontWeight:700,color:'var(--danger)'}}>₹{fmt(totals.tds)}</td><td style={{textAlign:'right',padding:'13px 16px',fontFamily:'var(--font-mono)',fontWeight:800,color:'var(--success)',fontSize:'0.95rem'}}>₹{fmt(totals.net)}</td></tr></tfoot>
          </table>
        </div>
      </>}

      {tab==='employees'&&(
        <div className="card" style={{overflow:'hidden'}}>
          <div style={{padding:'12px 16px',borderBottom:'1px solid var(--border)',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
            <span style={{fontWeight:700,fontSize:'0.85rem'}}>Employee Master — {employees.length} Active Employees</span>
            <button className="btn btn-primary" style={{fontSize:'0.8rem'}} onClick={()=>setAddModal(true)}><Plus size={13}/> Add Employee</button>
          </div>
          <table style={{width:'100%',borderCollapse:'collapse'}}>
            <thead><tr style={{background:'var(--surface-2)',borderBottom:'1px solid var(--border)'}}>
              {['Emp ID','Name','Designation','Basic (₹)','HRA (₹)','Gross CTC (₹)','PF','ESIC','Status','Actions'].map(h=>(
                <th key={h} style={{padding:'9px 14px',fontSize:'0.72rem',fontWeight:700,textTransform:'uppercase',letterSpacing:'0.06em',color:'var(--text-3)',textAlign:h.includes('₹')?'right':'left'}}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {employees.length===0&&<tr><td colSpan={10} style={{padding:32,textAlign:'center',color:'var(--text-3)'}}>No employees yet. Click <strong>Add Employee</strong> to get started.</td></tr>}
              {employees.map((e,i)=>(
                <tr key={e.id} style={{borderBottom:'1px solid var(--border)'}} onMouseEnter={ev=>ev.currentTarget.style.background='var(--surface-2)'} onMouseLeave={ev=>ev.currentTarget.style.background='transparent'}>
                  <td style={{padding:'9px 14px',fontFamily:'var(--font-mono)',fontSize:'0.78rem',color:'var(--text-3)'}}>EMP-{String(i+1).padStart(3,'0')}</td>
                  <td style={{padding:'9px 14px',fontWeight:600,fontSize:'0.83rem'}}>{e.name}</td>
                  <td style={{padding:'9px 14px',fontSize:'0.8rem',color:'var(--text-2)'}}>{e.designation}</td>
                  <td style={{padding:'9px 14px',textAlign:'right',fontFamily:'var(--font-mono)',fontSize:'0.82rem'}}>{fmt(e.basic)}</td>
                  <td style={{padding:'9px 14px',textAlign:'right',fontFamily:'var(--font-mono)',fontSize:'0.82rem'}}>{fmt(e.hra)}</td>
                  <td style={{padding:'9px 14px',textAlign:'right',fontFamily:'var(--font-mono)',fontSize:'0.82rem',fontWeight:700}}>{fmt(e.gross)}</td>
                  <td style={{padding:'9px 14px',textAlign:'center'}}><span className={e.pf>0?'badge badge-green':'badge badge-gray'}>{e.pf>0?'✓':'—'}</span></td>
                  <td style={{padding:'9px 14px',textAlign:'center'}}><span className={e.esic>0?'badge badge-green':'badge badge-gray'}>{e.esic>0?'✓':'Exempt'}</span></td>
                  <td style={{padding:'9px 14px'}}><span className="badge badge-green">Active</span></td>
                  <td style={{padding:'9px 14px'}}>
                    <div style={{display:'flex',gap:5}}>
                      <button title="Edit" onClick={()=>setEditEmp(e)} style={{padding:'4px 8px',border:'1px solid var(--border)',borderRadius:5,background:'var(--surface)',cursor:'pointer',display:'flex',alignItems:'center',gap:3,fontSize:11,color:'var(--text-2)'}}><Pencil size={11}/> Edit</button>
                      <button title="Remove" onClick={()=>setDeleteEmp(e)} style={{padding:'4px 8px',border:'1px solid var(--danger-b)',borderRadius:5,background:'var(--danger-l)',cursor:'pointer',display:'flex',alignItems:'center',gap:3,fontSize:11,color:'var(--danger)'}}><Trash2 size={11}/> Remove</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab==='statutory'&&(
        <div style={{display:'grid',gap:16}}>
          <div className="card">
            <div style={{padding:'12px 16px',borderBottom:'1px solid var(--border)',fontWeight:700,fontSize:'0.85rem',display:'flex',justifyContent:'space-between'}}><span>Provident Fund (PF) — {period}</span><span style={{fontSize:'0.75rem',color:'var(--text-3)',fontWeight:400}}>Employee: 12% · Employer: 12%</span></div>
            <table style={{width:'100%',borderCollapse:'collapse'}}><thead><tr style={{background:'var(--surface-2)',borderBottom:'1px solid var(--border)'}}>{['Employee','Basic (₹)','Employee PF @ 12%','Employer PF @ 12%','Total PF (₹)'].map(h=><th key={h} style={{padding:'9px 14px',fontSize:'0.72rem',fontWeight:700,textTransform:'uppercase',color:'var(--text-3)',textAlign:h.includes('₹')?'right':'left'}}>{h}</th>)}</tr></thead>
            <tbody>{employees.map(e=><tr key={e.id} style={{borderBottom:'1px solid var(--border)'}}><td style={{padding:'9px 14px',fontWeight:500}}>{e.name}</td><td style={{padding:'9px 14px',textAlign:'right',fontFamily:'var(--font-mono)'}}>{fmt(e.basic)}</td><td style={{padding:'9px 14px',textAlign:'right',fontFamily:'var(--font-mono)'}}>{fmt(e.pf)}</td><td style={{padding:'9px 14px',textAlign:'right',fontFamily:'var(--font-mono)'}}>{fmt(e.pf)}</td><td style={{padding:'9px 14px',textAlign:'right',fontFamily:'var(--font-mono)',fontWeight:700}}>{fmt(e.pf*2)}</td></tr>)}</tbody>
            </table>
          </div>
        </div>
      )}

      {addModal&&<EmpModal emp={null} onSave={handleAdd} onClose={()=>setAddModal(false)}/>}
      {editEmp&&<EmpModal emp={editEmp} onSave={handleEdit} onClose={()=>setEditEmp(null)}/>}
      {deleteEmp&&<DeleteConfirm emp={deleteEmp} onConfirm={handleDelete} onClose={()=>setDeleteEmp(null)}/>}
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )
}
