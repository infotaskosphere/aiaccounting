// src/pages/GST.jsx
import { useState } from 'react'
import { FileText, Download, CheckCircle, Clock, AlertTriangle, ChevronDown } from 'lucide-react'
import { mockGSTSummary } from '../api/mockData'
import { fmt, fmtCr } from '../utils/format'

const PERIODS = ['March 2024', 'February 2024', 'January 2024', 'December 2023']

export default function GST() {
  const [period, setPeriod]   = useState('March 2024')
  const [tab, setTab]         = useState('gstr1')
  const gst = mockGSTSummary

  const gstMetrics = [
    { label: 'Output Tax (CGST)',  value: fmt(gst.output.cgst),   sub: `Taxable: ${fmtCr(gst.output.taxable)}`,  color: 'blue' },
    { label: 'Output Tax (SGST)',  value: fmt(gst.output.sgst),   sub: `${gst.b2b_count} B2B + ${gst.b2c_count} B2C invoices`, color: 'purple' },
    { label: 'Input Credit (ITC)', value: fmt(gst.input.cgst + gst.input.sgst), sub: 'Eligible ITC', color: 'green' },
    { label: 'Net Tax Payable',    value: fmt(gst.net_payable.total), sub: 'CGST + SGST', color: 'red' },
  ]

  return (
    <div className="page-enter">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">GST Reports</h1>
          <p className="page-subtitle">GSTR-1, GSTR-3B generation and compliance tracking</p>
        </div>
        <div className="page-actions">
          <div style={{ position: 'relative' }}>
            <select
              className="input select"
              style={{ minWidth: 160 }}
              value={period}
              onChange={e => setPeriod(e.target.value)}
            >
              {PERIODS.map(p => <option key={p}>{p}</option>)}
            </select>
          </div>
          <button className="btn btn-secondary"><Download size={15} /> Export JSON</button>
          <button className="btn btn-primary"><FileText size={15} /> File Return</button>
        </div>
      </div>

      {/* Filing Status Banner */}
      <div className="alert-banner warning" style={{ marginBottom: 20 }}>
        <Clock size={15} />
        <span className="alert-msg">GSTR-1 for {period} is due on April 11, 2024 · 7 days remaining</span>
        <button className="alert-action">Prepare Now <FileText size={12} /></button>
      </div>

      {/* KPI Cards */}
      <div className="kpi-grid" style={{ marginBottom: 24 }}>
        {gstMetrics.map(m => (
          <div key={m.label} className={`kpi-card ${m.color}`}>
            <div className="kpi-label">{m.label}</div>
            <div className="kpi-value" style={{ fontSize: '1.5rem' }}>₹{m.value}</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-3)', marginTop: 4 }}>{m.sub}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 4, width: 'fit-content' }}>
        {[
          { key: 'gstr1',  label: 'GSTR-1' },
          { key: 'gstr3b', label: 'GSTR-3B' },
          { key: 'itc',    label: 'Input Tax Credit' },
        ].map(t => (
          <button
            key={t.key}
            className={tab === t.key ? 'btn btn-primary btn-sm' : 'btn btn-ghost btn-sm'}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="grid-2" style={{ gap: 20 }}>
        {/* Left: Summary */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Output tax breakdown */}
          <div className="card">
            <div className="card-header">
              <span className="card-title">Output Tax Summary</span>
              <span className="badge badge-blue">{period}</span>
            </div>
            <div className="card-body">
              {[
                { label: 'Taxable Turnover', value: fmt(gst.output.taxable), mono: true },
                { label: 'CGST Collected',   value: fmt(gst.output.cgst),    color: 'var(--primary)' },
                { label: 'SGST Collected',   value: fmt(gst.output.sgst),    color: '#7C3AED' },
                { label: 'IGST Collected',   value: fmt(gst.output.igst),    color: 'var(--info)' },
              ].map(row => (
                <div key={row.label} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '10px 0', borderBottom: '1px solid var(--border)'
                }}>
                  <span style={{ fontSize: '0.85rem', color: 'var(--text-2)' }}>{row.label}</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.9rem', fontWeight: 700, color: row.color || 'var(--text)' }}>
                    ₹{row.value}
                  </span>
                </div>
              ))}
              <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 12 }}>
                <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>Total Output Tax</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 800, fontSize: '1rem', color: 'var(--text)' }}>
                  ₹{fmt(gst.output.cgst + gst.output.sgst + gst.output.igst)}
                </span>
              </div>
            </div>
          </div>

          {/* ITC Summary */}
          <div className="card">
            <div className="card-header">
              <span className="card-title">Input Tax Credit (ITC)</span>
              <span className="badge badge-green">Eligible</span>
            </div>
            <div className="card-body">
              {[
                { label: 'CGST Input',  value: fmt(gst.input.cgst) },
                { label: 'SGST Input',  value: fmt(gst.input.sgst) },
                { label: 'IGST Input',  value: fmt(gst.input.igst) },
              ].map(row => (
                <div key={row.label} style={{
                  display: 'flex', justifyContent: 'space-between',
                  padding: '10px 0', borderBottom: '1px solid var(--border)'
                }}>
                  <span style={{ fontSize: '0.85rem', color: 'var(--text-2)' }}>{row.label}</span>
                  <span className="amt-cr">₹{row.value}</span>
                </div>
              ))}
              <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 12 }}>
                <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>Total ITC</span>
                <span className="amt-cr" style={{ fontSize: '1rem', fontWeight: 800 }}>
                  ₹{fmt(gst.input.cgst + gst.input.sgst + gst.input.igst)}
                </span>
              </div>
            </div>
          </div>

          {/* Net payable */}
          <div className="card" style={{ border: '2px solid var(--danger-light)', background: '#FFF7F7' }}>
            <div className="card-body">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <span style={{ fontFamily: 'var(--font-display)', fontSize: '1rem', fontWeight: 700 }}>
                  Net Tax Payable
                </span>
                <AlertTriangle size={16} color="var(--danger)" />
              </div>
              {[
                { label: 'CGST Payable', value: fmt(gst.net_payable.cgst) },
                { label: 'SGST Payable', value: fmt(gst.net_payable.sgst) },
              ].map(row => (
                <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ fontSize: '0.83rem', color: 'var(--text-2)' }}>{row.label}</span>
                  <span className="amt-dr">₹{row.value}</span>
                </div>
              ))}
              <div style={{ height: 1, background: '#FCA5A5', margin: '10px 0' }} />
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontWeight: 700 }}>Total</span>
                <span className="amt-dr" style={{ fontSize: '1.1rem', fontWeight: 800 }}>
                  ₹{fmt(gst.net_payable.total)}
                </span>
              </div>
              <button className="btn btn-danger" style={{ width: '100%', justifyContent: 'center', marginTop: 14 }}>
                Pay via GST Portal
              </button>
            </div>
          </div>
        </div>

        {/* Right: Transactions table */}
        <div className="card">
          <div className="card-header" style={{ paddingBottom: 14 }}>
            <span className="card-title">B2B Invoices — {period}</span>
            <span className="badge badge-gray">{gst.transactions.length} invoices</span>
          </div>
          <div style={{ borderTop: '1px solid var(--border)' }}>
            <table className="tbl">
              <thead>
                <tr>
                  <th>Invoice No.</th>
                  <th>Party</th>
                  <th>GSTIN</th>
                  <th style={{ textAlign: 'right' }}>Taxable</th>
                  <th style={{ textAlign: 'right' }}>CGST</th>
                  <th style={{ textAlign: 'right' }}>SGST</th>
                  <th style={{ textAlign: 'right' }}>Total</th>
                </tr>
              </thead>
              <tbody>
                {gst.transactions.map(t => (
                  <tr key={t.invoice_no}>
                    <td>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: 'var(--primary)', fontWeight: 600 }}>
                        {t.invoice_no}
                      </span>
                    </td>
                    <td style={{ maxWidth: 160 }}>
                      <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '0.85rem' }}>
                        {t.party}
                      </span>
                    </td>
                    <td>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--text-3)' }}>
                        {t.gstin}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <span className="amt-neutral">₹{fmt(t.taxable)}</span>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <span className="amt-neutral">₹{fmt(t.cgst)}</span>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <span className="amt-neutral">₹{fmt(t.sgst)}</span>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--text)' }}>
                        ₹{fmt(t.total)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ background: 'var(--surface-2)' }}>
                  <td colSpan={3} style={{ padding: '12px 16px', fontWeight: 700, fontSize: '0.85rem' }}>Total</td>
                  <td style={{ textAlign: 'right', padding: '12px 16px', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>
                    ₹{fmt(gst.transactions.reduce((s, t) => s + t.taxable, 0))}
                  </td>
                  <td style={{ textAlign: 'right', padding: '12px 16px', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>
                    ₹{fmt(gst.transactions.reduce((s, t) => s + t.cgst, 0))}
                  </td>
                  <td style={{ textAlign: 'right', padding: '12px 16px', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>
                    ₹{fmt(gst.transactions.reduce((s, t) => s + t.sgst, 0))}
                  </td>
                  <td style={{ textAlign: 'right', padding: '12px 16px', fontFamily: 'var(--font-mono)', fontWeight: 800, color: 'var(--primary)' }}>
                    ₹{fmt(gst.transactions.reduce((s, t) => s + t.total, 0))}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
