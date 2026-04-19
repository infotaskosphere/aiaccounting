// src/pages/Dashboard.jsx
import { useState } from 'react'
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts'
import {
  TrendingUp, TrendingDown, DollarSign, Activity,
  AlertTriangle, Info, CheckCircle, ArrowRight, X,
  Zap, BarChart2, CreditCard, Wallet
} from 'lucide-react'
import { mockDashboard } from '../api/mockData'
import { fmt, fmtCr, fmtDate } from '../utils/format'

const voucherBadge = {
  sales:    'badge-green',
  purchase: 'badge-red',
  receipt:  'badge-blue',
  payment:  'badge-amber',
  journal:  'badge-gray',
}

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <div style={{
      background: 'var(--text)', color: 'white',
      borderRadius: 10, padding: '10px 14px',
      fontSize: '0.8rem', boxShadow: '0 8px 20px rgba(0,0,0,0.2)'
    }}>
      <div style={{ fontWeight: 700, marginBottom: 6, color: '#94A3B8' }}>{label}</div>
      {payload.map(p => (
        <div key={p.name} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: p.color }} />
          <span style={{ color: '#CBD5E1', textTransform: 'capitalize' }}>{p.name}:</span>
          <span style={{ fontWeight: 600 }}>₹{(p.value / 100000).toFixed(1)}L</span>
        </div>
      ))}
    </div>
  )
}

export default function Dashboard() {
  const [data]   = useState(mockDashboard)
  const [alerts, setAlerts] = useState(data.alerts)
  const [showModal, setShowModal] = useState(false)
  const bs = data.balanceSheet

  const kpis = [
    {
      label: 'Total Revenue', value: fmtCr(bs.income),
      icon: DollarSign, color: 'blue',
      trend: '+18% vs last year', dir: 'up'
    },
    {
      label: 'Net Profit', value: fmtCr(bs.net_profit),
      icon: TrendingUp, color: 'green',
      trend: `Margin ${((bs.net_profit / bs.income) * 100).toFixed(1)}%`, dir: 'up'
    },
    {
      label: 'Total Assets', value: fmtCr(bs.assets),
      icon: Wallet, color: 'purple',
      trend: 'Including receivables', dir: 'up'
    },
    {
      label: 'Net Payables', value: fmtCr(bs.liabilities),
      icon: CreditCard, color: 'red',
      trend: 'Creditors + tax', dir: 'down'
    },
  ]

  return (
    <div className="page-enter">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Good morning, Acme Corp 👋</h1>
          <p className="page-subtitle">Financial snapshot for FY 2024-25 · March 2024</p>
        </div>
        <div className="page-actions">
          <button className="btn btn-secondary">
            <Activity size={15} /> Export PDF
          </button>
          <button className="btn btn-primary" onClick={() => setShowModal(true)}>
            + New Entry
          </button>
        </div>
      </div>

      {/* Alerts */}
      {alerts.length > 0 && (
        <div className="alerts-stack">
          {alerts.map((alert, i) => (
            <div key={i} className={`alert-banner ${alert.type}`}>
              {alert.type === 'warning' && <AlertTriangle size={15} />}
              {alert.type === 'info'    && <Info size={15} />}
              {alert.type === 'success' && <CheckCircle size={15} />}
              <span className="alert-msg">{alert.message}</span>
              {alert.action && (
                <button className="alert-action">
                  {alert.action} <ArrowRight size={12} />
                </button>
              )}
              <button className="alert-dismiss" onClick={() => setAlerts(a => a.filter((_, j) => j !== i))}>
                <X size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* KPI Cards */}
      <div className="kpi-grid">
        {kpis.map(kpi => (
          <div key={kpi.label} className={`kpi-card ${kpi.color}`}>
            <div className={`kpi-icon ${kpi.color}`}>
              <kpi.icon size={18} />
            </div>
            <div className="kpi-label">{kpi.label}</div>
            <div className="kpi-value">{kpi.value}</div>
            <span className={`kpi-trend ${kpi.dir}`}>
              {kpi.dir === 'up' ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
              {kpi.trend}
            </span>
          </div>
        ))}
      </div>

      {/* Charts Row */}
      <div className="grid-2" style={{ marginBottom: 24 }}>
        {/* Cash Flow */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">Cash Flow — Last 6 Months</span>
            <span className="badge badge-blue">Monthly</span>
          </div>
          <div className="card-body" style={{ paddingTop: 8 }}>
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={data.cashflow} margin={{ top: 8, right: 8, left: -10, bottom: 0 }}>
                <defs>
                  <linearGradient id="gInflow" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#4F46E5" stopOpacity={0.18} />
                    <stop offset="95%" stopColor="#4F46E5" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gOutflow" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#DC2626" stopOpacity={0.12} />
                    <stop offset="95%" stopColor="#DC2626" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: 'var(--text-3)', fontFamily: 'Figtree' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: 'var(--text-3)', fontFamily: 'Figtree' }} axisLine={false} tickLine={false} tickFormatter={v => `₹${(v / 100000).toFixed(0)}L`} />
                <Tooltip content={<CustomTooltip />} />
                <Legend wrapperStyle={{ fontSize: '0.78rem', paddingTop: 12, fontFamily: 'Figtree' }} />
                <Area type="monotone" dataKey="inflow"  stroke="#4F46E5" strokeWidth={2.5} fill="url(#gInflow)"  name="inflow" />
                <Area type="monotone" dataKey="outflow" stroke="#DC2626" strokeWidth={2}   fill="url(#gOutflow)" name="outflow" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Monthly Comparison Bar */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">Revenue vs Expenses</span>
            <span className="badge badge-green">FY 2024-25</span>
          </div>
          <div className="card-body" style={{ paddingTop: 8 }}>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={data.cashflow} margin={{ top: 8, right: 8, left: -10, bottom: 0 }} barSize={12}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: 'var(--text-3)', fontFamily: 'Figtree' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: 'var(--text-3)', fontFamily: 'Figtree' }} axisLine={false} tickLine={false} tickFormatter={v => `₹${(v / 100000).toFixed(0)}L`} />
                <Tooltip content={<CustomTooltip />} />
                <Legend wrapperStyle={{ fontSize: '0.78rem', paddingTop: 12, fontFamily: 'Figtree' }} />
                <Bar dataKey="inflow"  fill="#4F46E5" radius={[4, 4, 0, 0]} name="revenue" />
                <Bar dataKey="outflow" fill="#E2E8F0" radius={[4, 4, 0, 0]} name="expenses" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Bottom Row: AI Insights + Recent Transactions */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 20, marginBottom: 24 }}>
        {/* AI Insights Panel */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* AI Card */}
          <div className="ai-card">
            <div className="ai-icon">
              <Zap size={18} color="var(--primary)" />
            </div>
            <div>
              <div className="ai-label">AI Insight</div>
              <div className="ai-text">94 transactions auto-classified today with 98% accuracy</div>
              <div className="ai-meta">Rule-based + fuzzy matching engine</div>
            </div>
          </div>

          {/* Balance Summary */}
          <div className="card">
            <div className="card-header">
              <span className="card-title">Balance Sheet</span>
            </div>
            <div className="card-body" style={{ paddingTop: 14 }}>
              {[
                { label: 'Assets', value: bs.assets, color: 'var(--primary)' },
                { label: 'Liabilities', value: bs.liabilities, color: 'var(--danger)' },
                { label: 'Equity', value: bs.equity, color: 'var(--success)' },
              ].map(row => (
                <div key={row.label} style={{ marginBottom: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-2)', fontWeight: 500 }}>{row.label}</span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.82rem', fontWeight: 600, color: 'var(--text)' }}>
                      {fmtCr(row.value)}
                    </span>
                  </div>
                  <div className="progress-wrap">
                    <div className="progress-fill" style={{
                      width: `${(row.value / bs.assets) * 100}%`,
                      background: row.color
                    }} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Reconciliation status */}
          <div className="card">
            <div className="card-header">
              <span className="card-title">Reconciliation</span>
              <span className="badge badge-amber">12 pending</span>
            </div>
            <div className="card-body" style={{ paddingTop: 14 }}>
              <div style={{ marginBottom: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-2)' }}>Auto-matched</span>
                  <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--success)' }}>71%</span>
                </div>
                <div className="progress-wrap">
                  <div className="progress-fill" style={{ width: '71%', background: 'var(--success)' }} />
                </div>
              </div>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-2)' }}>Needs review</span>
                  <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--warning)' }}>29%</span>
                </div>
                <div className="progress-wrap">
                  <div className="progress-fill" style={{ width: '29%', background: 'var(--warning)' }} />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Recent Transactions */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column' }}>
          <div className="card-header" style={{ paddingBottom: 14 }}>
            <span className="card-title">Recent Transactions</span>
            <button className="btn btn-ghost btn-sm">
              View all <ArrowRight size={13} />
            </button>
          </div>
          <div style={{ borderTop: '1px solid var(--border)' }}>
            <table className="tbl">
              <thead>
                <tr>
                  <th>Voucher No.</th>
                  <th>Narration</th>
                  <th>Type</th>
                  <th>Date</th>
                  <th style={{ textAlign: 'right' }}>Amount</th>
                </tr>
              </thead>
              <tbody>
                {data.recentVouchers.map(v => (
                  <tr key={v.id}>
                    <td>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: 'var(--primary)', fontWeight: 600 }}>
                        {v.voucher_no}
                      </span>
                    </td>
                    <td style={{ maxWidth: 240 }}>
                      <span style={{ fontSize: '0.85rem', color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block' }}>
                        {v.narration}
                      </span>
                    </td>
                    <td>
                      <span className={`badge ${voucherBadge[v.voucher_type] || 'badge-gray'}`} style={{ textTransform: 'capitalize' }}>
                        {v.voucher_type}
                      </span>
                    </td>
                    <td style={{ color: 'var(--text-3)', fontSize: '0.8rem' }}>
                      {fmtDate(v.date)}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <span className={v.voucher_type === 'sales' || v.voucher_type === 'receipt' ? 'amt-cr' : 'amt-dr'}>
                        ₹{fmt(v.amount)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* New Entry Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">New Journal Entry</span>
              <button className="icon-btn" onClick={() => setShowModal(false)}><X size={18} /></button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">Voucher Type</label>
                <select className="input select">
                  <option>Sales Invoice</option>
                  <option>Purchase Invoice</option>
                  <option>Payment</option>
                  <option>Receipt</option>
                  <option>Journal</option>
                </select>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Date</label>
                  <input type="date" className="input" defaultValue="2024-03-28" />
                </div>
                <div className="form-group">
                  <label className="form-label">Reference No.</label>
                  <input type="text" className="input" placeholder="e.g. INV-001" />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Narration</label>
                <input type="text" className="input" placeholder="Description of transaction" />
              </div>
              <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
                <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setShowModal(false)}>
                  Cancel
                </button>
                <button className="btn btn-primary" style={{ flex: 2 }} onClick={() => setShowModal(false)}>
                  Create Entry
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
