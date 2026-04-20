// src/pages/OpeningBalances.jsx — NEW: Migrate opening balances from Tally/other software
import { useState, useRef } from 'react'
import { Upload, Download, CheckCircle, AlertTriangle, Info, Plus, Trash2, X, Save, FileSpreadsheet } from 'lucide-react'
import toast from 'react-hot-toast'

const NATURE_OPTIONS  = ['asset','liability','equity','income','expense']
const TYPE_OPTIONS    = ['bank','cash','debtor','creditor','income','expense','tax','capital','fixed_asset','other']
const DR_CR_OPTIONS   = ['dr','cr']

const TEMPLATE_ROWS = [
  { code:'1001', name:'Cash in Hand',       nature:'asset',     type:'cash',       dr_cr:'dr', balance:50000 },
  { code:'1002', name:'Bank - SBI Current', nature:'asset',     type:'bank',       dr_cr:'dr', balance:480000 },
  { code:'2001', name:'Share Capital',      nature:'liability', type:'capital',    dr_cr:'cr', balance:500000 },
  { code:'3001', name:'Sales Account',      nature:'income',    type:'income',     dr_cr:'cr', balance:1200000 },
  { code:'4001', name:'Purchase Account',   nature:'expense',   type:'expense',    dr_cr:'dr', balance:800000 },
]

function BalanceRow({ row, idx, onChange, onDelete }) {
  const set = (k,v) => onChange(idx,{...row,[k]:v})
  const drSum = row.dr_cr==='dr' ? row.balance : 0
  const crSum = row.dr_cr==='cr' ? row.balance : 0
  return (
    <tr style={{borderBottom:'1px solid var(--border)'}}
      onMouseEnter={e=>e.currentTarget.style.background='var(--surface-2)'}
      onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
      <td style={{padding:'6px 10px',width:80}}>
        <input className="ob-table" type="text" value={row.code} onChange={e=>set('code',e.target.value)} placeholder="1001"/>
      </td>
      <td style={{padding:'6px 10px'}}>
        <input className="ob-table" type="text" value={row.name} onChange={e=>set('name',e.target.value)} placeholder="Account name"/>
      </td>
      <td style={{padding:'6px 10px',width:110}}>
        <select className="ob-table" value={row.nature} onChange={e=>set('nature',e.target.value)} style={{width:'100%',padding:'5px 8px',border:'1px solid var(--border)',borderRadius:'var(--r)',fontSize:'var(--fs-sm)',background:'var(--surface)'}}>
          {NATURE_OPTIONS.map(o=><option key={o}>{o}</option>)}
        </select>
      </td>
      <td style={{padding:'6px 10px',width:120}}>
        <select className="ob-table" value={row.type} onChange={e=>set('type',e.target.value)} style={{width:'100%',padding:'5px 8px',border:'1px solid var(--border)',borderRadius:'var(--r)',fontSize:'var(--fs-sm)',background:'var(--surface)'}}>
          {TYPE_OPTIONS.map(o=><option key={o}>{o}</option>)}
        </select>
      </td>
      <td style={{padding:'6px 10px',width:80,textAlign:'right'}}>
        <input className="ob-table" type="number" min="0" value={row.balance||''} onChange={e=>set('balance',Number(e.target.value))} placeholder="0.00" style={{textAlign:'right'}}/>
      </td>
      <td style={{padding:'6px 10px',width:60,textAlign:'center'}}>
        <select className="ob-table" value={row.dr_cr} onChange={e=>set('dr_cr',e.target.value)} style={{width:'100%',padding:'5px 4px',border:'1px solid var(--border)',borderRadius:'var(--r)',fontSize:'var(--fs-sm)',background:'var(--surface)',textAlign:'center'}}>
          <option value="dr">Dr</option>
          <option value="cr">Cr</option>
        </select>
      </td>
      <td style={{padding:'6px 10px',textAlign:'right',fontFamily:'var(--font-mono)',fontSize:12,color:'var(--success)'}}>{drSum>0?`₹${drSum.toLocaleString('en-IN')}`:'—'}</td>
      <td style={{padding:'6px 10px',textAlign:'right',fontFamily:'var(--font-mono)',fontSize:12,color:'var(--danger)'}}>{crSum>0?`₹${crSum.toLocaleString('en-IN')}`:'—'}</td>
      <td style={{padding:'6px 10px',textAlign:'center'}}>
        <button onClick={()=>onDelete(idx)} style={{padding:4,border:'none',background:'none',cursor:'pointer',color:'var(--danger)',borderRadius:4}} title="Remove">
          <Trash2 size={13}/>
        </button>
      </td>
    </tr>
  )
}

export default function OpeningBalances() {
  const [rows,    setRows]    = useState(TEMPLATE_ROWS.map(r=>({...r,id:Math.random()})))
  const [asOfDate,setAsOfDate]= useState(() => { const d=new Date(); d.setDate(d.getDate()-1); return d.toISOString().slice(0,10) })
  const [saved,   setSaved]   = useState(false)
  const [uploadMode,setUpload]= useState(false)
  const fileRef               = useRef()

  const addRow = () => setRows(r=>[...r,{id:Math.random(),code:'',name:'',nature:'asset',type:'other',balance:0,dr_cr:'dr'}])
  const updateRow = (idx,row) => setRows(r=>r.map((x,i)=>i===idx?row:x))
  const deleteRow = (idx) => setRows(r=>r.filter((_,i)=>i!==idx))

  const totalDr = rows.filter(r=>r.dr_cr==='dr').reduce((s,r)=>s+Number(r.balance||0),0)
  const totalCr = rows.filter(r=>r.dr_cr==='cr').reduce((s,r)=>s+Number(r.balance||0),0)
  const diff    = totalDr - totalCr
  const balanced = Math.abs(diff) < 0.01

  const handleFile = async (file) => {
    if (!file) return
    toast.success('Parsing file… (Demo: template data loaded)')
    setRows(TEMPLATE_ROWS.map(r=>({...r,id:Math.random()})))
    setUpload(false)
  }

  const handleSave = () => {
    const errors = rows.filter(r=>!r.code||!r.name||!r.balance)
    if (errors.length>0) { toast.error(`${errors.length} rows have missing data`); return }
    if (!balanced) { toast.error(`Out of balance by ₹${Math.abs(diff).toLocaleString('en-IN')}. Dr must equal Cr.`); return }
    setSaved(true)
    toast.success(`${rows.length} opening balances saved successfully!`)
  }

  const downloadTemplate = () => {
    const header = 'Code,Account Name,Nature,Type,Balance,Dr/Cr\n'
    const body   = TEMPLATE_ROWS.map(r=>`${r.code},${r.name},${r.nature},${r.type},${r.balance},${r.dr_cr}`).join('\n')
    const blob   = new Blob([header+body],{type:'text/csv'})
    const a      = document.createElement('a')
    a.href = URL.createObjectURL(blob); a.download='opening_balances_template.csv'; a.click()
    toast.success('Template downloaded')
  }

  return (
    <div className="page-wrap page-enter">
      <div className="page-header">
        <div>
          <h1 className="page-title">Opening Balances</h1>
          <p className="page-sub">Migrate from Tally, Zoho, QuickBooks or any other software</p>
        </div>
        <div className="page-actions">
          <button className="btn btn-secondary" onClick={downloadTemplate}><Download size={13}/> Download Template</button>
          <button className="btn btn-secondary" onClick={()=>{ setUpload(true); setTimeout(()=>fileRef.current?.click(),100) }}><Upload size={13}/> Import CSV</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saved}>{saved?<><CheckCircle size={13}/> Saved!</>:<><Save size={13}/> Save Opening Balances</>}</button>
        </div>
      </div>
      <input ref={fileRef} type="file" accept=".csv,.xlsx" style={{display:'none'}} onChange={e=>handleFile(e.target.files[0])}/>

      {/* Info banner */}
      <div style={{marginBottom:16,padding:'12px 16px',background:'var(--info-l)',borderRadius:8,border:'1px solid var(--info-b)',display:'flex',gap:10,alignItems:'flex-start'}}>
        <Info size={15} color="var(--info)" style={{flexShrink:0,marginTop:1}}/>
        <div style={{fontSize:12,color:'var(--text-2)'}}>
          <strong>How to migrate:</strong> Enter the closing balances from your previous software as of the date below.
          This creates the opening trial balance in FINIX AI. All Dr balances must equal all Cr balances (accounting equation).
          <span style={{color:'var(--accent)',cursor:'pointer',marginLeft:4}} onClick={downloadTemplate}>Download CSV template</span> for bulk import.
        </div>
      </div>

      {/* As-of date */}
      <div className="card" style={{padding:'14px 18px',marginBottom:16,display:'flex',gap:16,alignItems:'center',flexWrap:'wrap'}}>
        <div style={{display:'flex',alignItems:'center',gap:10}}>
          <label style={{fontSize:12,fontWeight:600,color:'var(--text-2)',whiteSpace:'nowrap'}}>Opening Balance As Of:</label>
          <input type="date" className="input" value={asOfDate} onChange={e=>setAsOfDate(e.target.value)} style={{width:160}}/>
        </div>
        <div style={{flex:1}}/>
        {/* Balance check */}
        <div style={{display:'flex',gap:16,fontSize:12}}>
          <span>Total Dr: <strong style={{fontFamily:'var(--font-mono)',color:'var(--success)'}}>₹{totalDr.toLocaleString('en-IN')}</strong></span>
          <span>Total Cr: <strong style={{fontFamily:'var(--font-mono)',color:'var(--danger)'}}>₹{totalCr.toLocaleString('en-IN')}</strong></span>
          <span style={{display:'flex',alignItems:'center',gap:4}}>
            {balanced?<><CheckCircle size={13} color="var(--success)"/><span style={{color:'var(--success)',fontWeight:600}}>Balanced ✓</span></>:<><AlertTriangle size={13} color="var(--danger)"/><span style={{color:'var(--danger)',fontWeight:600}}>Diff: ₹{Math.abs(diff).toLocaleString('en-IN')}</span></>}
          </span>
        </div>
      </div>

      {/* Table */}
      <div className="card" style={{overflow:'hidden'}}>
        <div style={{padding:'10px 14px',borderBottom:'1px solid var(--border)',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
          <span style={{fontWeight:600,fontSize:13}}>{rows.length} Accounts</span>
          <button className="btn btn-primary" style={{fontSize:12}} onClick={addRow}><Plus size={12}/> Add Row</button>
        </div>
        <div style={{overflowX:'auto'}}>
          <table style={{width:'100%',borderCollapse:'collapse'}}>
            <thead>
              <tr style={{background:'var(--surface-2)',fontSize:11,color:'var(--text-3)'}}>
                {['Code','Account Name','Nature','Type','Balance (₹)','Dr/Cr','Debit (₹)','Credit (₹)',''].map((h,i)=>(
                  <th key={i} style={{padding:'8px 10px',textAlign:['Balance (₹)','Debit (₹)','Credit (₹)'].includes(h)?'right':'center'===h||i===8?'center':'left',fontWeight:600,whiteSpace:'nowrap'}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row,idx)=>(
                <BalanceRow key={row.id} row={row} idx={idx} onChange={updateRow} onDelete={deleteRow}/>
              ))}
            </tbody>
            <tfoot>
              <tr style={{background:'var(--surface-2)',borderTop:'2px solid var(--border)'}}>
                <td colSpan={6} style={{padding:'10px 10px',fontWeight:700,fontSize:12}}>TOTAL</td>
                <td style={{padding:'10px 10px',textAlign:'right',fontFamily:'var(--font-mono)',fontWeight:700,color:'var(--success)'}}>₹{totalDr.toLocaleString('en-IN')}</td>
                <td style={{padding:'10px 10px',textAlign:'right',fontFamily:'var(--font-mono)',fontWeight:700,color:'var(--danger)'}}>₹{totalCr.toLocaleString('en-IN')}</td>
                <td/>
              </tr>
            </tfoot>
          </table>
        </div>
        {!balanced&&rows.length>0&&(
          <div style={{padding:'10px 14px',background:'var(--danger-l)',borderTop:'1px solid var(--danger-b)',display:'flex',gap:8,alignItems:'center',fontSize:12,color:'var(--danger)'}}>
            <AlertTriangle size={13}/> Trial balance is out of balance by ₹{Math.abs(diff).toLocaleString('en-IN')}. Add a difference account or check your entries.
          </div>
        )}
      </div>

      {/* Quick tips */}
      <div style={{marginTop:16,display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:12}}>
        {[
          {title:'From Tally',icon:'🏢',tip:'Export closing balance report from Tally as Excel. Use our template format or import directly.'},
          {title:'From Zoho Books',icon:'📊',tip:'Go to Reports → Trial Balance → Export CSV. Map columns to our template.'},
          {title:'Manual Entry',icon:'✏️',tip:'Enter each account\'s closing balance directly. Assets & Expenses are Dr; Liabilities & Income are Cr.'},
        ].map(t=>(
          <div key={t.title} className="card" style={{padding:'14px 16px'}}>
            <div style={{fontSize:20,marginBottom:6}}>{t.icon}</div>
            <div style={{fontWeight:600,fontSize:13,marginBottom:4}}>{t.title}</div>
            <div style={{fontSize:11,color:'var(--text-3)',lineHeight:1.5}}>{t.tip}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
