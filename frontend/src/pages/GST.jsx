// src/pages/GST.jsx — FIXED: real data from companyStore (no mock)
import { useState } from 'react'
import { FileText, Download, AlertTriangle } from 'lucide-react'
import { loadCompanyData } from '../api/companyStore'
import { useAuth } from '../context/AuthContext'
import { fmt, fmtCr } from '../utils/format'

export default function GST() {
  const { activeCompany } = useAuth()
  const [tab, setTab] = useState('gstr1')

  const companyData = loadCompanyData(activeCompany?.id)
  const gst = companyData.gst

  // Calculate GST from real vouchers
  const vouchers = companyData.vouchers || []
  const salesVouchers = vouchers.filter(v => v.voucher_type === 'sales' || v.voucher_type === 'receipt')
  const purchaseVouchers = vouchers.filter(v => v.voucher_type === 'purchase' || v.voucher_type === 'payment')

  const outputTaxable = salesVouchers.reduce((s, v) => s + Number(v.amount || 0), 0)
  const outputCGST = salesVouchers.reduce((s, v) => s + Number(v.cgst || 0), 0)
  const outputSGST = salesVouchers.reduce((s, v) => s + Number(v.sgst || 0), 0)
  const outputIGST = salesVouchers.reduce((s, v) => s + Number(v.igst || 0), 0)

  const inputTaxable = purchaseVouchers.reduce((s, v) => s + Number(v.amount || 0), 0)
  const inputCGST = purchaseVouchers.reduce((s, v) => s + Number(v.cgst || 0), 0)
  const inputSGST = purchaseVouchers.reduce((s, v) => s + Number(v.sgst || 0), 0)
  const inputIGST = purchaseVouchers.reduce((s, v) => s + Number(v.igst || 0), 0)

  const netCGST = Math.max(0, outputCGST - inputCGST)
  const netSGST = Math.max(0, outputSGST - inputSGST)
  const netIGST = Math.max(0, outputIGST - inputIGST)
  const netTotal = netCGST + netSGST + netIGST

  // Build B2B invoice list from sales vouchers
  const b2bInvoices = salesVouchers.map(v => ({
    invoice_no: v.voucher_no || v.reference || '-',
    party:      v.party || v.narration || '-',
    gstin:      v.gstin || '-',
    taxable:    Number(v.amount || 0),
    cgst:       Number(v.cgst || 0),
    sgst:       Number(v.sgst || 0),
    igst:       Number(v.igst || 0),
    total:      Number(v.amount || 0) + Number(v.cgst || 0) + Number(v.sgst || 0) + Number(v.igst || 0),
  }))

  const isEmpty = vouchers.length === 0

  const gstMetrics = [
    { label:'Output Tax (CGST)',  value:fmt(outputCGST),           sub:`Taxable: ${fmtCr(outputTaxable)}`, color:'blue' },
    { label:'Output Tax (SGST)',  value:fmt(outputSGST),           sub:`${salesVouchers.length} invoices`,  color:'purple' },
    { label:'Input Credit (ITC)', value:fmt(inputCGST + inputSGST),sub:'Eligible ITC',                     color:'green' },
    { label:'Net Tax Payable',    value:fmt(netTotal),             sub:'CGST + SGST + IGST',               color:'red' },
  ]

  return (
    <div className="page-enter">
      <div className="page-header">
        <div>
          <h1 className="page-title">GST Reports</h1>
          <p className="page-subtitle">GSTR-1, GSTR-3B generation and compliance tracking</p>
        </div>
        <div className="page-actions">
          <button className="btn btn-secondary"><Download size={15}/> Export JSON</button>
          <button className="btn btn-primary"><FileText size={15}/> File Return</button>
        </div>
      </div>

      {isEmpty && (
        <div style={{ padding:'16px 20px', background:'#FFFBEB', border:'1px solid #FDE68A', borderRadius:10, marginBottom:20, display:'flex', gap:10, alignItems:'center', fontSize:13, color:'#92400E' }}>
          <AlertTriangle size={16}/>
          <span>No vouchers posted yet. Post sales and purchase invoices in the Journal to see GST data here.</span>
        </div>
      )}

      <div className="kpi-grid" style={{ marginBottom:24 }}>
        {gstMetrics.map(m => (
          <div key={m.label} className={`kpi-card ${m.color}`}>
            <div className="kpi-label">{m.label}</div>
            <div className="kpi-value" style={{ fontSize:'1.5rem' }}>₹{m.value}</div>
            <div style={{ fontSize:'0.75rem', color:'var(--text-3)', marginTop:4 }}>{m.sub}</div>
          </div>
        ))}
      </div>

      <div style={{ display:'flex', gap:4, marginBottom:20, background:'var(--surface)', border:'1px solid var(--border)', borderRadius:'var(--radius)', padding:4, width:'fit-content' }}>
        {[{ key:'gstr1', label:'GSTR-1' }, { key:'gstr3b', label:'GSTR-3B' }, { key:'itc', label:'Input Tax Credit' }].map(t => (
          <button key={t.key} className={tab===t.key?'btn btn-primary btn-sm':'btn btn-ghost btn-sm'} onClick={()=>setTab(t.key)}>{t.label}</button>
        ))}
      </div>

      <div className="grid-2" style={{ gap:20 }}>
        <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
          <div className="card">
            <div className="card-header"><span className="card-title">Output Tax Summary</span><span className="badge badge-blue">{activeCompany?.fy}</span></div>
            <div className="card-body">
              {[
                { label:'Taxable Turnover', value:fmt(outputTaxable) },
                { label:'CGST Collected',   value:fmt(outputCGST),  color:'var(--primary)' },
                { label:'SGST Collected',   value:fmt(outputSGST),  color:'#7C3AED' },
                { label:'IGST Collected',   value:fmt(outputIGST),  color:'var(--info)' },
              ].map(row => (
                <div key={row.label} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'10px 0', borderBottom:'1px solid var(--border)' }}>
                  <span style={{ fontSize:'0.85rem', color:'var(--text-2)' }}>{row.label}</span>
                  <span style={{ fontFamily:'var(--font-mono)', fontSize:'0.9rem', fontWeight:700, color:row.color||'var(--text)' }}>₹{row.value}</span>
                </div>
              ))}
              <div style={{ display:'flex', justifyContent:'space-between', paddingTop:12 }}>
                <span style={{ fontWeight:700, fontSize:'0.9rem' }}>Total Output Tax</span>
                <span style={{ fontFamily:'var(--font-mono)', fontWeight:800, fontSize:'1rem' }}>₹{fmt(outputCGST+outputSGST+outputIGST)}</span>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-header"><span className="card-title">Input Tax Credit (ITC)</span><span className="badge badge-green">Eligible</span></div>
            <div className="card-body">
              {[
                { label:'CGST Input', value:fmt(inputCGST) },
                { label:'SGST Input', value:fmt(inputSGST) },
                { label:'IGST Input', value:fmt(inputIGST) },
              ].map(row => (
                <div key={row.label} style={{ display:'flex', justifyContent:'space-between', padding:'10px 0', borderBottom:'1px solid var(--border)' }}>
                  <span style={{ fontSize:'0.85rem', color:'var(--text-2)' }}>{row.label}</span>
                  <span className="amt-cr">₹{row.value}</span>
                </div>
              ))}
              <div style={{ display:'flex', justifyContent:'space-between', paddingTop:12 }}>
                <span style={{ fontWeight:700, fontSize:'0.9rem' }}>Total ITC</span>
                <span className="amt-cr" style={{ fontSize:'1rem', fontWeight:800 }}>₹{fmt(inputCGST+inputSGST+inputIGST)}</span>
              </div>
            </div>
          </div>

          <div className="card" style={{ border:'2px solid var(--danger-light)', background:'#FFF7F7' }}>
            <div className="card-body">
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
                <span style={{ fontFamily:'var(--font-display)', fontSize:'1rem', fontWeight:700 }}>Net Tax Payable</span>
                <AlertTriangle size={16} color="var(--danger)"/>
              </div>
              {[
                { label:'CGST Payable', value:fmt(netCGST) },
                { label:'SGST Payable', value:fmt(netSGST) },
                { label:'IGST Payable', value:fmt(netIGST) },
              ].map(row => (
                <div key={row.label} style={{ display:'flex', justifyContent:'space-between', marginBottom:6 }}>
                  <span style={{ fontSize:'0.83rem', color:'var(--text-2)' }}>{row.label}</span>
                  <span className="amt-dr">₹{row.value}</span>
                </div>
              ))}
              <div style={{ height:1, background:'#FCA5A5', margin:'10px 0' }}/>
              <div style={{ display:'flex', justifyContent:'space-between' }}>
                <span style={{ fontWeight:700 }}>Total</span>
                <span className="amt-dr" style={{ fontSize:'1.1rem', fontWeight:800 }}>₹{fmt(netTotal)}</span>
              </div>
              <button className="btn btn-danger" style={{ width:'100%', justifyContent:'center', marginTop:14 }}>Pay via GST Portal</button>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-header" style={{ paddingBottom:14 }}>
            <span className="card-title">B2B Invoices — {activeCompany?.fy}</span>
            <span className="badge badge-gray">{b2bInvoices.length} invoices</span>
          </div>
          <div style={{ borderTop:'1px solid var(--border)' }}>
            {b2bInvoices.length === 0 ? (
              <div style={{ padding:'48px 0', textAlign:'center', color:'var(--text-3)' }}>
                <div style={{ fontSize:'2rem', marginBottom:8 }}>📋</div>
                <div style={{ fontSize:13 }}>No sales invoices yet</div>
                <div style={{ fontSize:12, color:'var(--text-4)', marginTop:4 }}>Post sales vouchers in Journal to populate GSTR-1</div>
              </div>
            ) : (
              <table className="tbl">
                <thead><tr><th>Invoice No.</th><th>Party</th><th style={{ textAlign:'right' }}>Taxable</th><th style={{ textAlign:'right' }}>CGST</th><th style={{ textAlign:'right' }}>SGST</th><th style={{ textAlign:'right' }}>Total</th></tr></thead>
                <tbody>
                  {b2bInvoices.map((t, i) => (
                    <tr key={i}>
                      <td><span style={{ fontFamily:'var(--font-mono)', fontSize:'0.8rem', color:'var(--primary)', fontWeight:600 }}>{t.invoice_no}</span></td>
                      <td style={{ maxWidth:160 }}><span style={{ display:'block', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', fontSize:'0.85rem' }}>{t.party}</span></td>
                      <td style={{ textAlign:'right' }}><span className="amt-neutral">₹{fmt(t.taxable)}</span></td>
                      <td style={{ textAlign:'right' }}><span className="amt-neutral">₹{fmt(t.cgst)}</span></td>
                      <td style={{ textAlign:'right' }}><span className="amt-neutral">₹{fmt(t.sgst)}</span></td>
                      <td style={{ textAlign:'right' }}><span style={{ fontFamily:'var(--font-mono)', fontWeight:700 }}>₹{fmt(t.total)}</span></td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ background:'var(--surface-2)' }}>
                    <td colSpan={2} style={{ padding:'12px 16px', fontWeight:700, fontSize:'0.85rem' }}>Total</td>
                    <td style={{ textAlign:'right', padding:'12px 16px', fontFamily:'var(--font-mono)', fontWeight:700 }}>₹{fmt(b2bInvoices.reduce((s,t)=>s+t.taxable,0))}</td>
                    <td style={{ textAlign:'right', padding:'12px 16px', fontFamily:'var(--font-mono)', fontWeight:700 }}>₹{fmt(b2bInvoices.reduce((s,t)=>s+t.cgst,0))}</td>
                    <td style={{ textAlign:'right', padding:'12px 16px', fontFamily:'var(--font-mono)', fontWeight:700 }}>₹{fmt(b2bInvoices.reduce((s,t)=>s+t.sgst,0))}</td>
                    <td style={{ textAlign:'right', padding:'12px 16px', fontFamily:'var(--font-mono)', fontWeight:800, color:'var(--primary)' }}>₹{fmt(b2bInvoices.reduce((s,t)=>s+t.total,0))}</td>
                  </tr>
                </tfoot>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
