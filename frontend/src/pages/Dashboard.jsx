// ── Dashboard.jsx — real data + full journal entry modal + bulk import + EDITABLE
import { useState, useRef, useCallback } from 'react'
import { useDropzone } from 'react-dropzone'
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts'
import {
  TrendingUp, TrendingDown, DollarSign, CreditCard,
  Wallet, BarChart2, AlertTriangle, Info, CheckCircle,
  ArrowRight, X, Plus, Zap, Activity, FileText,
  IndianRupee, Receipt, Users, RefreshCw, Upload,
  Brain, Trash2, PlusCircle, Table2, Edit2, AlertCircle, Shield, Save
} from 'lucide-react'
import { loadCompanyData, addVoucher, addVouchers, updateVoucher, deleteVoucher, computeFinancials } from '../api/companyStore'
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
  { date:'7th',  label:'TDS Challan Due',   type:'warning', days:3  },
  { date:'11th', label:'GSTR-1 Filing',     type:'danger',  days:7  },
  { date:'20th', label:'GSTR-3B Filing',    type:'warning', days:16 },
  { date:'15th', label:'PF / ESIC Payment', type:'info',    days:11 },
  { date:'30th', label:'Advance Tax (Q1)',  type:'info',    days:26 },
]

const QUICK_ACTIONS = [
  { icon:FileText,    label:'New Invoice',    color:'#2563EB', bg:'#EFF6FF', type:'sales'    },
  { icon:Receipt,     label:'Record Expense', color:'#D97706', bg:'#FFFBEB', type:'purchase' },
  { icon:IndianRupee, label:'Receive Payment',color:'#15803D', bg:'#F0FDF4', type:'receipt'  },
  { icon:Users,       label:'Run Payroll',    color:'#7C3AED', bg:'#F5F3FF', type:'payment'  },
  { icon:BarChart2,   label:'GST Return',     color:'#0369A1', bg:'#F0F9FF', type:'journal'  },
  { icon:RefreshCw,   label:'Reconcile Bank', color:'#BE185D', bg:'#FDF2F8', type:'journal'  },
]

const EMPTY_ROW = () => ({
  id: Date.now() + Math.random(),
  type:'sales', date:new Date().toISOString().slice(0,10),
  reference:'', party:'', narration:'', amount:'', cgst:'', sgst:'', igst:'',
})

function downloadCSVTemplate() {
  const headers = 'type,date,reference,party,narration,amount,cgst,sgst,igst'
  const sample  = [
    'sales,2025-04-01,INV-001,ABC Corp,Software services,50000,4500,4500,0',
    'purchase,2025-04-02,PUR-001,XYZ Suppliers,Office supplies,10000,900,900,0',
    'receipt,2025-04-03,RCP-001,ABC Corp,Payment received,59000,0,0,0',
    'payment,2025-04-05,PAY-001,XYZ Suppliers,Payment made,11800,0,0,0',
  ].join('\n')
  const blob = new Blob([headers + '\n' + sample], { type:'text/csv' })
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob)
  a.download = 'voucher_import_template.csv'; a.click()
  toast.success('Template downloaded')
}

function parseCSV(text) {
  const lines = text.trim().split('\n').filter(Boolean)
  if (lines.length < 2) throw new Error('CSV must have a header row and at least one data row')
  const headers = lines[0].split(',').map(h => h.trim().toLowerCase())
  return lines.slice(1).map((line, i) => {
    const vals = line.split(',').map(v => v.trim().replace(/^"|"$/g,''))
    const row = {}
    headers.forEach((h, idx) => { row[h] = vals[idx] || '' })
    const amount = parseFloat(row.amount)
    if (!amount || isNaN(amount)) throw new Error(`Row ${i+2}: invalid amount "${row.amount}"`)
    const validTypes = ['sales','purchase','receipt','payment','journal','contra']
    if (row.type && !validTypes.includes(row.type)) throw new Error(`Row ${i+2}: invalid type "${row.type}"`)
    return {
      voucher_type: row.type || 'journal',
      date:         row.date || new Date().toISOString().slice(0,10),
      reference:    row.reference || '',
      party:        row.party || '',
      narration:    row.narration || 'Imported entry',
      amount:       amount,
      cgst:         parseFloat(row.cgst) || 0,
      sgst:         parseFloat(row.sgst) || 0,
      igst:         parseFloat(row.igst) || 0,
    }
  })
}

async function loadSheetJS() {
  if (window.XLSX) return window.XLSX
  return new Promise((res, rej) => {
    const s = document.createElement('script')
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js'
    s.onload = () => res(window.XLSX); s.onerror = rej
    document.head.appendChild(s)
  })
}

// ── Robust date parser for XLS cells ──────────────────────────────────────
// SheetJS with cellDates:true returns JS Date objects; without it returns
// serial numbers or strings. We handle ALL three cases.
function parseDate_xls(raw) {
  if (!raw && raw !== 0) return null

  // Case 1: JS Date object (cellDates:true)
  if (raw instanceof Date && !isNaN(raw)) {
    const y = raw.getFullYear()
    const m = String(raw.getMonth()+1).padStart(2,'0')
    const d = String(raw.getDate()).padStart(2,'0')
    return `${y}-${m}-${d}`
  }

  // Case 2: Excel serial number (days since 1900-01-01)
  if (typeof raw === 'number' && raw > 40000 && raw < 60000) {
    const d = new Date((raw - 25569) * 86400 * 1000)
    const y = d.getUTCFullYear()
    const mo = String(d.getUTCMonth()+1).padStart(2,'0')
    const dy = String(d.getUTCDate()).padStart(2,'0')
    return `${y}-${mo}-${dy}`
  }

  // Case 3: String — various DD/MM/YYYY formats
  const s = String(raw).trim()
  if (!s) return null

  // DD/MM/YYYY or DD-MM-YYYY
  const m1 = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/)
  if (m1) return `${m1[3]}-${m1[2].padStart(2,'0')}-${m1[1].padStart(2,'0')}`

  // YYYY-MM-DD already ISO
  if (s.match(/^\d{4}-\d{2}-\d{2}$/)) return s

  // Try native parse as last resort
  const d = new Date(s)
  if (!isNaN(d)) {
    return d.toISOString().slice(0,10)
  }
  return null
}

// ── Parse GST string like "6300.00(18.0%)" → 6300 ────────────────────────
function parseGSTCell(raw) {
  if (!raw) return 0
  const s = String(raw)
  // "6300.00(18.0%)" → extract first number
  const m = s.match(/^([\d,]+\.?\d*)/)
  if (m) return parseFloat(m[1].replace(/,/g,'')) || 0
  return parseFloat(s.replace(/[₹,\s]/g,'')) || 0
}

// ── Main XLS parser: handles Finix Sale Report & Tally exports ────────────
async function parseXLSFile(file, voucherType) {
  const XLSX = await loadSheetJS()
  const buf  = await file.arrayBuffer()

  // Use cellDates:false to get raw serial numbers + strings (more predictable)
  const wb = XLSX.read(new Uint8Array(buf), { type: 'array', cellDates: false, raw: false })

  // ── Find the best sheet ──────────────────────────────────────────────────
  // Prefer invoice-level summary sheets (Sale Report, Purchase Report) over
  // line-item sheets (Sale Items, Purchase Items) to avoid double-counting
  // multi-item invoices and to correctly capture invoice-level totals.
  let ws = null
  let wsName = ''

  // Score each sheet: higher = more likely to be the right invoice-level sheet
  const scoreSheet = (name, candidate) => {
    const text = XLSX.utils.sheet_to_csv(candidate).toLowerCase()
    if (!(/date/.test(text) && /(amount|total|invoice)/.test(text))) return -1
    let score = 1
    // Prefer sheets named like "Sale Report" / "Purchase Report" (summary level)
    if (/report/i.test(name)) score += 10
    // Penalise line-item sheets that have item/product columns
    if (/item/i.test(name)) score -= 5
    if (/quantity|qty|unit price|price\/unit/i.test(text)) score -= 3
    // Bonus for having transaction type / payment status columns (Finix-style)
    if (/transaction type|payment status/i.test(text)) score += 5
    return score
  }

  let bestScore = -Infinity
  for (const name of wb.SheetNames) {
    const candidate = wb.Sheets[name]
    const score = scoreSheet(name, candidate)
    if (score > bestScore) { bestScore = score; ws = candidate; wsName = name }
  }
  if (!ws) ws = wb.Sheets[wb.SheetNames[0]]

  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: false })

  // ── 1. Find header row (scan up to row 15) ───────────────────────────────
  let headerIdx = -1
  for (let i = 0; i < Math.min(15, rows.length); i++) {
    const row = rows[i].map(c => String(c).toLowerCase().trim())
    const hasDate   = row.some(c => c === 'date' || c.endsWith('date'))
    const hasParty  = row.some(c => c.includes('party') || c.includes('customer') || c.includes('vendor'))
    const hasAmount = row.some(c => c.includes('amount') || c.includes('total'))
    if (hasDate && (hasParty || hasAmount)) { headerIdx = i; break }
  }
  if (headerIdx === -1) throw new Error('Could not detect header row. Expected columns: Date, Party Name, Invoice No, Amount.')

  const headers = rows[headerIdx].map(c => String(c).toLowerCase().trim())
  const col = (keys) => keys.reduce((f, k) => f !== -1 ? f : headers.findIndex(h => h.includes(k)), -1)

  const cols = {
    date:    col(['date']),
    party:   col(['party name','party','customer name','customer','vendor','supplier']),
    invoice: col(['invoice no','invoice no.','invoice','voucher no','order no']),
    amount:  col(['total amount','amount','total']),
    cgst:    col(['cgst']),
    sgst:    col(['sgst']),
    igst:    col(['igst']),
    gst:     col(['gst']),      // single GST column (like in Sale Items sheet)
    type:    col(['transaction type','type']),
    status:  col(['payment status','status']),
    narr:    col(['description','narration','remarks','particulars']),
  }

  const g    = (row, c) => c !== -1 && c < row.length ? String(row[c] ?? '').trim() : ''
  const pAmt = s => {
    if (!s) return 0
    // Remove currency symbols, commas, spaces
    const n = parseFloat(String(s).replace(/[₹,\s]/g, ''))
    return isFinite(n) ? Math.abs(n) : 0
  }

  // ── 2. Detect summary / footer rows ──────────────────────────────────────
  const isSummaryRow = (r) => {
    const dateCell  = g(r, cols.date).toLowerCase()
    const partyCell = cols.party  !== -1 ? g(r, cols.party).toLowerCase()  : ''
    const invCell   = cols.invoice !== -1 ? g(r, cols.invoice).toLowerCase() : ''

    if (!dateCell || /^(total|grand|subtotal|sum|balance|net|closing)/.test(dateCell)) return true
    const allCells = r.map(c => String(c).toLowerCase().trim())
    if (allCells.some(c => /^(total|grand total|sub.?total)$/.test(c)) && !partyCell && !invCell) return true
    return false
  }

  // ── 3. Detect cancelled rows ──────────────────────────────────────────────
  const isCancelled = (r) => {
    const typeCell   = g(r, cols.type).toLowerCase()
    const statusCell = g(r, cols.status).toLowerCase()
    return typeCell.includes('cancel') || statusCell.includes('cancel')
  }

  // ── 4. Detect Credit Note rows — these are RETURNS/REVERSALS, not sales ──
  // Credit notes reduce receivables; they must NOT be added as positive sales.
  // We import them as 'journal' with negative amount so totals stay correct.
  const isCreditNote = (r) => {
    const typeCell = g(r, cols.type).toLowerCase()
    return typeCell.includes('credit note') || typeCell.includes('credit memo')
  }

  // ── 5. Parse data rows ────────────────────────────────────────────────────
  const parsed = rows
    .slice(headerIdx + 1)
    .filter(r => r.some(c => c !== ''))
    .filter(r => !isSummaryRow(r))
    .filter(r => !isCancelled(r))
    .map(r => {
      const rawDate = cols.date !== -1 ? r[cols.date] : ''
      const parsedDate = parseDate_xls(rawDate)
      const creditNote = isCreditNote(r)

      // GST: try dedicated columns first, then single 'gst' column
      let cgst = 0, sgst = 0, igst = 0
      if (cols.cgst !== -1 || cols.sgst !== -1 || cols.igst !== -1) {
        cgst = parseGSTCell(g(r, cols.cgst))
        sgst = parseGSTCell(g(r, cols.sgst))
        igst = parseGSTCell(g(r, cols.igst))
      } else if (cols.gst !== -1) {
        // Single GST column like "6300.00(18.0%)" — assume IGST if interstate else split
        const totalGst = parseGSTCell(g(r, cols.gst))
        cgst = totalGst / 2
        sgst = totalGst / 2
      }

      // For credit notes the GST is also reversed — negate it
      if (creditNote) { cgst = -cgst; sgst = -sgst; igst = -igst }

      return {
        date:       parsedDate,
        party:      g(r, cols.party),
        invoice:    g(r, cols.invoice),
        // Credit notes are stored with negative amount so they reduce the total
        amount:     creditNote ? -pAmt(g(r, cols.amount)) : pAmt(g(r, cols.amount)),
        cgst, sgst, igst,
        txType:     g(r, cols.type) || voucherType,
        status:     g(r, cols.status),
        narr:       g(r, cols.narr),
        creditNote,
      }
    })
    .filter(r => r.amount !== 0)         // skip zero-amount rows
    .filter(r => r.date !== null)        // skip rows where date couldn't be parsed

  if (parsed.length === 0) throw new Error('No valid transactions found. Check that the file has Date, Party Name, and Amount columns with data.')

  return parsed.map(r => ({
    voucher_type: (() => {
      const t = (r.txType || '').toLowerCase()
      // Credit Notes are journal/reversal entries — never count as sales
      if (r.creditNote)           return 'journal'
      if (t.includes('sale'))     return 'sales'
      if (t.includes('purchase')) return 'purchase'
      if (t.includes('receipt'))  return 'receipt'
      if (t.includes('payment'))  return 'payment'
      return voucherType
    })(),
    date:       r.date,
    reference:  r.invoice,
    party:      r.party,
    narration:  r.narr || `${r.txType || voucherType} - ${r.party}${r.invoice ? ` (${r.invoice})` : ''}`.trim(),
    // Store absolute amount; sign is captured via voucher_type (sales=credit, journal=neutral)
    amount:     Math.abs(r.amount),
    cgst:       Math.abs(r.cgst),
    sgst:       Math.abs(r.sgst),
    igst:       Math.abs(r.igst),
    source:     'xls_import',
    xls_status: r.status,
    // Flag so UI can show "Credit Note" label
    is_credit_note: r.creditNote || false,
  }))
}

// ── Edit Voucher Modal ─────────────────────────────────────────────────────
function EditVoucherModal({ voucher, onClose, companyId, onSaved }) {
  const [form, setForm] = useState({
    voucher_type: voucher.voucher_type || 'sales',
    date: voucher.date || new Date().toISOString().slice(0,10),
    reference: voucher.reference || '',
    party: voucher.party || '',
    narration: voucher.narration || '',
    amount: String(voucher.amount || ''),
    cgst: String(voucher.cgst || ''),
    sgst: String(voucher.sgst || ''),
    igst: String(voucher.igst || ''),
  })
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handleSave = () => {
    if (!form.narration.trim()) return toast.error('Narration is required')
    const amt = parseFloat(form.amount)
    if (!amt || amt <= 0) return toast.error('Enter a valid amount')
    updateVoucher(companyId, voucher.id, {
      ...form,
      amount: amt,
      cgst: parseFloat(form.cgst) || 0,
      sgst: parseFloat(form.sgst) || 0,
      igst: parseFloat(form.igst) || 0,
    })
    toast.success('Voucher updated ✓')
    onSaved()
    onClose()
  }

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth:520, width:'95vw' }} onClick={e=>e.stopPropagation()}>
        <div className="modal-head">
          <span className="modal-title">Edit Voucher — {voucher.voucher_no}</span>
          <button className="btn btn-ghost btn-icon" onClick={onClose}><X size={17}/></button>
        </div>
        <div className="modal-body" style={{ display:'flex', flexDirection:'column', gap:12 }}>
          <div className="field-group">
            <label className="field-label">Voucher Type</label>
            <select className="input" value={form.voucher_type} onChange={e=>set('voucher_type',e.target.value)}>
              <option value="sales">Sales Invoice</option>
              <option value="purchase">Purchase Invoice</option>
              <option value="receipt">Receipt Voucher</option>
              <option value="payment">Payment Voucher</option>
              <option value="journal">Journal Voucher</option>
              <option value="contra">Contra</option>
            </select>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
            <div className="field-group">
              <label className="field-label">Date</label>
              <input type="date" className="input" value={form.date} onChange={e=>set('date',e.target.value)}/>
            </div>
            <div className="field-group">
              <label className="field-label">Reference No.</label>
              <input type="text" className="input" value={form.reference} onChange={e=>set('reference',e.target.value)}/>
            </div>
          </div>
          <div className="field-group">
            <label className="field-label">Party / Customer</label>
            <input type="text" className="input" value={form.party} onChange={e=>set('party',e.target.value)}/>
          </div>
          <div className="field-group">
            <label className="field-label">Narration *</label>
            <input type="text" className="input" value={form.narration} onChange={e=>set('narration',e.target.value)}/>
          </div>
          <div className="field-group">
            <label className="field-label">Taxable Amount (₹) *</label>
            <input type="number" className="input" value={form.amount} onChange={e=>set('amount',e.target.value)} min="0" step="0.01"/>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:10 }}>
            <div className="field-group">
              <label className="field-label">CGST (₹)</label>
              <input type="number" className="input" value={form.cgst} onChange={e=>set('cgst',e.target.value)} min="0" step="0.01"/>
            </div>
            <div className="field-group">
              <label className="field-label">SGST (₹)</label>
              <input type="number" className="input" value={form.sgst} onChange={e=>set('sgst',e.target.value)} min="0" step="0.01"/>
            </div>
            <div className="field-group">
              <label className="field-label">IGST (₹)</label>
              <input type="number" className="input" value={form.igst} onChange={e=>set('igst',e.target.value)} min="0" step="0.01"/>
            </div>
          </div>
        </div>
        <div className="modal-foot">
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSave}><Save size={14}/> Save Changes</button>
        </div>
      </div>
    </div>
  )
}

// ── Journal Entry Modal ────────────────────────────────────────────────────
function JournalModal({ onClose, companyId, onPosted, defaultType }) {
  const [tab, setTab] = useState('single')
  const [form, setForm] = useState({
    type: defaultType || 'sales',
    date: new Date().toISOString().slice(0,10),
    reference:'', party:'', narration:'', amount:'', cgst:'', sgst:'', igst:'',
  })
  const [rows, setRows] = useState([EMPTY_ROW()])
  const [aiLoading, setAiLoading] = useState(false)
  const [aiFile, setAiFile] = useState(null)
  const [csvLoading, setCsvLoading] = useState(false)
  const [csvPreview, setCsvPreview] = useState(null)
  const [csvError, setCsvError] = useState('')
  const [xlsLoading,  setXlsLoading]  = useState(false)
  const [xlsPreview,  setXlsPreview]  = useState(null)
  const [xlsError,    setXlsError]    = useState('')
  const [xlsType,     setXlsType]     = useState(defaultType || 'sales')
  const [xlsFile,     setXlsFile]     = useState(null)
  const set = (k,v) => setForm(f => ({...f,[k]:v}))

  const handleSingle = () => {
    if (!form.narration.trim()) return toast.error('Narration is required')
    const amt = parseFloat(form.amount)
    if (!amt || amt <= 0) return toast.error('Enter a valid amount')
    addVoucher(companyId, {
      voucher_type: form.type,
      date: form.date,
      reference: form.reference,
      party: form.party,
      narration: form.narration,
      amount: amt,
      cgst: parseFloat(form.cgst)||0,
      sgst: parseFloat(form.sgst)||0,
      igst: parseFloat(form.igst)||0,
    })
    toast.success('Voucher posted ✓')
    onPosted(); onClose()
  }

  const handleBulkPost = () => {
    const valid = rows.filter(r => r.narration?.trim() && parseFloat(r.amount) > 0)
    if (!valid.length) return toast.error('Fill at least one complete row')
    addVouchers(companyId, valid.map(r => ({
      voucher_type: r.type || 'journal',
      date: r.date,
      reference: r.reference,
      party: r.party,
      narration: r.narration,
      amount: parseFloat(r.amount)||0,
      cgst: parseFloat(r.cgst)||0,
      sgst: parseFloat(r.sgst)||0,
      igst: parseFloat(r.igst)||0,
    })))
    toast.success(`${valid.length} vouchers posted ✓`)
    onPosted(); onClose()
  }

  const handleCSVFile = async (file) => {
    setCsvError(''); setCsvPreview(null)
    if (!file) return
    setCsvLoading(true)
    try {
      const text = await file.text()
      const parsed = parseCSV(text)
      setCsvPreview(parsed)
    } catch (e) { setCsvError(e.message) }
    setCsvLoading(false)
  }

  const handleCSVImport = () => {
    if (!csvPreview?.length) return
    addVouchers(companyId, csvPreview)
    toast.success(`${csvPreview.length} vouchers imported from CSV ✓`)
    onPosted(); onClose()
  }

  const handleXLSFile = async (file) => {
    setXlsError(''); setXlsPreview(null); setXlsFile(file)
    if (!file) return
    setXlsLoading(true)
    try {
      const parsed = await parseXLSFile(file, xlsType)
      if (parsed.length === 0) throw new Error('No valid rows found. Check that Amount column has numeric values.')
      setXlsPreview(parsed)
      toast.success(`Found ${parsed.length} records in ${file.name}`)
    } catch (e) { setXlsError(e.message) }
    setXlsLoading(false)
  }

  const handleXLSImport = () => {
    if (!xlsPreview?.length) return
    addVouchers(companyId, xlsPreview)
    toast.success(`✅ ${xlsPreview.length} vouchers imported from XLS ✓`)
    onPosted(); onClose()
  }

  const handleAIFile = async (file) => {
    if (!file) return
    setAiFile(file); setAiLoading(true)
    try {
      const formData = new FormData(); formData.append('file', file)
      const token = localStorage.getItem('token')
      const res = await fetch('/api/v1/invoice/parse', {
        method:'POST',
        headers: token ? { Authorization:`Bearer ${token}` } : {},
        body: formData,
      })
      if (!res.ok) {
        const e = await res.json().catch(()=>({}))
        throw new Error(e.detail || `Server error ${res.status}`)
      }
      const { data } = await res.json()
      setForm(f => ({
        ...f,
        type:      data.type || f.type,
        date:      data.date || f.date,
        reference: data.reference || f.reference,
        party:     data.party || f.party,
        narration: data.narration || f.narration,
        amount:    data.amount || f.amount,
        cgst:      data.cgst || f.cgst,
        sgst:      data.sgst || f.sgst,
        igst:      data.igst || f.igst,
      }))
      setTab('single')
      toast.success('Invoice parsed! Review and post.')
    } catch (e) {
      toast.error('Parse failed: ' + e.message)
    }
    setAiLoading(false)
  }

  const onDropAI  = useCallback(files => { if (files[0]) handleAIFile(files[0]) }, [])
  const onDropCSV = useCallback(files => { if (files[0]) handleCSVFile(files[0]) }, [])
  const onDropXLS = useCallback(files => { if (files[0]) handleXLSFile(files[0]) }, [xlsType])

  const { getRootProps: aiRootProps,  getInputProps: aiInputProps,  isDragActive: aiDrag  } = useDropzone({ onDrop: onDropAI,  accept: { 'application/pdf':['.pdf'], 'image/*':['.png','.jpg','.jpeg'] } })
  const { getRootProps: csvRootProps, getInputProps: csvInputProps, isDragActive: csvDrag } = useDropzone({ onDrop: onDropCSV, accept: { 'text/csv':['.csv'], 'text/plain':['.txt'] } })
  const { getRootProps: xlsRootProps, getInputProps: xlsInputProps, isDragActive: xlsDrag } = useDropzone({
    onDrop: onDropXLS,
    accept: { 'application/vnd.ms-excel':['.xls'], 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':['.xlsx'], 'text/csv':['.csv'] }
  })

  const GSTSummary = ({ cgst, sgst, igst, amount }) => {
    const c=parseFloat(cgst)||0, s=parseFloat(sgst)||0, g=parseFloat(igst)||0, a=parseFloat(amount)||0
    if (!c && !s && !g) return null
    return (
      <div style={{ padding:'8px 12px', background:'var(--surface-2)', borderRadius:8, fontSize:12, color:'var(--text-2)', marginTop:4 }}>
        Taxable: ₹{fmt(a)} · CGST: ₹{fmt(c)} · SGST: ₹{fmt(s)} · IGST: ₹{fmt(g)} · <strong>Total: ₹{fmt(a+c+s+g)}</strong>
      </div>
    )
  }

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth:680, width:'95vw' }} onClick={e=>e.stopPropagation()}>
        <div className="modal-head">
          <span className="modal-title">New Journal Entry</span>
          <button className="btn btn-ghost btn-icon" onClick={onClose}><X size={17}/></button>
        </div>

        <div style={{ display:'flex', gap:2, padding:'10px 20px 0', background:'var(--surface-2)', borderBottom:'1px solid var(--border)' }}>
          {[
            { key:'single', label:'✏️ Single Entry' },
            { key:'bulk',   label:'📋 Bulk Entry' },
            { key:'csv',    label:'📂 CSV Import' },
            { key:'xls',    label:'📊 XLS Import' },
            { key:'ai',     label:'🤖 AI Invoice' },
          ].map(t => (
            <button key={t.key}
              onClick={()=>setTab(t.key)}
              style={{ padding:'8px 14px', fontSize:'0.82rem', fontWeight:600, border:'none',
                borderRadius:'6px 6px 0 0', cursor:'pointer', background: tab===t.key?'var(--surface)':'transparent',
                color: tab===t.key?'var(--primary)':'var(--text-3)',
                borderBottom: tab===t.key?'2px solid var(--primary)':'2px solid transparent' }}>
              {t.label}
            </button>
          ))}
        </div>

        <div className="modal-body" style={{ maxHeight:'60vh', overflowY:'auto' }}>

          {tab === 'single' && (
            <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
              <div className="field-group">
                <label className="field-label">Voucher Type</label>
                <select className="input" value={form.type} onChange={e=>set('type',e.target.value)}>
                  <option value="sales">Sales Invoice</option>
                  <option value="purchase">Purchase Invoice</option>
                  <option value="receipt">Receipt Voucher</option>
                  <option value="payment">Payment Voucher</option>
                  <option value="journal">Journal Voucher</option>
                  <option value="contra">Contra</option>
                </select>
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                <div className="field-group">
                  <label className="field-label">Date</label>
                  <input type="date" className="input" value={form.date} onChange={e=>set('date',e.target.value)}/>
                </div>
                <div className="field-group">
                  <label className="field-label">Reference No.</label>
                  <input type="text" className="input" placeholder="INV-0001" value={form.reference} onChange={e=>set('reference',e.target.value)}/>
                </div>
              </div>
              <div className="field-group">
                <label className="field-label">Party / Customer / Supplier</label>
                <input type="text" className="input" placeholder="Company or person name" value={form.party} onChange={e=>set('party',e.target.value)}/>
              </div>
              <div className="field-group">
                <label className="field-label">Narration *</label>
                <input type="text" className="input" placeholder="Describe the transaction" value={form.narration} onChange={e=>set('narration',e.target.value)}/>
              </div>
              <div className="field-group">
                <label className="field-label">Taxable Amount (₹) *</label>
                <input type="number" className="input" placeholder="0.00" value={form.amount} onChange={e=>set('amount',e.target.value)} min="0" step="0.01"/>
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:10 }}>
                <div className="field-group">
                  <label className="field-label">CGST (₹)</label>
                  <input type="number" className="input" placeholder="0.00" value={form.cgst} onChange={e=>set('cgst',e.target.value)} min="0" step="0.01"/>
                </div>
                <div className="field-group">
                  <label className="field-label">SGST (₹)</label>
                  <input type="number" className="input" placeholder="0.00" value={form.sgst} onChange={e=>set('sgst',e.target.value)} min="0" step="0.01"/>
                </div>
                <div className="field-group">
                  <label className="field-label">IGST (₹)</label>
                  <input type="number" className="input" placeholder="0.00" value={form.igst} onChange={e=>set('igst',e.target.value)} min="0" step="0.01"/>
                </div>
              </div>
              <GSTSummary {...form}/>
            </div>
          )}

          {tab === 'bulk' && (
            <div>
              <p style={{ fontSize:12, color:'var(--text-3)', marginBottom:12 }}>
                Enter multiple vouchers at once. Rows with no narration/amount are ignored.
              </p>
              <div style={{ overflowX:'auto' }}>
                <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
                  <thead>
                    <tr style={{ background:'var(--surface-2)' }}>
                      {['Type','Date','Party','Narration','Amount','CGST','SGST',''].map(h => (
                        <th key={h} style={{ padding:'6px 8px', textAlign:'left', fontSize:11, fontWeight:700, color:'var(--text-3)', borderBottom:'1px solid var(--border)', whiteSpace:'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, i) => (
                      <tr key={row.id} style={{ borderBottom:'1px solid var(--border)' }}>
                        <td style={{ padding:4 }}>
                          <select value={row.type} onChange={e=>setRows(rs=>rs.map((r,j)=>j===i?{...r,type:e.target.value}:r))}
                            style={{ width:90, height:28, border:'1px solid var(--border)', borderRadius:4, fontSize:11, background:'var(--bg)', color:'var(--text)', padding:'0 4px' }}>
                            <option value="sales">Sales</option><option value="purchase">Purchase</option>
                            <option value="receipt">Receipt</option><option value="payment">Payment</option>
                            <option value="journal">Journal</option>
                          </select>
                        </td>
                        <td style={{ padding:4 }}>
                          <input type="date" value={row.date} onChange={e=>setRows(rs=>rs.map((r,j)=>j===i?{...r,date:e.target.value}:r))}
                            style={{ width:120, height:28, border:'1px solid var(--border)', borderRadius:4, fontSize:11, background:'var(--bg)', color:'var(--text)', padding:'0 4px' }}/>
                        </td>
                        <td style={{ padding:4 }}>
                          <input placeholder="Party" value={row.party} onChange={e=>setRows(rs=>rs.map((r,j)=>j===i?{...r,party:e.target.value}:r))}
                            style={{ width:100, height:28, border:'1px solid var(--border)', borderRadius:4, fontSize:11, background:'var(--bg)', color:'var(--text)', padding:'0 4px' }}/>
                        </td>
                        <td style={{ padding:4 }}>
                          <input placeholder="Description" value={row.narration} onChange={e=>setRows(rs=>rs.map((r,j)=>j===i?{...r,narration:e.target.value}:r))}
                            style={{ width:160, height:28, border:'1px solid var(--border)', borderRadius:4, fontSize:11, background:'var(--bg)', color:'var(--text)', padding:'0 4px' }}/>
                        </td>
                        <td style={{ padding:4 }}>
                          <input type="number" placeholder="0.00" value={row.amount} onChange={e=>setRows(rs=>rs.map((r,j)=>j===i?{...r,amount:e.target.value}:r))}
                            style={{ width:80, height:28, border:'1px solid var(--border)', borderRadius:4, fontSize:11, background:'var(--bg)', color:'var(--text)', padding:'0 4px' }}/>
                        </td>
                        <td style={{ padding:4 }}>
                          <input type="number" placeholder="0" value={row.cgst} onChange={e=>setRows(rs=>rs.map((r,j)=>j===i?{...r,cgst:e.target.value}:r))}
                            style={{ width:60, height:28, border:'1px solid var(--border)', borderRadius:4, fontSize:11, background:'var(--bg)', color:'var(--text)', padding:'0 4px' }}/>
                        </td>
                        <td style={{ padding:4 }}>
                          <input type="number" placeholder="0" value={row.sgst} onChange={e=>setRows(rs=>rs.map((r,j)=>j===i?{...r,sgst:e.target.value}:r))}
                            style={{ width:60, height:28, border:'1px solid var(--border)', borderRadius:4, fontSize:11, background:'var(--bg)', color:'var(--text)', padding:'0 4px' }}/>
                        </td>
                        <td style={{ padding:4 }}>
                          <button onClick={()=>setRows(rs=>rs.filter((_,j)=>j!==i))} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--danger)', padding:4 }}>
                            <Trash2 size={13}/>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div style={{ display:'flex', gap:8, marginTop:10, alignItems:'center' }}>
                <button className="btn btn-secondary btn-sm" onClick={()=>setRows(rs=>[...rs, EMPTY_ROW()])}>
                  <PlusCircle size={13}/> Add Row
                </button>
                <button className="btn btn-ghost btn-sm" onClick={()=>setRows([EMPTY_ROW()])}>Clear</button>
                <span style={{ fontSize:11, color:'var(--text-3)', marginLeft:'auto' }}>
                  {rows.filter(r=>r.narration?.trim()&&parseFloat(r.amount)>0).length} valid rows
                </span>
              </div>
            </div>
          )}

          {tab === 'csv' && (
            <div>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
                <p style={{ fontSize:12, color:'var(--text-3)', margin:0 }}>Upload a CSV file to bulk-import vouchers.</p>
                <button className="btn btn-ghost btn-sm" onClick={downloadCSVTemplate}>
                  <FileText size={12}/> Download Template
                </button>
              </div>
              <div {...csvRootProps()} style={{ border:`2px dashed ${csvDrag?'var(--primary)':'var(--border)'}`, borderRadius:10, padding:'28px 20px', textAlign:'center', cursor:'pointer', background: csvDrag?'var(--primary-l)':'var(--surface-2)', marginBottom:12 }}>
                <input {...csvInputProps()}/>
                <Upload size={24} color="var(--text-3)" style={{ margin:'0 auto 8px' }}/>
                <p style={{ fontWeight:600, fontSize:13, color:'var(--text)', marginBottom:4 }}>{csvDrag?'Drop CSV here':'Drag & drop CSV or click to browse'}</p>
                <p style={{ fontSize:11, color:'var(--text-3)' }}>Columns: type, date, reference, party, narration, amount, cgst, sgst, igst</p>
              </div>
              {csvLoading && <p style={{ fontSize:12, color:'var(--text-3)' }}>Parsing CSV…</p>}
              {csvError && <div style={{ padding:'10px 12px', background:'#FEF2F2', border:'1px solid #FCA5A5', borderRadius:8, fontSize:12, color:'#B91C1C', marginBottom:8 }}>❌ {csvError}</div>}
              {csvPreview && (
                <div>
                  <div style={{ padding:'8px 12px', background:'#F0FDF4', border:'1px solid #86EFAC', borderRadius:8, fontSize:12, color:'#15803D', marginBottom:8 }}>
                    ✅ {csvPreview.length} rows ready to import
                  </div>
                </div>
              )}
            </div>
          )}

          {tab === 'xls' && (
            <div>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
                <p style={{ fontSize:12, color:'var(--text-3)', margin:0 }}>
                  Import Sales or Purchase reports directly from <strong>.xls / .xlsx</strong> files — exactly as exported from Finix or Tally.
                </p>
              </div>

              <div style={{ display:'flex', gap:6, marginBottom:10, alignItems:'center' }}>
                <span style={{ fontSize:11, fontWeight:700, color:'var(--text-3)', textTransform:'uppercase', letterSpacing:'0.05em' }}>Import as:</span>
                {['sales','purchase','receipt','payment','journal'].map(t => (
                  <button key={t} onClick={() => { setXlsType(t); setXlsPreview(null); setXlsError('') }}
                    style={{ padding:'3px 12px', fontSize:11, fontWeight:600, border:`1px solid ${xlsType===t?'var(--primary)':'var(--border)'}`,
                      borderRadius:20, cursor:'pointer', textTransform:'capitalize',
                      background: xlsType===t ? 'var(--primary)' : 'var(--bg)',
                      color: xlsType===t ? 'white' : 'var(--text-2)' }}>
                    {t}
                  </button>
                ))}
              </div>

              <div {...xlsRootProps()} style={{
                border:`2px dashed ${xlsDrag?'#D97706':'var(--border)'}`,
                borderRadius:10, padding:'24px 20px', textAlign:'center', cursor:'pointer',
                background: xlsDrag ? '#FFFBEB' : xlsFile ? '#F0FDF4' : 'var(--surface-2)',
                marginBottom:12, transition:'all 0.2s'
              }}>
                <input {...xlsInputProps()}/>
                {xlsLoading ? (
                  <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:10 }}>
                    <span style={{ width:28, height:28, border:'3px solid #FDE68A', borderTopColor:'#D97706', borderRadius:'50%', display:'inline-block', animation:'spin 0.7s linear infinite' }}/>
                    <p style={{ fontSize:13, color:'#92400E', fontWeight:600 }}>Parsing {xlsFile?.name}…</p>
                  </div>
                ) : xlsFile && xlsPreview ? (
                  <>
                    <Table2 size={26} color="#059669" style={{ margin:'0 auto 8px' }}/>
                    <p style={{ fontWeight:700, fontSize:13, color:'var(--success)', marginBottom:2 }}>{xlsFile.name}</p>
                    <p style={{ fontSize:11, color:'var(--text-3)' }}>{xlsPreview.length} records found · Click to change file</p>
                  </>
                ) : (
                  <>
                    <Table2 size={26} color="#D97706" style={{ margin:'0 auto 8px' }}/>
                    <p style={{ fontWeight:600, fontSize:13, color:'var(--text)', marginBottom:4 }}>
                      {xlsDrag ? 'Drop XLS file here ✓' : 'Drag & drop or click to browse'}
                    </p>
                    <p style={{ fontSize:11, color:'var(--text-3)' }}>
                      .xls · .xlsx · .csv &nbsp;·&nbsp; Auto-detects: Date, Party Name, Invoice No, Amount, GST
                    </p>
                    <p style={{ fontSize:10, color:'var(--text-3)', marginTop:4 }}>
                      Works with Finix Sale Report, Tally exports, and any standard Excel invoice list
                    </p>
                  </>
                )}
              </div>

              {xlsError && (
                <div style={{ padding:'10px 12px', background:'#FEF2F2', border:'1px solid #FCA5A5', borderRadius:8, fontSize:12, color:'#B91C1C', marginBottom:8 }}>
                  ❌ {xlsError}
                </div>
              )}

              {xlsPreview && xlsPreview.length > 0 && (
                <div>
                  <div style={{ display:'flex', gap:12, marginBottom:10, padding:'10px 14px', background:'#F0FDF4', border:'1px solid #86EFAC', borderRadius:8, flexWrap:'wrap' }}>
                    <div style={{ fontSize:12 }}>
                      <span style={{ color:'var(--text-3)' }}>Records: </span>
                      <strong style={{ color:'var(--success)' }}>{xlsPreview.length}</strong>
                    </div>
                    <div style={{ fontSize:12 }}>
                      <span style={{ color:'var(--text-3)' }}>Total Amount: </span>
                      <strong style={{ color:'var(--success)' }}>₹{fmt(xlsPreview.filter(r=>!r.is_credit_note).reduce((s,r) => s + r.amount, 0))}</strong>
                    </div>
                    <div style={{ fontSize:12 }}>
                      <span style={{ color:'var(--text-3)' }}>Total GST: </span>
                      <strong>₹{fmt(xlsPreview.filter(r=>!r.is_credit_note).reduce((s,r) => s + (r.cgst||0)+(r.sgst||0)+(r.igst||0), 0))}</strong>
                    </div>
                    {xlsPreview.some(r=>r.is_credit_note) && (
                      <div style={{ fontSize:12 }}>
                        <span style={{ color:'#92400E' }}>Credit Notes (deducted): </span>
                        <strong style={{ color:'#B45309' }}>-₹{fmt(xlsPreview.filter(r=>r.is_credit_note).reduce((s,r)=>s+r.amount,0))}</strong>
                      </div>
                    )}
                    {Object.entries(xlsPreview.reduce((acc,r) => { const k=r.is_credit_note?'credit note':r.voucher_type; acc[k]=(acc[k]||0)+1; return acc }, {})).map(([t,c]) => (
                      <div key={t} style={{ fontSize:12 }}>
                        <span className={`badge ${t==='credit note'?'badge-amber':vBadge[t]||'badge-gray'}`} style={{ textTransform:'capitalize' }}>{t}</span>
                        <strong style={{ marginLeft:4 }}>{c}</strong>
                      </div>
                    ))}
                  </div>
                  <div style={{ maxHeight:220, overflowY:'auto', border:'1px solid var(--border)', borderRadius:8 }}>
                    <table style={{ width:'100%', fontSize:11, borderCollapse:'collapse' }}>
                      <thead>
                        <tr style={{ background:'var(--surface-2)', position:'sticky', top:0 }}>
                          {['Type','Date','Party','Invoice','Amount','GST','Status'].map(h => (
                            <th key={h} style={{ padding:'6px 8px', textAlign:'left', fontWeight:700, color:'var(--text-3)', borderBottom:'1px solid var(--border)', whiteSpace:'nowrap' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {xlsPreview.slice(0,15).map((r,i) => (
                          <tr key={i} style={{ borderBottom:'1px solid var(--border)' }}>
                            <td style={{ padding:'5px 8px' }}><span className={`badge ${vBadge[r.voucher_type]||'badge-gray'}`} style={{ textTransform:'capitalize' }}>{r.voucher_type}</span></td>
                            <td style={{ padding:'5px 8px', color:'var(--text-3)', whiteSpace:'nowrap' }}>{r.date}</td>
                            <td style={{ padding:'5px 8px', maxWidth:130, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', fontWeight:500 }}>{r.party||'—'}</td>
                            <td style={{ padding:'5px 8px', color:'var(--primary)', fontSize:10 }}>{r.reference||'—'}</td>
                            <td style={{ padding:'5px 8px', fontFamily:'var(--font-mono)', fontWeight:700 }}>₹{fmt(r.amount)}</td>
                            <td style={{ padding:'5px 8px', color:'var(--text-3)' }}>₹{fmt((r.cgst||0)+(r.sgst||0)+(r.igst||0))}</td>
                            <td style={{ padding:'5px 8px' }}>
                              {r.xls_status ? (
                                <span style={{ fontSize:9, padding:'2px 6px', borderRadius:10, fontWeight:700,
                                  background: r.xls_status.toLowerCase()==='paid' ? '#ECFDF5' : r.xls_status.toLowerCase()==='unpaid' ? '#FEF2F2' : '#FFF7ED',
                                  color:      r.xls_status.toLowerCase()==='paid' ? '#065F46' : r.xls_status.toLowerCase()==='unpaid' ? '#991B1B' : '#92400E' }}>
                                  {r.xls_status}
                                </span>
                              ) : '—'}
                            </td>
                          </tr>
                        ))}
                        {xlsPreview.length > 15 && (
                          <tr><td colSpan={7} style={{ padding:'6px 8px', color:'var(--text-3)', fontSize:11, fontStyle:'italic' }}>…and {xlsPreview.length-15} more rows</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {tab === 'ai' && (
            <div>
              <p style={{ fontSize:12, color:'var(--text-3)', marginBottom:14 }}>
                Upload a PDF or image invoice. Claude AI will extract all fields automatically.
              </p>
              <div {...aiRootProps()} style={{ border:`2px dashed ${aiDrag?'var(--primary)':'var(--border)'}`, borderRadius:10, padding:'32px 20px', textAlign:'center', cursor:'pointer', background: aiDrag?'var(--primary-l)':'var(--surface-2)', marginBottom:12 }}>
                <input {...aiInputProps()}/>
                {aiLoading ? (
                  <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:10 }}>
                    <span style={{ width:28, height:28, border:'3px solid #E0E7FF', borderTopColor:'#2563EB', borderRadius:'50%', display:'inline-block', animation:'spin 0.7s linear infinite' }}/>
                    <p style={{ fontSize:13, color:'var(--text-2)', fontWeight:600 }}>AI is reading the invoice…</p>
                  </div>
                ) : aiFile ? (
                  <>
                    <Brain size={28} color="#2563EB" style={{ margin:'0 auto 8px' }}/>
                    <p style={{ fontWeight:600, fontSize:13, color:'var(--success)', marginBottom:4 }}>✅ {aiFile.name} — parsed!</p>
                    <p style={{ fontSize:11, color:'var(--text-3)' }}>Fields filled in Single Entry tab. Switch there to review and post.</p>
                  </>
                ) : (
                  <>
                    <Brain size={28} color="#2563EB" style={{ margin:'0 auto 8px' }}/>
                    <p style={{ fontWeight:600, fontSize:13, color:'var(--text)', marginBottom:4 }}>
                      {aiDrag ? 'Drop invoice here' : 'Drag & drop PDF/image invoice'}
                    </p>
                    <p style={{ fontSize:11, color:'var(--text-3)' }}>Supported: PDF, PNG, JPG · Powered by Claude AI</p>
                  </>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="modal-foot">
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          {tab === 'single' && <button className="btn btn-primary" onClick={handleSingle}><Plus size={14}/> Post Voucher</button>}
          {tab === 'bulk'   && <button className="btn btn-primary" onClick={handleBulkPost}><Plus size={14}/> Post {rows.filter(r=>r.narration?.trim()&&parseFloat(r.amount)>0).length} Vouchers</button>}
          {tab === 'csv'    && <button className="btn btn-primary" onClick={handleCSVImport} disabled={!csvPreview?.length}><Upload size={14}/> Import {csvPreview?.length||0} Rows</button>}
          {tab === 'xls'    && <button className="btn btn-primary" onClick={handleXLSImport} disabled={!xlsPreview?.length} style={{ background:'#D97706' }}><Table2 size={14}/> Import {xlsPreview?.length||0} {xlsType} Vouchers</button>}
          {tab === 'ai'     && <button className="btn btn-primary" onClick={()=>setTab('single')} disabled={!aiFile}>Review in Single Entry →</button>}
        </div>
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    </div>
  )
}

// ── Main Dashboard ─────────────────────────────────────────────────────────
export default function Dashboard() {
  const { activeCompany } = useAuth()
  const [refresh, setRefresh] = useState(0)
  const [modal, setModal] = useState(false)
  const [defaultType, setDefaultType] = useState('sales')
  const [dismissed, setDismissed] = useState([])
  const [editingVoucher, setEditingVoucher] = useState(null)
  const [showAllVouchers, setShowAllVouchers] = useState(false)

  const companyData = loadCompanyData(activeCompany?.id)
  const fin  = computeFinancials(activeCompany?.id)
  const data = companyData.dashboard
  const bs   = fin

  const alerts = (data.alerts || []).filter((_,i) => !dismissed.includes(`${activeCompany?.id}-${i}`))
  const isEmpty = !fin.hasRealData

  const openModal = (type = 'sales') => { setDefaultType(type); setModal(true) }
  const handlePosted = () => setRefresh(r => r+1)

  const handleDelete = (v) => {
    if (!window.confirm(`Delete voucher ${v.voucher_no}? This cannot be undone.`)) return
    deleteVoucher(activeCompany?.id, v.id)
    toast.success(`Voucher ${v.voucher_no} deleted`)
    setRefresh(r => r+1)
  }

  const displayedVouchers = showAllVouchers ? fin.vouchers : fin.vouchers.slice(0, 10)

  return (
    <div className="page-wrap page-enter" key={refresh}>
      <div className="page-header">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="page-sub">{activeCompany?.name} · {activeCompany?.fy} · Financial Overview</p>
        </div>
        <div className="page-actions">
          <button className="btn btn-secondary" onClick={()=>toast.success('Report exported!')}><Activity size={13}/> Export PDF</button>
          <button className="btn btn-primary" onClick={()=>openModal()}><Plus size={13}/> New Entry</button>
        </div>
      </div>

      {alerts.map((al, i) => (
        <div key={i} className={`alert-bar ${al.type==='warning'?'warn':al.type==='success'?'succ':'info'}`}>
          {al.type==='warning'&&<AlertTriangle size={14}/>}
          {al.type==='info'&&<Info size={14}/>}
          {al.type==='success'&&<CheckCircle size={14}/>}
          <span className="al-msg">{al.message}</span>
          {al.action&&<button className="al-act">{al.action} →</button>}
          <button className="al-x" onClick={()=>setDismissed(d=>[...d,`${activeCompany?.id}-${i}`])}><X size={13}/></button>
        </div>
      ))}

      {isEmpty && (
        <div style={{ padding:'20px 24px', background:'linear-gradient(135deg,#EFF6FF,#F5F3FF)', border:'1px solid #C7D2FE', borderRadius:12, marginBottom:16, display:'flex', alignItems:'center', gap:16 }}>
          <Zap size={28} color="#2563EB"/>
          <div>
            <div style={{ fontWeight:700, fontSize:15, marginBottom:4 }}>Welcome to {activeCompany?.name}!</div>
            <div style={{ fontSize:13, color:'var(--text-2)' }}>No data yet. Post a voucher or import a bank statement to get started.</div>
          </div>
          <button className="btn btn-primary" style={{ marginLeft:'auto', whiteSpace:'nowrap' }} onClick={()=>openModal()}>
            <Plus size={13}/> Post First Entry
          </button>
        </div>
      )}

      {/* Quick actions */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(6,1fr)', gap:10, marginBottom:16 }}>
        {QUICK_ACTIONS.map(a => (
          <button key={a.label} className="card"
            style={{ padding:'14px 10px', display:'flex', flexDirection:'column', alignItems:'center', gap:8, cursor:'pointer', border:'1px solid var(--border)', background:'var(--surface)', transition:'all .15s' }}
            onClick={()=>openModal(a.type)}
            onMouseEnter={e=>{e.currentTarget.style.borderColor=a.color;e.currentTarget.style.background=a.bg}}
            onMouseLeave={e=>{e.currentTarget.style.borderColor='var(--border)';e.currentTarget.style.background='var(--surface)'}}>
            <div style={{ width:36, height:36, borderRadius:10, background:a.bg, display:'flex', alignItems:'center', justifyContent:'center' }}>
              <a.icon size={16} color={a.color}/>
            </div>
            <span style={{ fontSize:11, fontWeight:600, color:'var(--text-2)', textAlign:'center', lineHeight:1.3 }}>{a.label}</span>
          </button>
        ))}
      </div>

      {/* KPIs */}
      <div className="kpi-grid">
        {[
          { label:'Total Revenue',  value:fmtCr(bs.income),      icon:DollarSign, color:'blue',   trend:isEmpty?'No data yet':'+vs expenses', dir:'up' },
          { label:'Net Profit',     value:fmtCr(bs.net_profit),  icon:TrendingUp, color:'green',  trend:bs.income>0?`Margin ${((bs.net_profit/Math.max(bs.income,1))*100).toFixed(1)}%`:'No data yet', dir:bs.net_profit>=0?'up':'down' },
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

      {/* Charts */}
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

        {/* ── Transactions table — FULLY EDITABLE ─────────────────────── */}
        <div className="tbl-wrap">
          <div className="tbl-toolbar">
            <span style={{ fontWeight:600, fontSize:'var(--fs-md)', flex:1 }}>
              Recent Transactions
              {fin.vouchers.length > 0 && <span style={{ fontSize:11, color:'var(--text-3)', marginLeft:8 }}>({fin.vouchers.length} total)</span>}
            </span>
            <button className="btn btn-ghost btn-sm" onClick={()=>openModal()}><Plus size={11}/> Add</button>
            {fin.vouchers.length > 10 && (
              <button className="btn btn-ghost btn-sm" onClick={()=>setShowAllVouchers(v=>!v)}>
                {showAllVouchers ? 'Show less' : `View all ${fin.vouchers.length}`} <ArrowRight size={11}/>
              </button>
            )}
          </div>
          {displayedVouchers.length > 0 ? (
            <table className="tbl">
              <thead>
                <tr>
                  <th>Voucher No.</th>
                  <th>Party / Narration</th>
                  <th>Type</th>
                  <th>Date</th>
                  <th style={{ textAlign:'right' }}>Amount (₹)</th>
                  <th style={{ textAlign:'center', width:72 }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {displayedVouchers.map(v => (
                  <tr key={v.id}>
                    <td><span style={{ fontFamily:'var(--mono)', fontSize:'var(--fs-xs)', color:'var(--accent)', fontWeight:600 }}>{v.voucher_no}</span></td>
                    <td style={{ maxWidth:160 }}>
                      <div style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', fontSize:12, fontWeight:500 }}>{v.party || v.narration}</div>
                      {v.party && <div style={{ fontSize:10, color:'var(--text-4)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{v.narration}</div>}
                    </td>
                    <td><span className={`badge ${vBadge[v.voucher_type]||'badge-gray'}`} style={{ textTransform:'capitalize' }}>{v.voucher_type}</span></td>
                    <td style={{ color:'var(--text-4)', fontSize:'var(--fs-xs)', whiteSpace:'nowrap' }}>{fmtDate(v.date)}</td>
                    <td style={{ textAlign:'right' }}>
                      <span className={['sales','receipt'].includes(v.voucher_type)?'cr':'dr'}>
                        {['sales','receipt'].includes(v.voucher_type)?'+':'-'}₹{fmt(v.amount)}
                      </span>
                    </td>
                    <td style={{ textAlign:'center' }}>
                      <div style={{ display:'flex', gap:4, justifyContent:'center' }}>
                        <button
                          title="Edit voucher"
                          onClick={()=>setEditingVoucher(v)}
                          style={{ background:'none', border:'1px solid var(--border)', borderRadius:4, padding:'2px 6px', cursor:'pointer', color:'var(--text-3)', display:'flex', alignItems:'center' }}>
                          <Edit2 size={11}/>
                        </button>
                        <button
                          title="Delete voucher"
                          onClick={()=>handleDelete(v)}
                          style={{ background:'none', border:'1px solid #FCA5A5', borderRadius:4, padding:'2px 6px', cursor:'pointer', color:'var(--danger)', display:'flex', alignItems:'center' }}>
                          <Trash2 size={11}/>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div style={{ padding:'48px 0', textAlign:'center', color:'var(--text-3)' }}>
              <div style={{ fontSize:'2rem', marginBottom:8 }}>📭</div>
              <div style={{ fontSize:13 }}>No transactions yet</div>
              <button className="btn btn-primary btn-sm" style={{ marginTop:12 }} onClick={()=>openModal()}><Plus size={12}/> Post First Voucher</button>
            </div>
          )}
        </div>
      </div>

      {modal && <JournalModal onClose={()=>setModal(false)} companyId={activeCompany?.id} onPosted={handlePosted} defaultType={defaultType}/>}
      {editingVoucher && (
        <EditVoucherModal
          voucher={editingVoucher}
          companyId={activeCompany?.id}
          onClose={()=>setEditingVoucher(null)}
          onSaved={handlePosted}
        />
      )}
    </div>
  )
}
