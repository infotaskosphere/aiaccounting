// src/pages/TrialBalance.jsx — Trial Balance (Indian Format)
import { useState } from 'react'
import { Download, Search, AlertCircle, CheckCircle } from 'lucide-react'
import { fmt } from '../utils/format'

const TB_DATA = [
  // Code, Name, Group, Op Dr, Op Cr, Txn Dr, Txn Cr, Cl Dr, Cl Cr
  { code:'1001', name:'Share Capital',                   group:'Share Capital',               opDr:0,       opCr:1000000, txDr:0,      txCr:0,      clDr:0,       clCr:1000000 },
  { code:'1002', name:'General Reserve',                 group:'Reserves & Surplus',          opDr:0,       opCr:450000,  txDr:0,      txCr:50000,  clDr:0,       clCr:500000 },
  { code:'1003', name:'P&L A/c (Opening)',               group:'Reserves & Surplus',          opDr:0,       opCr:420000,  txDr:0,      txCr:193300, clDr:0,       clCr:613300 },
  { code:'2001', name:'Term Loan - HDFC Bank',           group:'Long-term Borrowings',        opDr:0,       opCr:1000000, txDr:200000, txCr:0,      clDr:0,       clCr:800000 },
  { code:'2002', name:'Vehicle Loan - Axis Bank',        group:'Long-term Borrowings',        opDr:0,       opCr:300000,  txDr:80000,  txCr:0,      clDr:0,       clCr:220000 },
  { code:'3001', name:'Sundry Creditors',                group:'Trade Payables',              opDr:0,       opCr:310000,  txDr:920000, txCr:894000, clDr:0,       clCr:284000 },
  { code:'3101', name:'Output GST - CGST',               group:'Other Current Liabilities',   opDr:0,       opCr:60000,   txDr:130000, txCr:142000, clDr:0,       clCr:72000 },
  { code:'3102', name:'Output GST - SGST',               group:'Other Current Liabilities',   opDr:0,       opCr:60000,   txDr:130000, txCr:142000, clDr:0,       clCr:72000 },
  { code:'3104', name:'TDS Payable',                     group:'Other Current Liabilities',   opDr:0,       opCr:15000,   txDr:45000,  txCr:48500,  clDr:0,       clCr:18500 },
  { code:'3105', name:'PF Payable',                      group:'Other Current Liabilities',   opDr:0,       opCr:28000,   txDr:30000,  txCr:32000,  clDr:0,       clCr:30000 },
  { code:'3106', name:'ESIC Payable',                    group:'Other Current Liabilities',   opDr:0,       opCr:1200,    txDr:1400,   txCr:1700,   clDr:0,       clCr:1500 },
  { code:'3107', name:'Salary Payable',                  group:'Other Current Liabilities',   opDr:0,       opCr:320000,  txDr:320000, txCr:349250, clDr:0,       clCr:349250 },
  { code:'4001', name:'Land & Building',                 group:'Tangible Fixed Assets',       opDr:1200000, opCr:0,       txDr:0,      txCr:0,      clDr:1200000, clCr:0 },
  { code:'4002', name:'Plant & Machinery',               group:'Tangible Fixed Assets',       opDr:650000,  opCr:0,       txDr:30000,  txCr:0,      clDr:680000,  clCr:0 },
  { code:'4003', name:'Furniture & Fixtures',            group:'Tangible Fixed Assets',       opDr:95000,   opCr:0,       txDr:0,      txCr:0,      clDr:95000,   clCr:0 },
  { code:'4004', name:'Computers & Peripherals',         group:'Tangible Fixed Assets',       opDr:120000,  opCr:0,       txDr:25000,  txCr:0,      clDr:145000,  clCr:0 },
  { code:'4005', name:'Vehicles',                        group:'Tangible Fixed Assets',       opDr:380000,  opCr:0,       txDr:0,      txCr:0,      clDr:380000,  clCr:0 },
  { code:'4101', name:'Accumulated Depreciation',        group:'Tangible Fixed Assets',       opDr:0,       opCr:222000,  txDr:0,      txCr:98000,  clDr:0,       clCr:320000 },
  { code:'5101', name:'Security Deposits',               group:'Long-term Loans & Advances',  opDr:120000,  opCr:0,       txDr:0,      txCr:0,      clDr:120000,  clCr:0 },
  { code:'6001', name:'Stock-in-Trade',                  group:'Inventories',                 opDr:320000,  opCr:0,       txDr:60000,  txCr:0,      clDr:380000,  clCr:0 },
  { code:'6002', name:'Raw Materials',                   group:'Inventories',                 opDr:120000,  opCr:0,       txDr:20000,  txCr:0,      clDr:140000,  clCr:0 },
  { code:'7001', name:'Sundry Debtors',                  group:'Trade Receivables',           opDr:720000,  opCr:0,       txDr:886000, txCr:764000, clDr:842000,  clCr:0 },
  { code:'7002', name:'Bills Receivable',                group:'Trade Receivables',           opDr:80000,   opCr:0,       txDr:45000,  txCr:30000,  clDr:95000,   clCr:0 },
  { code:'7101', name:'Cash in Hand',                    group:'Cash & Cash Equivalents',     opDr:52000,   opCr:0,       txDr:156000, txCr:162800, clDr:45200,   clCr:0 },
  { code:'7102', name:'HDFC Bank - Current A/c',         group:'Cash & Cash Equivalents',     opDr:980000,  opCr:0,       txDr:2480000,txCr:2175500,clDr:1284500, clCr:0 },
  { code:'7103', name:'SBI Bank - Savings A/c',          group:'Cash & Cash Equivalents',     opDr:290000,  opCr:0,       txDr:180000, txCr:150000, clDr:320000,  clCr:0 },
  { code:'7201', name:'Input GST - CGST',                group:'Other Current Assets',        opDr:32000,   opCr:0,       txDr:32000,  txCr:25600,  clDr:38400,   clCr:0 },
  { code:'7202', name:'Input GST - SGST',                group:'Other Current Assets',        opDr:32000,   opCr:0,       txDr:32000,  txCr:25600,  clDr:38400,   clCr:0 },
  { code:'7203', name:'TDS Receivable',                  group:'Other Current Assets',        opDr:18000,   opCr:0,       txDr:8000,   txCr:2000,   clDr:24000,   clCr:0 },
  { code:'7204', name:'Prepaid Expenses',                group:'Other Current Assets',        opDr:28000,   opCr:0,       txDr:15000,  txCr:8000,   clDr:35000,   clCr:0 },
  { code:'8001', name:'Sales - Products',                group:'Revenue from Operations',     opDr:0,       opCr:0,       txDr:0,      txCr:2840000,clDr:0,       clCr:2840000 },
  { code:'8002', name:'Sales - Services',                group:'Revenue from Operations',     opDr:0,       opCr:0,       txDr:0,      txCr:1980000,clDr:0,       clCr:1980000 },
  { code:'8003', name:'Sales Returns',                   group:'Revenue from Operations',     opDr:0,       opCr:0,       txDr:125000, txCr:0,      clDr:125000,  clCr:0 },
  { code:'8101', name:'Interest Income',                 group:'Other Income',                opDr:0,       opCr:0,       txDr:0,      txCr:28000,  clDr:0,       clCr:28000 },
  { code:'8102', name:'Dividend Income',                 group:'Other Income',                opDr:0,       opCr:0,       txDr:0,      txCr:12000,  clDr:0,       clCr:12000 },
  { code:'9001', name:'Purchase - Products',             group:'Cost of Goods Sold',          opDr:0,       opCr:0,       txDr:1640000,txCr:0,      clDr:1640000, clCr:0 },
  { code:'9002', name:'Purchase Returns',                group:'Cost of Goods Sold',          opDr:0,       opCr:0,       txDr:0,      txCr:45000,  clDr:0,       clCr:45000 },
  { code:'9003', name:'Freight Inward',                  group:'Cost of Goods Sold',          opDr:0,       opCr:0,       txDr:38000,  txCr:0,      clDr:38000,   clCr:0 },
  { code:'9101', name:'Salaries & Wages',                group:'Employee Benefit Expense',    opDr:0,       opCr:0,       txDr:1840000,txCr:0,      clDr:1840000, clCr:0 },
  { code:'9102', name:'PF Contribution (Employer)',      group:'Employee Benefit Expense',    opDr:0,       opCr:0,       txDr:32000,  txCr:0,      clDr:32000,   clCr:0 },
  { code:'9103', name:'ESIC Contribution (Employer)',    group:'Employee Benefit Expense',    opDr:0,       opCr:0,       txDr:1600,   txCr:0,      clDr:1600,    clCr:0 },
  { code:'9201', name:'Depreciation',                    group:'Depreciation & Amortisation', opDr:0,       opCr:0,       txDr:98000,  txCr:0,      clDr:98000,   clCr:0 },
  { code:'9301', name:'Bank Interest',                   group:'Finance Costs',               opDr:0,       opCr:0,       txDr:42000,  txCr:0,      clDr:42000,   clCr:0 },
  { code:'9302', name:'Bank Charges',                    group:'Finance Costs',               opDr:0,       opCr:0,       txDr:12400,  txCr:0,      clDr:12400,   clCr:0 },
  { code:'9401', name:'Rent',                            group:'Other Expenses',              opDr:0,       opCr:0,       txDr:480000, txCr:0,      clDr:480000,  clCr:0 },
  { code:'9402', name:'Electricity Charges',             group:'Other Expenses',              opDr:0,       opCr:0,       txDr:84000,  txCr:0,      clDr:84000,   clCr:0 },
  { code:'9403', name:'Internet & Telephone',            group:'Other Expenses',              opDr:0,       opCr:0,       txDr:36000,  txCr:0,      clDr:36000,   clCr:0 },
  { code:'9404', name:'Software Subscriptions',          group:'Other Expenses',              opDr:0,       opCr:0,       txDr:124000, txCr:0,      clDr:124000,  clCr:0 },
  { code:'9405', name:'Advertising & Marketing',         group:'Other Expenses',              opDr:0,       opCr:0,       txDr:96000,  txCr:0,      clDr:96000,   clCr:0 },
  { code:'9406', name:'Travelling & Conveyance',         group:'Other Expenses',              opDr:0,       opCr:0,       txDr:48000,  txCr:0,      clDr:48000,   clCr:0 },
  { code:'9407', name:'Professional Fees',               group:'Other Expenses',              opDr:0,       opCr:0,       txDr:120000, txCr:0,      clDr:120000,  clCr:0 },
  { code:'9408', name:'Repairs & Maintenance',           group:'Other Expenses',              opDr:0,       opCr:0,       txDr:32000,  txCr:0,      clDr:32000,   clCr:0 },
  { code:'9409', name:'Printing & Stationery',           group:'Other Expenses',              opDr:0,       opCr:0,       txDr:18000,  txCr:0,      clDr:18000,   clCr:0 },
  { code:'9410', name:'Insurance',                       group:'Other Expenses',              opDr:0,       opCr:0,       txDr:36000,  txCr:0,      clDr:36000,   clCr:0 },
]

const Col = ({ children, right, bold, mono, small, color }) => (
  <td style={{
    padding:'8px 14px', textAlign: right ? 'right' : 'left',
    fontWeight: bold ? 700 : 400,
    fontFamily: mono ? 'var(--font-mono)' : 'inherit',
    fontSize: small ? '0.72rem' : '0.82rem',
    color: color || 'var(--text)',
    borderBottom:'1px solid var(--border)',
  }}>{children}</td>
)

export default function TrialBalance() {
  const [search, setSearch] = useState('')
  const [period, setPeriod] = useState('FY 2024-25')

  const filtered = TB_DATA.filter(r =>
    !search || r.name.toLowerCase().includes(search.toLowerCase()) || r.code.includes(search)
  )

  const totClDr = filtered.reduce((s,r) => s + r.clDr, 0)
  const totClCr = filtered.reduce((s,r) => s + r.clCr, 0)
  const totTxDr = filtered.reduce((s,r) => s + r.txDr, 0)
  const totTxCr = filtered.reduce((s,r) => s + r.txCr, 0)
  const balanced = Math.abs(totClDr - totClCr) < 1

  return (
    <div className="page-enter">
      <div className="page-header">
        <div>
          <h1 className="page-title">Trial Balance</h1>
          <p className="page-subtitle">As at 31st March 2024 · Acme Corp Pvt Ltd · All amounts in ₹</p>
        </div>
        <div className="page-actions">
          <select className="input select" value={period} onChange={e => setPeriod(e.target.value)} style={{ minWidth:130 }}>
            {['FY 2024-25','FY 2023-24','FY 2022-23'].map(p => <option key={p}>{p}</option>)}
          </select>
          <button className="btn btn-secondary"><Download size={15}/> Export PDF</button>
          <button className="btn btn-secondary"><Download size={15}/> Export Excel</button>
        </div>
      </div>

      {/* Balanced indicator */}
      <div className={`alert-banner ${balanced ? 'success' : 'error'}`} style={{ marginBottom:20 }}>
        {balanced ? <CheckCircle size={15}/> : <AlertCircle size={15}/>}
        <span className="alert-msg">
          {balanced
            ? `Trial Balance is balanced — Total Dr = Total Cr = ₹${fmt(totClDr)}`
            : `Trial Balance is NOT balanced — Dr: ₹${fmt(totClDr)} | Cr: ₹${fmt(totClCr)} | Diff: ₹${fmt(Math.abs(totClDr - totClCr))}`}
        </span>
      </div>

      {/* Search */}
      <div className="card" style={{ padding:'10px 14px', marginBottom:16, display:'flex', gap:10 }}>
        <div style={{ position:'relative', flex:1 }}>
          <Search size={14} style={{ position:'absolute', left:10, top:'50%', transform:'translateY(-50%)', color:'var(--text-4)' }}/>
          <input className="input" style={{ paddingLeft:32 }} placeholder="Search accounts…"
            value={search} onChange={e => setSearch(e.target.value)}/>
        </div>
      </div>

      {/* Table */}
      <div className="card" style={{ overflow:'auto' }}>
        <table style={{ width:'100%', borderCollapse:'collapse', minWidth:900 }}>
          <thead>
            <tr style={{ background:'var(--surface-2)' }}>
              <th rowSpan={2} style={{ ...th, width:80, borderRight:'1px solid var(--border)' }}>Code</th>
              <th rowSpan={2} style={{ ...th, borderRight:'1px solid var(--border)' }}>Account Name</th>
              <th rowSpan={2} style={{ ...th, borderRight:'1px solid var(--border)' }}>Group</th>
              <th colSpan={2} style={{ ...th, textAlign:'center', borderRight:'1px solid var(--border)', borderBottom:'1px solid var(--border)' }}>Opening Balance</th>
              <th colSpan={2} style={{ ...th, textAlign:'center', borderRight:'1px solid var(--border)', borderBottom:'1px solid var(--border)' }}>Transactions</th>
              <th colSpan={2} style={{ ...th, textAlign:'center', borderBottom:'1px solid var(--border)' }}>Closing Balance</th>
            </tr>
            <tr style={{ background:'var(--surface-2)' }}>
              {['Dr','Cr','Dr','Cr','Dr','Cr'].map((h,i) => (
                <th key={i} style={{ ...th, textAlign:'right', borderRight: i===1||i===3 ? '1px solid var(--border)' : undefined }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map(r => (
              <tr key={r.code} style={{ borderBottom:'1px solid var(--border)' }}>
                <td style={{ padding:'8px 14px', fontFamily:'var(--font-mono)', fontSize:'0.78rem', color:'var(--text-3)', borderRight:'1px solid var(--border)' }}>{r.code}</td>
                <td style={{ padding:'8px 14px', fontSize:'0.82rem', fontWeight:500, borderRight:'1px solid var(--border)' }}>{r.name}</td>
                <td style={{ padding:'8px 14px', fontSize:'0.75rem', color:'var(--text-3)', borderRight:'1px solid var(--border)' }}>{r.group}</td>
                <NumCell v={r.opDr}/><NumCell v={r.opCr} border/>
                <NumCell v={r.txDr}/><NumCell v={r.txCr} border/>
                <NumCell v={r.clDr} bold/><NumCell v={r.clCr} bold/>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ background:'var(--surface-2)', borderTop:'2px solid var(--border)' }}>
              <td colSpan={3} style={{ padding:'10px 14px', fontWeight:700, fontSize:'0.82rem' }}>TOTAL</td>
              <NumCell v={filtered.reduce((s,r)=>s+r.opDr,0)} bold/>
              <NumCell v={filtered.reduce((s,r)=>s+r.opCr,0)} bold border/>
              <NumCell v={totTxDr} bold/>
              <NumCell v={totTxCr} bold border/>
              <NumCell v={totClDr} bold highlight/>
              <NumCell v={totClCr} bold highlight/>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}

const th = {
  padding:'9px 14px', fontSize:'0.72rem', fontWeight:700,
  textTransform:'uppercase', letterSpacing:'0.06em', color:'var(--text-3)',
  textAlign:'left', whiteSpace:'nowrap',
}

function NumCell({ v, bold, border, highlight }) {
  return (
    <td style={{
      padding:'8px 14px', textAlign:'right',
      fontFamily:'var(--font-mono)', fontSize:'0.82rem',
      fontWeight: bold ? 700 : 400,
      borderRight: border ? '1px solid var(--border)' : undefined,
      background: highlight ? 'var(--primary-l)' : undefined,
      color: v === 0 ? 'var(--text-4)' : 'var(--text)',
    }}>
      {v === 0 ? '—' : fmt(v)}
    </td>
  )
}
