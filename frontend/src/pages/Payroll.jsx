// src/pages/Payroll.jsx
import { useState } from 'react'
import { Users, Download, Play, CheckCircle, TrendingUp } from 'lucide-react'
import { mockPayroll } from '../api/mockData'
import { fmt, fmtCr } from '../utils/format'

const PERIODS = ['March 2024', 'February 2024', 'January 2024']

export default function Payroll() {
  const [period, setPeriod] = useState('March 2024')
  const [ran, setRan]       = useState(false)
  const [loading, setLoading] = useState(false)
  const payroll = mockPayroll

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
          <p className="page-subtitle">Process salary, PF, ESIC and TDS for all employees</p>
        </div>
        <div className="page-actions">
          <div>
            <select className="input select" style={{ minWidth: 160 }} value={period} onChange={e => setPeriod(e.target.value)}>
              {PERIODS.map(p => <option key={p}>{p}</option>)}
            </select>
          </div>
          <button className="btn btn-secondary"><Download size={15} /> Export</button>
          <button className="btn btn-primary" onClick={handleRun} disabled={loading || ran}>
            {loading
              ? <><span style={{ width: 14, height: 14, border: '2px solid rgba(255,255,255,0.4)', borderTopColor: 'white', borderRadius: '50%', display: 'inline-block', animation: 'spin 0.7s linear infinite' }} /> Processing...</>
              : ran
              ? <><CheckCircle size={15} /> Payroll Posted</>
              : <><Play size={15} /> Run Payroll</>
            }
          </button>
        </div>
      </div>

      {ran && (
        <div className="alert-banner success" style={{ marginBottom: 20 }}>
          <CheckCircle size={15} />
          <span className="alert-msg">Payroll for {period} processed successfully · Journal entries posted · Bank transfer file ready</span>
        </div>
      )}

      {/* KPI Cards */}
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

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
