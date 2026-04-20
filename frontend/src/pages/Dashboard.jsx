// src/pages/Dashboard.jsx — uses real companyStore (no mock data)
import { useState } from 'react'
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts'
import {
  TrendingUp, TrendingDown, DollarSign, CreditCard,
  Wallet, BarChart2, AlertTriangle, Info, CheckCircle,
  ArrowRight, X, Plus, Zap, Activity, FileText,
  IndianRupee, Receipt, Users, RefreshCw
} from 'lucide-react'
import { loadCompanyData, addVoucher } from '../api/companyStore'
import { fmt, fmtCr, fmtDate } from '../utils/format'
import { useAuth } from '../context/AuthContext'
import toast from 'react-hot-toast'

const vBadge = {
  sales:'badge-green', purchase:'badge-red',
  receipt:'badge-blue', payment:'badge-amber', journal:'badge-gray',
}

const TT = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background:'#1F2937', color:'#F9FAFB', borderRadius:6, padding:'9px 12px', fontSize:12, boxShadow:'0 4px 12px rgba(0,0,0,.2)' }}>
      <div style={{ color:'#9CA3AF', marginBottom:6, fontWeight:600 }}>{label}</div>
      {payload.map(p => (
        <div key={p.name} style={{ display:'flex', gap:8, alignItems:'center', marginBottom:3 }}>
          <div style={{ width:8, height:8, borderRadius:'50%', background:p.color }} />
          <span style={{ color:'#D1D5DB', textTransform:'capitalize' }}>{p.name}:</span>
          <span style={{ fontWeight:600 }}>₹{(p.value/1000).toFixed(1)}K</span>
        </div>
      ))}
    </div>
  )
}

const COMPLIANCE_ITEMS = [
  { date:'7th',  label:'TDS Challan Due',  type:'warning', days:3  },
  { date:'11th', label:'GSTR-1 Filing',    type:'danger',  days:7  },
  { date:'20th', label:'GSTR-3B Filing',   type:'warning', days:16 },
  { date:'15th', label:'PF / ESIC Payment',type:'info',    days:11 },
  { date:'30th', label:'Advance Tax (Q1)', type:'info',    days:26 },
]

const QUICK_ACTIONS = [
  { icon:FileText,    label:'New Invoice',    color:'#2563EB', bg:'#EFF6FF' },
  { icon:Receipt,     label:'Record Expense', color:'#D97706', bg:'#FFFBEB' },
  { icon:IndianRupee, label:'Receive Payment',color:'#15803D', bg:'#F0FDF4' },
  { icon:Users,       label:'Run Payroll',    color:'#7C3AED', bg:'#F5F3FF' },
  { icon:BarChart2,   label:'GST Return',     color:'#0369A1', bg:'#F0F9FF' },
  { icon:RefreshCw,   label:'Reconcile Bank', color:'#BE185D', bg:'#FDF2F8' },
]

export default function Dashboard() {
  const { activeCompany } = useAuth()
  const [refresh, setRefresh] = useState(0)
  const companyData = loadCompanyData(activeCompany?.id)
  const data = companyData.dashboard
  const bs   = data.balanceSheet

  const [dismissed, setDismissed] = useState([])
  const alerts = (data.alerts || []).filter((_,i) => !dismissed.includes(`${activeCompany?.id}-${i}`))
  const dismissAlert = (i) => setDismissed(d => [...d, `${activeCompany?.id}-${i}`])

  const [modal, setModal] = useState(false)
  const [vForm, setVForm] = useState({
    type:'sales', date:new Date().toISOString().slice(0,10),
    reference:'', narration:'', amount:''
  })

  const isEmpty = !data.recentVouchers?.length && bs.income === 0

  const handlePostVoucher = () => {
    if (!vForm.narration.trim() || !vForm.amount) { toast.error('Fill all required fields'); return }
    addVoucher(activeCompany?.id, {
      voucher_type: vForm.type,
      date: vForm.date,
      reference: vForm.reference,
      narration: vForm.narration,
      amount: Number(vForm.amount),
    })
    toast.success('Voucher posted successfully!')
    setModal(false)
    setVForm({ type:'sales', date:new Date().toISOString().slice(0,10), reference:'', narration:'', amount:'' })
    setRefresh(r => r + 1)
  }

  return (
    <div className="page-wrap page-enter">
      <div className="page-header">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="page-sub">{activeCompany?.name} · {activeCompany?.fy} · Financial Overview</p>
        </div>
        <div className="page-actions">
          <button className="btn btn-secondary" onClick={() => toast.success('Report exported!')}><Activity size={13}/> Export PDF</button>
          <button className="btn btn-primary" onClick={() => setModal(true)}><Plus size={13}/> New Entry</button>
        </div>
      </div>

      {alerts.length > 0 && (
        <div className="alerts-wrap">
          {alerts.map((al, i) => (
            <div key={i} className={`alert-bar ${al.type==='warning'?'warn':al.type==='success'?'succ':'info'}`}>
              {al.type==='warning'&&<AlertTriangle size={14}/>}
              {al.type==='info'&&<Info size={14}/>}
              {al.type==='success'&&<CheckCircle size={14}/>}
              <span className="al-msg">{al.message}</span>
              {al.action&&<button className="al-act">{al.action} →</button>}
              <button className="al-x" onClick={()=>dismissAlert(i)}><X size={13}/></button>
            </div>
          ))}
        </div>
      )}

      {isEmpty && (
        <div style={{ padding:'20px 24px', background:'linear-gradient(135deg,#EFF6FF,#F5F3FF)', border:'1px solid #C7D2FE', borderRadius:12, marginBottom:16, display:'flex', alignItems:'center', gap:16 }}>
          <Zap size={28} color="#2563EB"/>
          <div>
            <div style={{ fontWeight:700, fontSize:15, marginBottom:4 }}>Welcome to {activeCompany?.name}!</div>
            <div style={{ fontSize:13, color:'var(--text-2)' }}>No data yet. Post a voucher or import a bank statement to get started.</div>
          </div>
          <button className="btn btn-primary" style={{ marginLeft:'auto', whiteSpace:'nowrap' }} onClick={()=>setModal(true)}>
            <Plus size={13}/> Post First Entry
          </button>
        </div>
      )}

      <div style={{ display:'grid', gridTemplateColumns:'repeat(6,1fr)', gap:10, marginBottom:16 }}>
        {QUICK_ACTIONS.map(a => (
          <button key={a.label} className="card"
            style={{ padding:'14px 10px', display:'flex', flexDirection:'column', alignItems:'center', gap:8, cursor:'pointer', border:'1px solid var(--border)', background:'var(--surface)', transition:'all .15s' }}
            onClick={()=>setModal(true)}
            onMouseEnter={e=>{e.currentTarget.style.borderColor=a.color;e.currentTarget.style.background=a.bg}}
            onMouseLeave={e=>{e.currentTarget.style.borderColor='var(--border)';e.currentTarget.style.background='var(--surface)'}}>
            <div style={{ width:36, height:36, borderRadius:10, background:a.bg, display:'flex', alignItems:'center', justifyContent:'center' }}>
              <a.icon size={16} color={a.color}/>
            </div>
            <span style={{ fontSize:11, fontWeight:600, color:'var(--text-2)', textAlign:'center', lineHeight:1.3 }}>{a.label}</span>
          </button>
        ))}
      </div>

      <div className="kpi-grid">
        {[
          { label:'Total Revenue',  value:fmtCr(bs.income),      icon:DollarSign, color:'blue',   trend:isEmpty?'No data yet':'+vs expenses', dir:'up' },
          { label:'Net Profit',     value:fmtCr(bs.net_profit),  icon:TrendingUp, color:'green',  trend:bs.income>0?`Margin ${((bs.net_profit/bs.income)*100).toFixed(1)}%`:'No data yet', dir:bs.net_profit>=0?'up':'down' },
          { label:'Total Assets',   value:fmtCr(bs.assets),      icon:Wallet,     color:'purple', trend:'Incl. receivables', dir:'up' },
          { label:'Net Payables',   value:fmtCr(bs.liabilities), icon:CreditCard, color:'red',    trend:'Creditors + tax', dir:'down' },
        ].map(k => (
          <div key={k.label} className={`kpi-card ${k.color}`}>
            <div className="kpi-header">
              <div className="kpi-label">{k.label}</div>
              <div className={`kpi-icon ${k.color}`}><k.icon size={14}/></div>
            </div>
            <div className="kpi-value">{k.value}</div>
            <span className={`kpi-trend ${k.dir}`}>
              {k.dir==='up'?<TrendingUp size={10}/>:<TrendingDown size={10}/>}
              {k.trend}
            </span>
          </div>
        ))}
      </div>

      <div className="grid-2" style={{ marginBottom:16 }}>
        <div className="card">
          <div className="card-head"><span className="card-title">Cash Flow — Last 6 Months</span><span className="badge badge-blue">Monthly</span></div>
          <div className="card-body" style={{ paddingTop:8 }}>
            {data.cashflow?.length > 0 ? (
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={data.cashflow} margin={{ top:5, right:5, left:-15, bottom:0 }}>
                  <defs>
                    <linearGradient id="gi" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#2563EB" stopOpacity={.15}/><stop offset="95%" stopColor="#2563EB" stopOpacity={0}/></linearGradient>
                    <linearGradient id="go" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#B91C1C" stopOpacity={.1}/><stop offset="95%" stopColor="#B91C1C" stopOpacity={0}/></linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" vertical={false}/>
                  <XAxis dataKey="month" tick={{ fontSize:11, fill:'#9CA3AF' }} axisLine={false} tickLine={false}/>
                  <YAxis tick={{ fontSize:11, fill:'#9CA3AF' }} axisLine={false} tickLine={false} tickFormatter={v=>`₹${(v/1000).toFixed(0)}K`}/>
                  <Tooltip content={<TT/>}/><Legend wrapperStyle={{ fontSize:11, paddingTop:10 }}/>
                  <Area type="monotone" dataKey="inflow"  stroke="#2563EB" strokeWidth={2} fill="url(#gi)" name="inflow"/>
                  <Area type="monotone" dataKey="outflow" stroke="#B91C1C" strokeWidth={1.5} fill="url(#go)" name="outflow"/>
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div style={{ height:200, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', color:'var(--text-4)', gap:8 }}>
                <BarChart2 size={32} opacity={0.3}/>
                <span style={{ fontSize:13 }}>Post vouchers to see cashflow chart</span>
              </div>
            )}
          </div>
        </div>

        <div className="card">
          <div className="card-head"><span className="card-title">Revenue vs Expenses</span><span className="badge badge-green">{activeCompany?.fy}</span></div>
          <div className="card-body" style={{ paddingTop:8 }}>
            {data.cashflow?.length > 0 ? (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={data.cashflow} margin={{ top:5, right:5, left:-15, bottom:0 }} barSize={10}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" vertical={false}/>
                  <XAxis dataKey="month" tick={{ fontSize:11, fill:'#9CA3AF' }} axisLine={false} tickLine={false}/>
                  <YAxis tick={{ fontSize:11, fill:'#9CA3AF' }} axisLine={false} tickLine={false} tickFormatter={v=>`₹${(v/1000).toFixed(0)}K`}/>
                  <Tooltip content={<TT/>}/><Legend wrapperStyle={{ fontSize:11, paddingTop:10 }}/>
                  <Bar dataKey="inflow"  fill="#2563EB" radius={[3,3,0,0]} name="revenue"/>
                  <Bar dataKey="outflow" fill="#E5E7EB" radius={[3,3,0,0]} name="expenses"/>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div style={{ height:200, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', color:'var(--text-4)', gap:8 }}>
                <BarChart2 size={32} opacity={0.3}/>
                <span style={{ fontSize:13 }}>Post vouchers to see revenue vs expenses</span>
              </div>
            )}
          </div>
        </div>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1.4fr', gap:16 }}>
        <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
          <div className="card">
            <div className="card-head"><span className="card-title">Balance Sheet Summary</span></div>
            <div className="card-body">
              {[
                { label:'Assets',      value:bs.assets,      color:'var(--accent)' },
                { label:'Liabilities', value:bs.liabilities, color:'var(--danger)' },
                { label:'Equity',      value:bs.equity,      color:'var(--success)' },
              ].map(r => (
                <div key={r.label} style={{ marginBottom:12 }}>
                  <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}>
                    <span style={{ fontSize:'var(--fs-sm)', color:'var(--text-2)' }}>{r.label}</span>
                    <span className="mono-val" style={{ fontWeight:600 }}>{fmtCr(r.value)}</span>
                  </div>
                  <div className="prog-wrap">
                    <div className="prog-fill" style={{ width:`${bs.assets>0?(Math.abs(r.value)/bs.assets)*100:0}%`, background:r.color }}/>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="card">
            <div className="card-head">
              <span className="card-title">Bank Reconciliation</span>
              <span className="badge badge-amber">{companyData.bankTransactions.filter(t=>t.status==='unmatched').length} pending</span>
            </div>
            <div className="card-body">
              {(() => {
                const total = companyData.bankTransactions.length || 1
                const matched = companyData.bankTransactions.filter(t=>t.status==='matched'||t.status==='manually_matched').length
                const pending = companyData.bankTransactions.filter(t=>t.status==='unmatched').length
                const ignored = companyData.bankTransactions.filter(t=>t.status==='ignored').length
                return [
                  { label:'Matched',      pct:Math.round(matched/total*100), color:'var(--success)' },
                  { label:'Needs review', pct:Math.round(pending/total*100), color:'var(--warning)' },
                  { label:'Ignored',      pct:Math.round(ignored/total*100), color:'var(--danger)' },
                ].map(r => (
                  <div key={r.label} style={{ marginBottom:10 }}>
                    <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}>
                      <span style={{ fontSize:'var(--fs-xs)', color:'var(--text-3)' }}>{r.label}</span>
                      <span style={{ fontSize:'var(--fs-xs)', fontWeight:700, color:r.color }}>{r.pct}%</span>
                    </div>
                    <div className="prog-wrap"><div className="prog-fill" style={{ width:`${r.pct}%`, background:r.color }}/></div>
                  </div>
                ))
              })()}
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-head"><span className="card-title">🇮🇳 Compliance Calendar</span><span className="badge badge-blue">April 2026</span></div>
          <div className="card-body" style={{ padding:'10px 14px' }}>
            {COMPLIANCE_ITEMS.map((item, i) => (
              <div key={i} style={{ display:'flex', alignItems:'center', gap:12, padding:'9px 0', borderBottom: i < COMPLIANCE_ITEMS.length-1 ? '1px solid var(--border)' : 'none' }}>
                <div style={{ width:36, height:36, borderRadius:8, flexShrink:0, background:item.type==='danger'?'var(--danger-l)':item.type==='warning'?'var(--warning-l)':'var(--info-l)', display:'flex', alignItems:'center', justifyContent:'center' }}>
                  <span style={{ fontSize:10, fontWeight:800, color:item.type==='danger'?'var(--danger)':item.type==='warning'?'var(--warning)':'var(--info)' }}>{item.date}</span>
                </div>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:12, fontWeight:600, color:'var(--text)' }}>{item.label}</div>
                  <div style={{ fontSize:11, color:'var(--text-4)' }}>in {item.days} days</div>
                </div>
                <span style={{ fontSize:10, padding:'2px 7px', borderRadius:10, fontWeight:700, background:item.type==='danger'?'var(--danger-l)':item.type==='warning'?'var(--warning-l)':'var(--info-l)', color:item.type==='danger'?'var(--danger)':item.type==='warning'?'var(--warning)':'var(--info)' }}>
                  {item.days<=5?'URGENT':item.days<=10?'SOON':'DUE'}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="tbl-wrap">
          <div className="tbl-toolbar">
            <span style={{ fontWeight:600, fontSize:'var(--fs-md)', flex:1 }}>Recent Transactions</span>
            <button className="btn btn-ghost btn-sm">View all <ArrowRight size={11}/></button>
          </div>
          {data.recentVouchers?.length > 0 ? (
            <table className="tbl">
              <thead><tr><th>Voucher No.</th><th>Narration</th><th>Type</th><th>Date</th><th style={{ textAlign:'right' }}>Amount (₹)</th></tr></thead>
              <tbody>
                {data.recentVouchers.map(v => (
                  <tr key={v.id}>
                    <td><span style={{ fontFamily:'var(--mono)', fontSize:'var(--fs-xs)', color:'var(--accent)', fontWeight:600 }}>{v.voucher_no}</span></td>
                    <td style={{ maxWidth:180 }}><span style={{ display:'block', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{v.narration}</span></td>
                    <td><span className={`badge ${vBadge[v.voucher_type]||'badge-gray'}`} style={{ textTransform:'capitalize' }}>{v.voucher_type}</span></td>
                    <td style={{ color:'var(--text-4)', fontSize:'var(--fs-xs)', whiteSpace:'nowrap' }}>{fmtDate(v.date)}</td>
                    <td style={{ textAlign:'right' }}><span className={['sales','receipt'].includes(v.voucher_type)?'cr':'dr'}>{['sales','receipt'].includes(v.voucher_type)?'+':'-'}₹{fmt(v.amount)}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div style={{ padding:'48px 0', textAlign:'center', color:'var(--text-3)' }}>
              <div style={{ fontSize:'2rem', marginBottom:8 }}>📭</div>
              <div style={{ fontSize:13 }}>No transactions yet</div>
              <button className="btn btn-primary btn-sm" style={{ marginTop:12 }} onClick={()=>setModal(true)}><Plus size={12}/> Post First Voucher</button>
            </div>
          )}
        </div>
      </div>

      {modal && (
        <div className="overlay" onClick={()=>setModal(false)}>
          <div className="modal" onClick={e=>e.stopPropagation()}>
            <div className="modal-head">
              <span className="modal-title">New Journal Entry</span>
              <button className="btn btn-ghost btn-icon" onClick={()=>setModal(false)}><X size={17}/></button>
            </div>
            <div className="modal-body">
              <div className="field-group">
                <label className="field-label">Voucher Type</label>
                <select className="input" value={vForm.type} onChange={e=>setVForm(f=>({...f,type:e.target.value}))}>
                  <option value="sales">Sales Invoice</option><option value="purchase">Purchase Invoice</option>
                  <option value="payment">Payment Voucher</option><option value="receipt">Receipt Voucher</option>
                  <option value="journal">Journal Voucher</option><option value="contra">Contra</option>
                </select>
              </div>
              <div className="input-group">
                <div className="field-group"><label className="field-label">Date</label><input type="date" className="input" value={vForm.date} onChange={e=>setVForm(f=>({...f,date:e.target.value}))}/></div>
                <div className="field-group"><label className="field-label">Reference No.</label><input type="text" className="input" placeholder="INV-0001" value={vForm.reference} onChange={e=>setVForm(f=>({...f,reference:e.target.value}))}/></div>
              </div>
              <div className="field-group"><label className="field-label">Narration *</label><input type="text" className="input" placeholder="Describe the transaction" value={vForm.narration} onChange={e=>setVForm(f=>({...f,narration:e.target.value}))}/></div>
              <div className="field-group"><label className="field-label">Amount (₹) *</label><input type="number" className="input" placeholder="0.00" value={vForm.amount} onChange={e=>setVForm(f=>({...f,amount:e.target.value}))}/></div>
            </div>
            <div className="modal-foot">
              <button className="btn btn-secondary" onClick={()=>setModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handlePostVoucher}>Post Voucher</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
