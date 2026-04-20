// src/pages/Payroll.jsx
import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Users, Download, Play, CheckCircle, TrendingUp, UserCircle, FileText } from 'lucide-react'
import { getCompanyData } from '../api/mockData'
import { useAuth } from '../context/AuthContext'
import { fmt, fmtCr } from '../utils/format'

const PERIODS = ['March 2024', 'February 2024', 'January 2024']

export default function Payroll() {
  const { activeCompany } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const tab = searchParams.get('tab') || 'salary'
  const [period, setPeriod] = useState('March 2024')
  const [ran, setRan]       = useState(false)
  const [loading, setLoading] = useState(false)
  const payroll = getCompanyData(activeCompany?.id).payroll

  const handleRun = () => {
    setLoading(true)
    setTimeout(() => { setLoading(false); setRan(true) }, 1600)
  }

  const summary = [
    { label: 'Total Employees', value: payroll.employees.length, color: 'blue',   suffix: 'active' },
    { label: 'Gross Salary',    value: fmtCr(payroll.totals.gross), color: 'purple', suffix: 'total CTC' },
    { label: 'Net Payable',     value: fmtCr(payroll.totals.net), color: 'green',  suffix: 'to employees' },
    { label: 'Total Deductions',value: fmtCr(payroll.totals.pf_employee + payroll.totals.esic_employee + payroll.totals.tds), color: 'red', suffix: 'PF + ESIC + TDS' },
  ]

  return (
    <div className="page-enter">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Payroll</h1>
          <p className="page-subtitle">Salary processing · Employee master · PF / ESIC / TDS compliance</p>
        </div>
        <div className="page-actions">
          <div>
            <select className="input select" style={{ minWidth: 160 }} value={period} onChange={e => setPeriod(e.target.value)}>
              {PERIODS.map(p => <option key={p}>{p}</option>)}
            </select>
          </div>
          <button className="btn btn-secondary"><Download size={15} /> Export</button>
          {tab === 'salary' && (
            <button className="btn btn-primary" onClick={handleRun} disabled={loading || ran}>
              {loading
                ? <><span style={{ width: 14, height: 14, border: '2px solid rgba(255,255,255,0.4)', borderTopColor: 'white', borderRadius: '50%', display: 'inline-block', animation: 'spin 0.7s linear infinite' }} /> Processing...</>
                : ran
                ? <><CheckCircle size={15} /> Payroll Posted</>
                : <><Play size={15} /> Run Payroll</>
              }
            </button>
          )}
        </div>
      </div>

      {/* Tab Bar */}
      <div style={{ display:'flex', gap:2, marginBottom:20, background:'var(--surface-2)', padding:4, borderRadius:'var(--r-md)', width:'fit-content', border:'1px solid var(--border)' }}>
        {[
          { key:'salary',     label:'Salary Processing', icon:Play },
          { key:'employees',  label:'Employee Master',   icon:UserCircle },
          { key:'statutory',  label:'PF / ESIC / TDS',   icon:FileText },
        ].map(t => (
          <button key={t.key}
            onClick={() => setSearchParams({ tab: t.key })}
            className={tab===t.key ? 'btn btn-primary' : 'btn btn-secondary'}
            style={{ display:'flex', alignItems:'center', gap:7, padding:'7px 16px', fontSize:'0.83rem' }}>
            <t.icon size={14}/> {t.label}
          </button>
        ))}
      </div>

      {ran && tab === 'salary' && (
        <div className="alert-banner success" style={{ marginBottom: 20 }}>
          <CheckCircle size={15} />
          <span className="alert-msg">Payroll for {period} processed successfully · Journal entries posted · Bank transfer file ready</span>
        </div>

      )}

      {/* Salary Processing Tab */}
      {tab === 'salary' && (<>
      <div className="kpi-grid" style={{ marginBottom: 24 }}>
        {summary.map(s => (
          <div key={s.label} className={`kpi-card ${s.color}`}>
            <div className="kpi-label">{s.label}</div>
            <div className="kpi-value" style={{ fontSize: '1.5rem' }}>{s.value}</div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-3)', marginTop: 4 }}>{s.suffix}</div>
          </div>
        ))}
      </div>

      <div className="grid-2" style={{ gap: 20 }}>
        {/* Employee Table */}
        <div style={{ gridColumn: '1 / -1' }}>
          <div className="table-wrap">
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontFamily: 'var(--font-display)', fontSize: '0.9rem', fontWeight: 700 }}>
                Employee Salary Sheet — {period}
              </span>
              <span className="badge badge-gray">{payroll.employees.length} employees</span>
            </div>
            <table className="tbl">
              <thead>
                <tr>
                  <th>Employee</th>
                  <th style={{ textAlign: 'right' }}>Basic</th>
                  <th style={{ textAlign: 'right' }}>HRA</th>
                  <th style={{ textAlign: 'right' }}>Special</th>
                  <th style={{ textAlign: 'right' }}>Gross</th>
                  <th style={{ textAlign: 'right' }}>PF</th>
                  <th style={{ textAlign: 'right' }}>ESIC</th>
                  <th style={{ textAlign: 'right' }}>TDS</th>
                  <th style={{ textAlign: 'right' }}>Net Pay</th>
                </tr>
              </thead>
              <tbody>
                {payroll.employees.map(emp => (
                  <tr key={emp.id}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{
                          width: 32, height: 32, borderRadius: '50%',
                          background: `hsl(${emp.name.charCodeAt(0) * 7 % 360}, 60%, 70%)`,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: '0.72rem', fontWeight: 700, color: 'white', flexShrink: 0
                        }}>
                          {emp.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                        </div>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: '0.875rem' }}>{emp.name}</div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-3)' }}>{emp.designation}</div>
                        </div>
                      </div>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <span className="mono" style={{ color: 'var(--text-2)' }}>₹{fmt(emp.basic)}</span>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <span className="mono" style={{ color: 'var(--text-2)' }}>₹{fmt(emp.hra)}</span>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <span className="mono" style={{ color: 'var(--text-2)' }}>₹{fmt(emp.special)}</span>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <span className="mono" style={{ fontWeight: 700 }}>₹{fmt(emp.gross)}</span>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <span className="amt-dr">₹{fmt(emp.pf)}</span>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <span className="amt-dr">
                        {emp.esic > 0 ? `₹${fmt(emp.esic)}` : <span style={{ color: 'var(--text-3)' }}>—</span>}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <span className="amt-dr">
                        {emp.tds > 0 ? `₹${fmt(emp.tds)}` : <span style={{ color: 'var(--text-3)' }}>—</span>}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <span className="amt-cr" style={{ fontSize: '0.9rem', fontWeight: 800 }}>₹{fmt(emp.net)}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot style={{ background: 'var(--surface-2)' }}>
                <tr>
                  <td style={{ padding: '13px 16px', fontWeight: 700, fontFamily: 'var(--font-display)' }}>Totals</td>
                  <td colSpan={3} />
                  <td style={{ textAlign: 'right', padding: '13px 16px', fontFamily: 'var(--font-mono)', fontWeight: 800 }}>
                    ₹{fmt(payroll.totals.gross)}
                  </td>
                  <td style={{ textAlign: 'right', padding: '13px 16px', fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--danger)' }}>
                    ₹{fmt(payroll.totals.pf_employee)}
                  </td>
                  <td style={{ textAlign: 'right', padding: '13px 16px', fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--danger)' }}>
                    ₹{fmt(payroll.totals.esic_employee)}
                  </td>
                  <td style={{ textAlign: 'right', padding: '13px 16px', fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--danger)' }}>
                    ₹{fmt(payroll.totals.tds)}
                  </td>
                  <td style={{ textAlign: 'right', padding: '13px 16px', fontFamily: 'var(--font-mono)', fontWeight: 800, color: 'var(--success)', fontSize: '0.95rem' }}>
                    ₹{fmt(payroll.totals.net)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        {/* Statutory Summary */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">Statutory Contributions</span>
          </div>
          <div className="card-body">
            {[
              { label: 'PF — Employee (12%)',  value: payroll.totals.pf_employee,   color: 'var(--primary)' },
              { label: 'PF — Employer (12%)',  value: payroll.totals.pf_employee,   color: '#7C3AED' },
              { label: 'ESIC — Employee (0.75%)', value: payroll.totals.esic_employee, color: 'var(--warning)' },
              { label: 'TDS (avg. 7.3%)',      value: payroll.totals.tds,           color: 'var(--danger)' },
            ].map(item => (
              <div key={item.label} style={{ marginBottom: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-2)' }}>{item.label}</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.82rem', fontWeight: 700, color: item.color }}>
                    ₹{fmt(item.value)}
                  </span>
                </div>
                <div className="progress-wrap">
                  <div className="progress-fill" style={{
                    width: `${(item.value / payroll.totals.gross) * 100}%`,
                    background: item.color
                  }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Cost to Company */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">Cost to Company (CTC)</span>
            <span className="badge badge-purple">
              <TrendingUp size={10} /> {period}
            </span>
          </div>
          <div className="card-body">
            {[
              { label: 'Gross Salary',       value: payroll.totals.gross },
              { label: 'Employer PF',        value: payroll.totals.pf_employee },
              { label: 'Employer ESIC',      value: 1365 },
            ].map(row => (
              <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-2)' }}>{row.label}</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>₹{fmt(row.value)}</span>
              </div>
            ))}
            <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 12 }}>
              <span style={{ fontWeight: 700 }}>Total CTC</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 800, fontSize: '1.05rem', color: 'var(--text)' }}>
                ₹{fmt(payroll.totals.ctc)}
              </span>
            </div>
          </div>
        </div>
      </div>
      </>)}

      {/* Employee Master Tab */}
      {tab === 'employees' && (
        <div className="card" style={{ overflow:'hidden' }}>
          <div style={{ padding:'12px 16px', borderBottom:'1px solid var(--border)', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <span style={{ fontWeight:700, fontSize:'0.85rem' }}>Employee Master — {payroll.employees.length} Active Employees</span>
            <button className="btn btn-primary" style={{ fontSize:'0.8rem' }}><Users size={13}/> Add Employee</button>
          </div>
          <table style={{ width:'100%', borderCollapse:'collapse' }}>
            <thead>
              <tr style={{ background:'var(--surface-2)', borderBottom:'1px solid var(--border)' }}>
                {['Emp ID','Name','Designation','Basic (₹)','HRA (₹)','Special Allow. (₹)','Gross CTC (₹)','PF','ESIC','Status'].map(h => (
                  <th key={h} style={{ padding:'9px 14px', fontSize:'0.72rem', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.06em', color:'var(--text-3)', textAlign: h.includes('₹') ? 'right' : 'left' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {payroll.employees.map((e,i) => (
                <tr key={e.id} style={{ borderBottom:'1px solid var(--border)' }}>
                  <td style={{ padding:'9px 14px', fontFamily:'var(--font-mono)', fontSize:'0.78rem', color:'var(--text-3)' }}>EMP-{String(i+1).padStart(3,'0')}</td>
                  <td style={{ padding:'9px 14px', fontWeight:600, fontSize:'0.83rem' }}>{e.name}</td>
                  <td style={{ padding:'9px 14px', fontSize:'0.8rem', color:'var(--text-2)' }}>{e.designation}</td>
                  <td style={{ padding:'9px 14px', textAlign:'right', fontFamily:'var(--font-mono)', fontSize:'0.82rem' }}>{fmt(e.basic)}</td>
                  <td style={{ padding:'9px 14px', textAlign:'right', fontFamily:'var(--font-mono)', fontSize:'0.82rem' }}>{fmt(e.hra)}</td>
                  <td style={{ padding:'9px 14px', textAlign:'right', fontFamily:'var(--font-mono)', fontSize:'0.82rem' }}>{fmt(e.special)}</td>
                  <td style={{ padding:'9px 14px', textAlign:'right', fontFamily:'var(--font-mono)', fontSize:'0.82rem', fontWeight:700 }}>{fmt(e.gross)}</td>
                  <td style={{ padding:'9px 14px', textAlign:'center' }}><span className={e.pf > 0 ? 'badge badge-green' : 'badge badge-gray'}>{e.pf > 0 ? '✓' : '—'}</span></td>
                  <td style={{ padding:'9px 14px', textAlign:'center' }}><span className={e.esic > 0 ? 'badge badge-green' : 'badge badge-gray'}>{e.esic > 0 ? '✓' : 'Exempt'}</span></td>
                  <td style={{ padding:'9px 14px' }}><span className="badge badge-green">Active</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* PF / ESIC / TDS Statutory Tab */}
      {tab === 'statutory' && (
        <div style={{ display:'grid', gap:16 }}>
          {/* PF Summary */}
          <div className="card">
            <div style={{ padding:'12px 16px', borderBottom:'1px solid var(--border)', fontWeight:700, fontSize:'0.85rem', display:'flex', justifyContent:'space-between' }}>
              <span>Provident Fund (PF) — {period}</span>
              <span style={{ fontSize:'0.75rem', color:'var(--text-3)', fontWeight:400 }}>Employee: 12% of Basic · Employer: 12% of Basic</span>
            </div>
            <table style={{ width:'100%', borderCollapse:'collapse' }}>
              <thead><tr style={{ background:'var(--surface-2)', borderBottom:'1px solid var(--border)' }}>
                {['Employee','Basic (₹)','Employee PF @ 12% (₹)','Employer PF @ 12% (₹)','Total PF (₹)'].map(h => (
                  <th key={h} style={{ padding:'9px 14px', fontSize:'0.72rem', fontWeight:700, textTransform:'uppercase', color:'var(--text-3)', textAlign: h.includes('₹') ? 'right' : 'left' }}>{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {payroll.employees.map(e => (
                  <tr key={e.id} style={{ borderBottom:'1px solid var(--border)' }}>
                    <td style={{ padding:'9px 14px', fontSize:'0.83rem', fontWeight:500 }}>{e.name}</td>
                    <td style={{ padding:'9px 14px', textAlign:'right', fontFamily:'var(--font-mono)', fontSize:'0.82rem' }}>{fmt(e.basic)}</td>
                    <td style={{ padding:'9px 14px', textAlign:'right', fontFamily:'var(--font-mono)', fontSize:'0.82rem' }}>{fmt(e.pf)}</td>
                    <td style={{ padding:'9px 14px', textAlign:'right', fontFamily:'var(--font-mono)', fontSize:'0.82rem' }}>{fmt(e.pf)}</td>
                    <td style={{ padding:'9px 14px', textAlign:'right', fontFamily:'var(--font-mono)', fontSize:'0.82rem', fontWeight:700 }}>{fmt(e.pf * 2)}</td>
                  </tr>
                ))}
                <tr style={{ background:'var(--primary-l)', borderTop:'2px solid var(--border)' }}>
                  <td style={{ padding:'9px 14px', fontWeight:700 }}>TOTAL</td>
                  <td style={{ padding:'9px 14px', textAlign:'right', fontFamily:'var(--font-mono)', fontWeight:700 }}>{fmt(payroll.employees.reduce((s,e)=>s+e.basic,0))}</td>
                  <td style={{ padding:'9px 14px', textAlign:'right', fontFamily:'var(--font-mono)', fontWeight:700 }}>{fmt(payroll.totals.pf_employee)}</td>
                  <td style={{ padding:'9px 14px', textAlign:'right', fontFamily:'var(--font-mono)', fontWeight:700 }}>{fmt(payroll.totals.pf_employee)}</td>
                  <td style={{ padding:'9px 14px', textAlign:'right', fontFamily:'var(--font-mono)', fontWeight:700 }}>{fmt(payroll.totals.pf_employee * 2)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* ESIC Summary */}
          <div className="card">
            <div style={{ padding:'12px 16px', borderBottom:'1px solid var(--border)', fontWeight:700, fontSize:'0.85rem', display:'flex', justifyContent:'space-between' }}>
              <span>ESIC — {period}</span>
              <span style={{ fontSize:'0.75rem', color:'var(--text-3)', fontWeight:400 }}>Applicable if Gross ≤ ₹21,000 · Employee: 0.75% · Employer: 3.25%</span>
            </div>
            <table style={{ width:'100%', borderCollapse:'collapse' }}>
              <thead><tr style={{ background:'var(--surface-2)', borderBottom:'1px solid var(--border)' }}>
                {['Employee','Gross (₹)','ESIC Applicable','Employee ESIC @ 0.75%','Employer ESIC @ 3.25%','Total (₹)'].map(h => (
                  <th key={h} style={{ padding:'9px 14px', fontSize:'0.72rem', fontWeight:700, textTransform:'uppercase', color:'var(--text-3)', textAlign: h.includes('₹') ? 'right' : 'left' }}>{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {payroll.employees.map(e => {
                  const applicable = e.gross <= 21000
                  const empEsic = applicable ? Math.round(e.gross * 0.0075) : 0
                  const emplrEsic = applicable ? Math.round(e.gross * 0.0325) : 0
                  return (
                    <tr key={e.id} style={{ borderBottom:'1px solid var(--border)' }}>
                      <td style={{ padding:'9px 14px', fontSize:'0.83rem', fontWeight:500 }}>{e.name}</td>
                      <td style={{ padding:'9px 14px', textAlign:'right', fontFamily:'var(--font-mono)', fontSize:'0.82rem' }}>{fmt(e.gross)}</td>
                      <td style={{ padding:'9px 14px', textAlign:'center' }}><span className={applicable ? 'badge badge-green' : 'badge badge-gray'}>{applicable ? 'Yes' : 'Exempt'}</span></td>
                      <td style={{ padding:'9px 14px', textAlign:'right', fontFamily:'var(--font-mono)', fontSize:'0.82rem' }}>{empEsic > 0 ? fmt(empEsic) : '—'}</td>
                      <td style={{ padding:'9px 14px', textAlign:'right', fontFamily:'var(--font-mono)', fontSize:'0.82rem' }}>{emplrEsic > 0 ? fmt(emplrEsic) : '—'}</td>
                      <td style={{ padding:'9px 14px', textAlign:'right', fontFamily:'var(--font-mono)', fontSize:'0.82rem', fontWeight:700 }}>{(empEsic+emplrEsic) > 0 ? fmt(empEsic+emplrEsic) : '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* TDS Summary */}
          <div className="card">
            <div style={{ padding:'12px 16px', borderBottom:'1px solid var(--border)', fontWeight:700, fontSize:'0.85rem', display:'flex', justifyContent:'space-between' }}>
              <span>TDS on Salary (Section 192) — {period}</span>
              <span style={{ fontSize:'0.75rem', color:'var(--text-3)', fontWeight:400 }}>As per Income Tax slabs (New Regime default)</span>
            </div>
            <table style={{ width:'100%', borderCollapse:'collapse' }}>
              <thead><tr style={{ background:'var(--surface-2)', borderBottom:'1px solid var(--border)' }}>
                {['Employee','Annual Gross (₹)','Standard Deduction (₹)','Taxable Income (₹)','Monthly TDS (₹)','Challan (ITNS 281)'].map(h => (
                  <th key={h} style={{ padding:'9px 14px', fontSize:'0.72rem', fontWeight:700, textTransform:'uppercase', color:'var(--text-3)', textAlign: h.includes('₹') ? 'right' : 'left' }}>{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {payroll.employees.map(e => (
                  <tr key={e.id} style={{ borderBottom:'1px solid var(--border)' }}>
                    <td style={{ padding:'9px 14px', fontSize:'0.83rem', fontWeight:500 }}>{e.name}</td>
                    <td style={{ padding:'9px 14px', textAlign:'right', fontFamily:'var(--font-mono)', fontSize:'0.82rem' }}>{fmt(e.gross * 12)}</td>
                    <td style={{ padding:'9px 14px', textAlign:'right', fontFamily:'var(--font-mono)', fontSize:'0.82rem' }}>50,000</td>
                    <td style={{ padding:'9px 14px', textAlign:'right', fontFamily:'var(--font-mono)', fontSize:'0.82rem' }}>{fmt(e.gross * 12 - 50000)}</td>
                    <td style={{ padding:'9px 14px', textAlign:'right', fontFamily:'var(--font-mono)', fontSize:'0.82rem', fontWeight:700, color: e.tds > 0 ? 'var(--danger)' : 'var(--text-4)' }}>{e.tds > 0 ? fmt(e.tds) : '—'}</td>
                    <td style={{ padding:'9px 14px' }}><span className={e.tds > 0 ? 'badge badge-amber' : 'badge badge-gray'}>{e.tds > 0 ? 'Pending' : 'N/A'}</span></td>
                  </tr>
                ))}
                <tr style={{ background:'var(--primary-l)', borderTop:'2px solid var(--border)' }}>
                  <td colSpan={4} style={{ padding:'9px 14px', fontWeight:700 }}>TOTAL MONTHLY TDS DEPOSIT</td>
                  <td style={{ padding:'9px 14px', textAlign:'right', fontFamily:'var(--font-mono)', fontWeight:700, color:'var(--danger)' }}>{fmt(payroll.totals.tds)}</td>
                  <td style={{ padding:'9px 14px' }}><span className="badge badge-amber">Due 7th of next month</span></td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
