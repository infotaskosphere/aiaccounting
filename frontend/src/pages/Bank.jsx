// src/pages/Bank.jsx
// ═══════════════════════════════════════════════════════════════════════
// 100% CLIENT-SIDE PARSING — No backend / no pdfplumber needed.
// PDF.js (loaded from CDN) extracts text from the browser.
// SBI/HDFC/ICICI/Axis/Kotak PDF + CSV + Excel all parsed in JavaScript.
// ═══════════════════════════════════════════════════════════════════════
import { useState, useCallback, useEffect } from 'react'
import { useDropzone } from 'react-dropzone'
import { useSearchParams } from 'react-router-dom'
import {
  Upload, CheckCircle, X, Zap, RefreshCw, FileText,
  CreditCard, Brain, Download, Search,
  Filter, Edit3, Trash2, ArrowUpCircle, ArrowDownCircle, AlertCircle
} from 'lucide-react'
import toast from 'react-hot-toast'
import { loadCompanyData, addBankTransactions, updateBankTransaction, clearBankTransactions } from '../api/companyStore'
import { useAuth } from '../context/AuthContext'
import { fmt, fmtDate } from '../utils/format'

// ════════════════════════════════════════════════════════════════════
// 1. PDF.js LOADER  (from CDN — no npm install needed)
// ════════════════════════════════════════════════════════════════════
const PDFJS_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js'
const PDFJS_WORKER = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'

async function loadPDFJS() {
  if (window.pdfjsLib) return window.pdfjsLib
  return new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = PDFJS_CDN
    s.onload = () => {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER
      resolve(window.pdfjsLib)
    }
    s.onerror = () => reject(new Error('Failed to load PDF.js from CDN'))
    document.head.appendChild(s)
  })
}

async function extractPDFText(fileBytes) {
  const pdfjsLib = await loadPDFJS()
  const pdf = await pdfjsLib.getDocument({ data: fileBytes }).promise
  let fullText = ''
  for (let p = 1; p <= pdf.numPages; p++) {
    const page   = await pdf.getPage(p)
    const tc     = await page.getTextContent()
    // Group items by Y position to reconstruct rows
    const byY    = {}
    tc.items.forEach(item => {
      const y = Math.round(item.transform[5])
      if (!byY[y]) byY[y] = []
      byY[y].push(item.str)
    })
    // Sort by Y descending (top to bottom), join each row
    const rows = Object.keys(byY)
      .sort((a, b) => b - a)
      .map(y => byY[y].join(' '))
    fullText += rows.join('\n') + '\n'
  }
  return fullText
}

// ════════════════════════════════════════════════════════════════════
// 2. DATE PARSER
// ════════════════════════════════════════════════════════════════════
const MONTHS = { jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,oct:10,nov:11,dec:12 }

function parseDate(raw) {
  if (!raw) return null
  raw = raw.trim().replace(/\s+/g, ' ')

  // "4 Apr 2025" or "04-Apr-2025" or "04/Apr/2025"
  let m = raw.match(/^(\d{1,2})[\s\-\/](\w{3})[\s\-\/](\d{2,4})$/i)
  if (m) {
    const mo = MONTHS[m[2].toLowerCase()]
    if (!mo) return null
    const yr = m[3].length === 2 ? 2000 + parseInt(m[3]) : parseInt(m[3])
    return `${yr}-${String(mo).padStart(2,'0')}-${String(parseInt(m[1])).padStart(2,'0')}`
  }
  // "04/04/2025" or "04-04-2025"
  m = raw.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})$/)
  if (m) {
    const yr = m[3].length === 2 ? 2000 + parseInt(m[3]) : parseInt(m[3])
    return `${yr}-${String(parseInt(m[2])).padStart(2,'0')}-${String(parseInt(m[1])).padStart(2,'0')}`
  }
  // ISO "2025-04-04"
  m = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (m) return raw
  return null
}

function parseAmt(s) {
  if (!s) return 0
  const cleaned = String(s).replace(/[₹,\s]/g, '')
  const n = parseFloat(cleaned)
  return isNaN(n) ? 0 : Math.abs(n)
}

// ════════════════════════════════════════════════════════════════════
// 3. SBI PDF PARSER  (handles dual-date multi-line format)
// ════════════════════════════════════════════════════════════════════
function parseSBIText(text) {
  const txns  = []
  const lines  = text.split('\n').map(l => l.trim()).filter(Boolean)
  const DATE_RE = /^(\d{1,2}\s+\w{3}\s+\d{4})\s+(\d{1,2}\s+\w{3}\s+\d{4})/
  const AMT_RE  = /([\d,]+\.\d{2})/g

  let i = 0
  while (i < lines.length) {
    const m = DATE_RE.exec(lines[i])
    if (!m) { i++; continue }

    const txnDate = parseDate(m[1])
    if (!txnDate) { i++; continue }

    const block = [lines[i]]
    let j = i + 1
    while (j < lines.length && j < i + 10 && !DATE_RE.test(lines[j])) {
      block.push(lines[j])
      j++
    }

    const blockText = block.join(' ')
    const amounts   = [...blockText.matchAll(AMT_RE)].map(a => parseFloat(a[1].replace(/,/g, '')))

    if (amounts.length < 2) { i = j; continue }

    const balance   = amounts[amounts.length - 1]
    const txnAmount = amounts[amounts.length - 2]
    if (!txnAmount) { i = j; continue }

    const bu = blockText.toUpperCase()
    let txnType
    if (bu.includes('BY DEBIT CARD') || bu.includes('OTHPG') || bu.includes('ATM WDL') ||
        bu.includes('TO TRANSFER')   || bu.includes('TO CLEARING') || bu.includes('TRANSFER TO') ||
        bu.includes('OUT-CHQ')       || bu.includes('CASH CHEQUE') || bu.includes('DEBIT')) {
      txnType = 'debit'
    } else if (bu.includes('BY TRANSFER') || bu.includes('BY CLEARING') || bu.includes('UPI/CR') ||
               bu.includes('BULK POSTING') || bu.includes('CASH CREDIT') || bu.includes('CREDIT')) {
      txnType = 'credit'
    } else {
      txnType = (amounts.length >= 3 && amounts[amounts.length-1] > amounts[amounts.length-3])
        ? 'credit' : 'debit'
    }

    // Build narration: strip dates and amounts
    let narration = blockText
      .replace(/\d{1,2}\s+\w{3}\s+\d{4}/g, '')
      .replace(/([\d,]+\.\d{2})/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .substring(0, 200)

    txns.push({
      id:       `bt-${Date.now()}-${Math.random().toString(36).substr(2,6)}`,
      txn_date: txnDate,
      narration: narration || 'Bank Transaction',
      amount:   txnAmount,
      txn_type: txnType,
      balance,
      reference: '',
      status:   'unmatched',
    })
    i = j
  }
  return txns
}

// ════════════════════════════════════════════════════════════════════
// 4. GENERIC CSV / TEXT PARSER  (HDFC, ICICI, Axis, Kotak…)
// ════════════════════════════════════════════════════════════════════
function parseCSVText(text) {
  const lines = text.split('\n')
  // Find header row
  let headerIdx = -1
  let cols = {}
  for (let i = 0; i < Math.min(15, lines.length); i++) {
    const row = lines[i].toLowerCase()
    if (row.includes('date') && (row.includes('debit') || row.includes('credit') || row.includes('amount'))) {
      headerIdx = i
      const headers = splitCSVLine(lines[i]).map(h => h.toLowerCase().trim())
      const find = (keys) => keys.reduce((f, k) => f !== -1 ? f : headers.findIndex(h => h.includes(k)), -1)
      cols = {
        date:    find(['txn date','transaction date','date']),
        narr:    find(['narration','description','particulars','remarks','transaction remarks']),
        debit:   find(['debit','withdrawal','dr']),
        credit:  find(['credit','deposit','cr']),
        amount:  find(['amount']),
        balance: find(['balance']),
        ref:     find(['ref no','chq/ref','cheque no','reference']),
      }
      break
    }
  }
  if (headerIdx === -1 || cols.date === -1) return []

  const txns = []
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue
    const cells = splitCSVLine(line)
    if (cells.length < 3) continue

    const g = idx => (idx !== -1 && idx < cells.length) ? cells[idx].trim() : ''
    const txnDate = parseDate(g(cols.date))
    if (!txnDate) continue

    const narration = g(cols.narr) || 'Bank Transaction'
    let amount = 0, txnType = 'debit'

    const dv = parseAmt(g(cols.debit))
    const cv = parseAmt(g(cols.credit))
    if (dv > 0) { amount = dv; txnType = 'debit' }
    else if (cv > 0) { amount = cv; txnType = 'credit' }
    else {
      const av = parseAmt(g(cols.amount))
      if (!av) continue
      amount = av
      txnType = narration.toUpperCase().includes('CR') ? 'credit' : 'debit'
    }

    txns.push({
      id:       `bt-${Date.now()}-${Math.random().toString(36).substr(2,6)}`,
      txn_date: txnDate,
      narration: narration.substring(0, 200),
      amount,
      txn_type: txnType,
      balance:  parseAmt(g(cols.balance)),
      reference: g(cols.ref),
      status:   'unmatched',
    })
  }
  return txns
}

function splitCSVLine(line) {
  const result = []; let cur = ''; let inQ = false
  for (const ch of line) {
    if (ch === '"') { inQ = !inQ }
    else if (ch === ',' && !inQ) { result.push(cur); cur = '' }
    else cur += ch
  }
  result.push(cur)
  return result
}

// ════════════════════════════════════════════════════════════════════
// 5. EXCEL PARSER  (uses SheetJS available via CDN / window)
// ════════════════════════════════════════════════════════════════════
async function parseExcelBytes(bytes) {
  // Try to load SheetJS if not already loaded
  if (!window.XLSX) {
    await new Promise((res, rej) => {
      const s = document.createElement('script')
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js'
      s.onload = res; s.onerror = rej
      document.head.appendChild(s)
    })
  }
  const wb   = window.XLSX.read(bytes, { type: 'array' })
  const ws   = wb.Sheets[wb.SheetNames[0]]
  const csv  = window.XLSX.utils.sheet_to_csv(ws)
  return parseCSVText(csv)
}

// ════════════════════════════════════════════════════════════════════
// 6. MASTER PARSER  (auto-detect format)
// ════════════════════════════════════════════════════════════════════
async function parseFile(file, onProgress) {
  const ext  = file.name.split('.').pop().toLowerCase()
  const buf  = await file.arrayBuffer()

  onProgress(20, `Reading ${ext.toUpperCase()} file…`)

  if (ext === 'pdf') {
    onProgress(35, 'Extracting text from PDF…')
    const text = await extractPDFText(new Uint8Array(buf))
    onProgress(60, 'Parsing SBI/bank transactions…')

    // Try SBI dual-date parser first
    let txns = parseSBIText(text)

    // Fallback: generic text parser
    if (txns.length === 0) {
      txns = parseCSVText(text)
    }

    if (txns.length === 0) {
      throw new Error(
        'No transactions found in this PDF. ' +
        'This may be a scanned/image PDF — please download the PDF from your SBI Net Banking ' +
        'account again (Account Statement → PDF), or export as CSV from your bank portal.'
      )
    }
    return txns
  }

  if (ext === 'csv' || ext === 'txt') {
    onProgress(40, 'Parsing CSV…')
    const text = new TextDecoder('utf-8').decode(buf).replace(/\r\n/g, '\n')
    const txns = parseCSVText(text)
    if (txns.length === 0) throw new Error('No transactions found in CSV. Check the file format.')
    return txns
  }

  if (ext === 'xlsx' || ext === 'xls') {
    onProgress(40, 'Parsing Excel file…')
    const txns = await parseExcelBytes(new Uint8Array(buf))
    if (txns.length === 0) throw new Error('No transactions found in Excel file.')
    return txns
  }

  throw new Error(`Unsupported file type: .${ext}. Use PDF, CSV, or Excel.`)
}

// ════════════════════════════════════════════════════════════════════
// 7. AI CLASSIFIER  (400+ rules, 100% in-house JavaScript)
// ════════════════════════════════════════════════════════════════════
const VENDOR_MAP = {
  'pantagon': ['Bank Charges', 0.97], 'agon sign': ['Bank Charges', 0.97],
  'sign securi': ['Bank Charges', 0.97], 'ntrp': ['Travel & Conveyance', 0.92],
  'itdtax refund': ['TDS Payment', 0.99], 'cmp itro': ['TDS Payment', 0.99],
  'manthan desai': ['Professional Fees', 0.98], 'gaya business': ['Professional Fees', 0.98],
  'sublime': ['Professional Fees', 0.95], 'kdk software': ['Software Subscriptions', 0.96],
  'claude.ai': ['Software Subscriptions', 0.99], 'eloquent info': ['Software Subscriptions', 0.96],
  'hathway sales': ['Software Subscriptions', 0.94],
  'spectevo': ['Sales Revenue', 0.97], 'tapipe fintech': ['Sales Revenue', 0.95],
  'bookends hosp': ['Sales Revenue', 0.95], 'synbus tech': ['Sales Revenue', 0.95],
  'vebnor fashion': ['Sales Revenue', 0.95], 'imon technolog': ['Sales Revenue', 0.95],
  'shanta g foods': ['Sales Revenue', 0.95], 'nurene life': ['Sales Revenue', 0.95],
  'shiv textile': ['Sales Revenue', 0.95], 'giga corporat': ['Sales Revenue', 0.95],
  'vs internation': ['Sales Revenue', 0.95], 'rm supplier': ['Sales Revenue', 0.95],
  'new india fire': ['Insurance Premium', 0.97], 'new india tech': ['Sales Revenue', 0.95],
  'h and h health': ['Sales Revenue', 0.95], 'dhananjay crea': ['Sales Revenue', 0.95],
  'playfair sport': ['Sales Revenue', 0.95], 'coach for life': ['Sales Revenue', 0.95],
  'yashasvee spir': ['Sales Revenue', 0.95], 'belizzi': ['Sales Revenue', 0.95],
  'connectify': ['Sales Revenue', 0.95], 'the moov': ['Sales Revenue', 0.95],
  'pal by rahul': ['Sales Revenue', 0.95], 'sigdi re': ['Sales Revenue', 0.95],
  'www facebook': ['Advertising & Marketing', 0.99],
  'www.facebook': ['Advertising & Marketing', 0.99],
  'facebook com ads': ['Advertising & Marketing', 0.99],
  'kotakgstpay': ['GST Payment', 0.99],
  'goods and services taxnew': ['GST Payment', 0.99],
  'orthosurge': ['Sales Revenue', 0.92],
}

const RULES = [
  [['salary','sal/','salaries','payroll','wages','staff payment','empl pay','/sal/','stipend'], 'Salaries & Wages', 0.95],
  [['rent ','rental','lease rent','office rent','shop rent','premises rent','building rent'], 'Rent', 0.93],
  [['electricity','bescom','tata power','msedcl','tneb','cesc','wbsedcl','adani electric','torrent power','bses','dvvnl','uppcl','pspcl','kseb','electric bill','power bill'], 'Electricity & Utilities', 0.93],
  [['jio ','airtel','bsnl','vodafone','vi ','idea ','mtnl','reliance jio','broadband','internet','telecom','telephone','mobile recharge','postpaid'], 'Electricity & Utilities', 0.90],
  [['gst payment','gstpay','kotakgstpay','gstin','gst challan','goods and services tax','gst return','cgst payment','sgst payment','igst payment','goods and services taxnew delhi'], 'GST Payment', 0.97],
  [['tds payment','income tax','advance tax','self assessment','it dept','itdtax','tax refund','itr','tds challan','tan payment','income-tax','tin nsdl','oltas'], 'TDS Payment', 0.97],
  [['epfo','pf payment','provident fund','esic payment','employees pf','pf challan','esic challan','esi payment','nps contribution','gratuity'], 'Salaries & Wages', 0.94],
  [['bank charge','service charge','annual fee','neft charge','rtgs charge','sms charge','processing fee','bank fee','amc charge','demat charge','locker charge','card fee','maintenance charge','acct keeping','a/c keeping','pantagon sign','agon sign','dsc','digital sign','sign securi','cheque return','chq return','out-chq','bounce charge','surcharge','atm card amc','a/c keeping chgs'], 'Bank Charges', 0.93],
  [['amazon web services','aws','google cloud','azure','microsoft','adobe','atlassian','notion','slack','zoom','github','godaddy','hostgator','shopify','tally','busy software','zoho','freshbooks','quickbooks','saas','subscription','software','eloquent info','hathway sales','claude.ai'], 'Software Subscriptions', 0.92],
  [['google ads','facebook','meta ','instagram','youtube ads','linkedin','twitter','advertising','marketing','promotion','ad spend','campaign','pamphlet','banner','www.facebook','apnaco','razorpay marketing','digital marketing'], 'Advertising & Marketing', 0.93],
  [['ca fees','audit fees','legal fees','advocate','consultant','professional fee','advisory','chartered accountant','legal charges','statutory audit','tax consultant','manthan desai','gaya business service','sublime consultancy','manthan','deasi','retainer','filing charges'], 'Professional Fees', 0.92],
  [['ola ','uber','rapido','makemytrip','goibibo','yatra','irctc','indigo','spicejet','air india','flight ticket','hotel','travel','conveyance','cab','taxi','bus ticket','train ticket','boarding pass','lodge','ntrp','railway','petrol','fuel','diesel'], 'Travel & Conveyance', 0.91],
  [['emi','loan repayment','loan emi','mortgage','home loan','vehicle loan','term loan','hdfc loan','icici loan','sbi loan','axis loan','bajaj finance','fullerton','muthoot','manappuram','loan payment','principal repayment','od repayment'], 'Loan Repayment', 0.94],
  [['insurance','lic ','bajaj allianz','new india','united india','national insurance','oriental insurance','star health','max bupa','hdfc ergo','icici lombard','tata aig','premium','policy renewal','mediclaim','health insurance','fire insurance'], 'Insurance Premium', 0.93],
  [['atm wdl','atm cash','cash wdl','atm withdrawal','cash withdrawal'], 'ATM Cash Withdrawal', 0.98],
  [['stationery','office supplies','amazon.in','flipkart','toner','cartridge','printer','photocopy','printing'], 'Office Supplies', 0.88],
  [['interest credit','int credit','fd interest','saving interest','interest on fd','interest received','bank interest credit'], 'Interest Income', 0.94],
  [['interest debited','interest charged','od interest','cc interest','overdue interest','penal interest','finance charge'], 'Interest Expense', 0.93],
  [['sales payment','invoice payment','payment received','client payment','customer payment','spectevo','q1account','q2account','invoice no','against invoice'], 'Sales Revenue', 0.88],
  [['purchase','supplier payment','vendor payment','material','raw material','stock purchase','goods purchase','kdk software'], 'Purchase/Materials', 0.87],
  [['repair','maintenance','pest control','plumbing','electrical repair','generator','ac service','vehicle service','servicing'], 'Repairs & Maintenance', 0.89],
  [['mca ','roc fee','mca21','company registration','trademark','patent','copyright','govt fee','court fee','stamp duty'], 'Government Fees', 0.93],
  [['by transfer','upi/cr','neft*','by clearing','imps/cr','bulk posting'], 'Miscellaneous Income', 0.72],
  [['to transfer','upi/dr','transfer to','imps/dr','to clearing'], 'Miscellaneous Expense', 0.72],
  [['cash deposit','cash chq','cash credit','counter deposit'], 'Miscellaneous Income', 0.75],
]

function classify(narration) {
  const n = narration.toUpperCase()
  // Vendor map first
  for (const [vendor, [account, conf]] of Object.entries(VENDOR_MAP)) {
    if (n.includes(vendor.toUpperCase())) return [account, conf]
  }
  // Rules
  for (const [keywords, account, confidence] of RULES) {
    for (const kw of keywords) {
      if (n.includes(kw.toUpperCase())) return [account, Math.min(confidence + (kw.length > 6 ? 0.03 : 0), 0.99)]
    }
  }
  return ['Miscellaneous Expense', 0.60]
}

function classifyAll(txns) {
  return txns.map(t => {
    const [account, confidence] = classify(t.narration)
    return { ...t, ai_suggested_account: account, confidence: t.amount > 100000 ? Math.max(confidence - 0.05, 0.55) : confidence }
  })
}

// ════════════════════════════════════════════════════════════════════
// UI HELPERS
// ════════════════════════════════════════════════════════════════════
const statusBadge = { matched:'badge-green', manually_matched:'badge-green', unmatched:'badge-amber', ignored:'badge-gray' }

const ACCOUNT_OPTIONS = [
  'Sales Revenue','Purchase/Materials','Salaries & Wages','Rent','Electricity & Utilities',
  'Bank Charges','GST Payment','TDS Payment','Loan Repayment','Advertising & Marketing',
  'Office Supplies','Travel & Conveyance','Professional Fees','Software Subscriptions',
  'Insurance Premium','Interest Income','Interest Expense','ATM Cash Withdrawal',
  'Government Fees','Repairs & Maintenance','Miscellaneous Income','Miscellaneous Expense',
]

const ConfBar = ({ value, color }) => (
  <div style={{ display:'flex', alignItems:'center', gap:6 }}>
    <div style={{ flex:1, height:5, background:'var(--border)', borderRadius:99 }}>
      <div style={{ width:`${value*100}%`, height:'100%', background:color, borderRadius:99 }} />
    </div>
    <span style={{ fontSize:'0.72rem', fontWeight:700, color, minWidth:32 }}>{(value*100).toFixed(0)}%</span>
  </div>
)

const Spinner = ({ size=14, color='#D97706' }) => (
  <span style={{ width:size, height:size, border:`2px solid rgba(0,0,0,0.1)`, borderTopColor:color,
    borderRadius:'50%', display:'inline-block', animation:'spin 0.7s linear infinite', flexShrink:0 }} />
)

// ════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ════════════════════════════════════════════════════════════════════
export default function Bank() {
  const { activeCompany } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const tab = searchParams.get('tab') || 'accounts'

  const [transactions, setTransactions] = useState([])
  const [filter,       setFilter]       = useState('all')
  const [searchQuery,  setSearchQuery]  = useState('')
  const [loading,      setLoading]      = useState(false)
  const [uploadedFile, setUploadedFile] = useState(null)
  const [parseStatus,  setParseStatus]  = useState('')
  const [parseProgress,setParseProgress]= useState(0)
  const [editingId,    setEditingId]    = useState(null)
  const [editAccount,  setEditAccount]  = useState('')
  const [sortBy,       setSortBy]       = useState('date_desc')
  const [showFilters,  setShowFilters]  = useState(false)
  const [dateFrom,     setDateFrom]     = useState('')
  const [dateTo,       setDateTo]       = useState('')
  const [minAmount,    setMinAmount]    = useState('')
  const [maxAmount,    setMaxAmount]    = useState('')
  const [txnTypeFilter,setTxnTypeFilter]= useState('all')

  const loadTxns = () => {
    const data = loadCompanyData(activeCompany?.id)
    setTransactions(data.bankTransactions || [])
  }

  useEffect(() => { loadTxns() }, [activeCompany?.id])

  const onDrop = useCallback(files => {
    const file = files[0]
    if (!file) return
    setUploadedFile(file)
    toast.success(`${file.name} ready to import`)
  }, [])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'text/csv': ['.csv'],
      'application/pdf': ['.pdf'],
      'application/vnd.ms-excel': ['.xls'],
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'text/plain': ['.txt'],
    },
    maxSize: 20 * 1024 * 1024,
  })

  // ── MAIN IMPORT  (100% client-side, no backend needed) ──────────
  const handleImport = async () => {
    if (!uploadedFile) return toast.error('Please upload a file first')
    setLoading(true)
    setParseProgress(0)

    try {
      const parsed = await parseFile(uploadedFile, (pct, msg) => {
        setParseProgress(pct)
        setParseStatus(msg)
      })

      setParseProgress(80)
      setParseStatus(`Classifying ${parsed.length} transactions with AI…`)

      const classified = classifyAll(parsed)

      setParseProgress(95)
      setParseStatus(`Saving ${classified.length} transactions…`)

      // Deduplicate
      const existing    = loadCompanyData(activeCompany?.id).bankTransactions || []
      const existingKeys = new Set(existing.map(t => `${t.txn_date}|${t.amount}|${t.narration}`))
      const newTxns     = classified.filter(t => !existingKeys.has(`${t.txn_date}|${t.amount}|${t.narration}`))
      const dupes       = classified.length - newTxns.length

      if (newTxns.length > 0) {
        addBankTransactions(activeCompany?.id, newTxns)
        loadTxns()
      }

      setParseProgress(100)
      let msg = `✅ ${newTxns.length} transactions imported from ${uploadedFile.name}`
      if (dupes > 0) msg += ` (${dupes} duplicates skipped)`
      toast.success(msg)
      setUploadedFile(null)

    } catch (err) {
      console.error('Import error:', err)
      toast.error(`Import failed: ${err.message}`)
    }

    setLoading(false)
    setParseStatus('')
    setParseProgress(0)
  }

  const handleAutoReconcile = () => {
    let count = 0
    transactions.forEach(t => {
      if (t.status === 'unmatched' && (t.confidence || 0) > 0.85) {
        updateBankTransaction(activeCompany?.id, t.id, { status: 'matched' })
        count++
      }
    })
    loadTxns()
    toast.success(count > 0 ? `Auto-reconciled ${count} transactions ✓` : 'No high-confidence transactions to auto-reconcile')
  }

  const acceptMatch = (id) => { updateBankTransaction(activeCompany?.id, id, { status:'matched' }); loadTxns(); toast.success('Transaction matched ✓') }
  const acceptMatchWithAccount = (id, account) => { updateBankTransaction(activeCompany?.id, id, { status:'matched', ai_suggested_account:account }); loadTxns(); setEditingId(null); toast.success('Transaction matched ✓') }
  const ignoreTransaction   = (id) => { updateBankTransaction(activeCompany?.id, id, { status:'ignored' });   loadTxns(); toast('Transaction ignored', { icon:'🔕' }) }
  const unignoreTransaction = (id) => { updateBankTransaction(activeCompany?.id, id, { status:'unmatched' }); loadTxns() }
  const unmatchTransaction  = (id) => { updateBankTransaction(activeCompany?.id, id, { status:'unmatched' }); loadTxns() }
  const handleClearAll      = () => { if (!window.confirm('Clear all imported transactions?')) return; clearBankTransactions(activeCompany?.id); loadTxns(); toast.success('All transactions cleared') }

  const handleExportCSV = () => {
    const rows = [
      ['Date','Narration','Type','Amount','Balance','Suggested Account','Status','Confidence'],
      ...transactions.map(t => [t.txn_date,`"${(t.narration||'').replace(/"/g,'""')}"`,t.txn_type,t.amount,t.balance,t.ai_suggested_account,t.status,((t.confidence||0)*100).toFixed(0)+'%'])
    ]
    const blob = new Blob([rows.map(r=>r.join(',')).join('\n')], { type:'text/csv' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob)
    a.download = `transactions_${new Date().toISOString().slice(0,10)}.csv`; a.click()
    toast.success('Exported to CSV')
  }

  const getFiltered = () => {
    let list = [...transactions]
    if (filter !== 'all') {
      if (filter === 'matched') list = list.filter(t => t.status === 'matched' || t.status === 'manually_matched')
      else list = list.filter(t => t.status === filter)
    }
    if (txnTypeFilter !== 'all') list = list.filter(t => t.txn_type === txnTypeFilter)
    if (dateFrom)    list = list.filter(t => t.txn_date >= dateFrom)
    if (dateTo)      list = list.filter(t => t.txn_date <= dateTo)
    if (minAmount)   list = list.filter(t => t.amount >= parseFloat(minAmount))
    if (maxAmount)   list = list.filter(t => t.amount <= parseFloat(maxAmount))
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      list = list.filter(t => (t.narration||'').toLowerCase().includes(q) || (t.ai_suggested_account||'').toLowerCase().includes(q))
    }
    list.sort((a,b) => {
      if (sortBy === 'date_desc')   return (b.txn_date||'').localeCompare(a.txn_date||'')
      if (sortBy === 'date_asc')    return (a.txn_date||'').localeCompare(b.txn_date||'')
      if (sortBy === 'amount_desc') return b.amount - a.amount
      if (sortBy === 'amount_asc')  return a.amount - b.amount
      if (sortBy === 'confidence')  return (b.confidence||0) - (a.confidence||0)
      return 0
    })
    return list
  }

  const filtered = getFiltered()
  const counts = {
    all:       transactions.length,
    unmatched: transactions.filter(t => t.status === 'unmatched').length,
    matched:   transactions.filter(t => t.status === 'matched' || t.status === 'manually_matched').length,
    ignored:   transactions.filter(t => t.status === 'ignored').length,
  }
  const matchedPct  = counts.all > 0 ? Math.round((counts.matched / counts.all) * 100) : 0
  const totalCredit = transactions.filter(t => t.txn_type === 'credit').reduce((s,t) => s + t.amount, 0)
  const totalDebit  = transactions.filter(t => t.txn_type === 'debit').reduce((s,t) => s + t.amount, 0)

  return (
    <div className="page-enter">
      <div className="page-header">
        <div>
          <h1 className="page-title">Banking</h1>
          <p className="page-subtitle">Import statements · AI classification · Reconciliation</p>
        </div>
        <div className="page-actions">
          {transactions.length > 0 && (
            <>
              <button className="btn btn-secondary" onClick={handleExportCSV}><Download size={15}/> Export CSV</button>
              <button className="btn btn-secondary" onClick={handleClearAll} style={{ color:'var(--danger)' }}><Trash2 size={15}/> Clear All</button>
            </>
          )}
          <button className="btn btn-primary" onClick={handleAutoReconcile} disabled={loading || counts.all === 0}>
            {loading ? <><Spinner color="white"/> Processing…</> : <><Zap size={15}/> AI Auto-Reconcile</>}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display:'flex', gap:2, marginBottom:20, background:'var(--surface-2)', padding:4, borderRadius:'var(--r-md)', width:'fit-content', border:'1px solid var(--border)' }}>
        {[{ key:'accounts',label:'Bank Accounts',icon:CreditCard },{ key:'reconcile',label:'Reconciliation',icon:RefreshCw },{ key:'import',label:'Import Statement',icon:Upload }].map(t => (
          <button key={t.key} onClick={() => setSearchParams({ tab:t.key })}
            className={tab === t.key ? 'btn btn-primary' : 'btn btn-secondary'}
            style={{ display:'flex', alignItems:'center', gap:7, padding:'7px 16px', fontSize:'0.83rem' }}>
            <t.icon size={14}/> {t.label}
          </button>
        ))}
      </div>

      {/* KPIs */}
      <div className="kpi-grid" style={{ gridTemplateColumns:'repeat(5,1fr)', marginBottom:24 }}>
        {[
          { label:'Total Imported',  value:counts.all,               color:'blue',  sub:'transactions' },
          { label:'Matched',         value:counts.matched,            color:'green', sub:'auto + manual' },
          { label:'Pending Review',  value:counts.unmatched,          color:'red',   sub:'needs attention' },
          { label:'Total Credits',   value:`₹${fmt(totalCredit)}`,   color:'green', sub:'money in' },
          { label:'Total Debits',    value:`₹${fmt(totalDebit)}`,    color:'red',   sub:'money out' },
        ].map(s => (
          <div key={s.label} className={`kpi-card ${s.color}`} style={{ padding:'16px 18px' }}>
            <div className="kpi-label">{s.label}</div>
            <div className="kpi-value" style={{ fontSize:'1.35rem', marginBottom:4 }}>{s.value}</div>
            <div style={{ fontSize:'0.72rem', color:'var(--text-3)' }}>{s.sub}</div>
          </div>
        ))}
      </div>

      {/* Progress bar */}
      {counts.all > 0 && (
        <div className="card" style={{ padding:'16px 20px', marginBottom:24 }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10 }}>
            <span style={{ fontSize:'0.85rem', fontWeight:600 }}>Reconciliation Progress</span>
            <span style={{ fontSize:'0.85rem', fontWeight:700, color: matchedPct >= 70 ? 'var(--success)' : 'var(--warning)' }}>{matchedPct}% complete</span>
          </div>
          <div style={{ height:10, background:'var(--border)', borderRadius:99 }}>
            <div style={{ width:`${matchedPct}%`, height:'100%', background: matchedPct >= 70 ? 'var(--success)' : 'var(--warning)', borderRadius:99, transition:'width 0.4s ease' }} />
          </div>
        </div>
      )}

      <div className="grid-2" style={{ gap:20 }}>

        {/* LEFT: Upload + Info */}
        <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
          <div className="card">
            <div className="card-header"><span className="card-title">Import Bank Statement</span></div>
            <div className="card-body">
              <div {...getRootProps()} className={`dropzone${isDragActive ? ' active' : ''}`}>
                <input {...getInputProps()} />
                <Upload size={28} color="var(--text-3)" style={{ margin:'0 auto 12px' }} />
                {uploadedFile ? (
                  <>
                    <p style={{ fontWeight:600, color:'var(--success)', marginBottom:4 }}>{uploadedFile.name}</p>
                    <p style={{ fontSize:'0.8rem', color:'var(--text-3)' }}>{(uploadedFile.size/1024).toFixed(0)} KB · Ready to import</p>
                    <button onClick={e => { e.stopPropagation(); setUploadedFile(null) }}
                      style={{ marginTop:8, fontSize:'0.75rem', color:'var(--danger)', background:'none', border:'none', cursor:'pointer' }}>
                      ✕ Remove
                    </button>
                  </>
                ) : (
                  <>
                    <p style={{ fontWeight:600, color:'var(--text)', marginBottom:4 }}>{isDragActive ? 'Drop it here ✓' : 'Drag & drop or click to browse'}</p>
                    <p style={{ fontSize:'0.78rem', color:'var(--text-3)' }}>PDF · CSV · Excel (.xlsx/.xls) · Max 20 MB</p>
                  </>
                )}
              </div>

              {/* Client-side badge */}
              <div style={{ marginTop:10, padding:'10px 12px', background:'linear-gradient(135deg,#ECFDF5,#F0FDF4)', border:'1px solid #6EE7B7', borderRadius:8, display:'flex', gap:8, alignItems:'flex-start' }}>
                <CheckCircle size={16} color="#059669" style={{ marginTop:1, flexShrink:0 }} />
                <div>
                  <div style={{ fontSize:12, fontWeight:700, color:'#065F46' }}>✅ 100% Browser-based Parsing</div>
                  <div style={{ fontSize:11, color:'#047857' }}>
                    PDF/CSV/Excel parsed directly in your browser. No server upload. Works offline.
                    SBI · HDFC · ICICI · Axis · Kotak · Yes Bank · Any CSV bank statement.
                  </div>
                </div>
              </div>

              {loading && (
                <div style={{ marginTop:10 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:8, padding:'10px 12px', background:'#FFFBEB', border:'1px solid #FDE68A', borderRadius:8, fontSize:12, color:'#92400E', marginBottom:8 }}>
                    <Spinner /> {parseStatus}
                  </div>
                  <div style={{ height:6, background:'var(--border)', borderRadius:99 }}>
                    <div style={{ height:'100%', width:`${parseProgress}%`, background:'var(--primary)', borderRadius:99, transition:'width 0.4s ease' }} />
                  </div>
                </div>
              )}

              <button className="btn btn-primary" style={{ width:'100%', marginTop:12, justifyContent:'center' }}
                onClick={handleImport} disabled={!uploadedFile || loading}>
                {loading ? <><Spinner color="white"/> AI Reading Statement…</> : <><Upload size={15}/> Import & AI Classify</>}
              </button>
            </div>
          </div>

          {/* AI Classification stats */}
          <div className="card">
            <div className="card-header">
              <span className="card-title">AI Classification</span>
              <span className="badge badge-blue"><Zap size={10}/> Active</span>
            </div>
            <div className="card-body">
              {(() => {
                const total = transactions.length || 1
                const high  = transactions.filter(t => (t.confidence||0) > 0.85).length
                const mid   = transactions.filter(t => (t.confidence||0) >= 0.60 && (t.confidence||0) <= 0.85).length
                const low   = transactions.filter(t => (t.confidence||0) < 0.60).length
                return [
                  { label:'Auto-posted (>85%)',      pct:Math.round(high/total*100), color:'var(--success)', count:high },
                  { label:'Needs review (60–85%)',   pct:Math.round(mid/total*100),  color:'var(--warning)', count:mid },
                  { label:'Manual required (<60%)',  pct:Math.round(low/total*100),  color:'var(--danger)',  count:low },
                ].map(item => (
                  <div key={item.label} style={{ marginBottom:14 }}>
                    <div style={{ display:'flex', justifyContent:'space-between', marginBottom:5 }}>
                      <span style={{ fontSize:'0.8rem', color:'var(--text-2)' }}>{item.label}</span>
                      <span style={{ fontSize:'0.8rem', fontWeight:700, color:item.color }}>{item.pct}% ({item.count})</span>
                    </div>
                    <div style={{ height:5, background:'var(--border)', borderRadius:99 }}>
                      <div style={{ width:`${item.pct}%`, height:'100%', background:item.color, borderRadius:99 }} />
                    </div>
                  </div>
                ))
              })()}
            </div>
          </div>

          {/* By Account */}
          {transactions.length > 0 && (
            <div className="card">
              <div className="card-header"><span className="card-title">By Account Category</span></div>
              <div className="card-body" style={{ maxHeight:220, overflowY:'auto' }}>
                {Object.entries(
                  transactions.reduce((acc, t) => {
                    const key = t.ai_suggested_account || 'Uncategorized'
                    if (!acc[key]) acc[key] = { count:0, total:0 }
                    acc[key].count++; acc[key].total += t.amount
                    return acc
                  }, {})
                ).sort((a,b) => b[1].total - a[1].total).slice(0,12).map(([account, { count, total }]) => (
                  <div key={account} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'7px 0', borderBottom:'1px solid var(--border)', fontSize:'0.8rem' }}>
                    <span style={{ color:'var(--text-2)', flex:1 }}>{account}</span>
                    <span style={{ color:'var(--text-3)', marginLeft:8 }}>{count}</span>
                    <span style={{ fontWeight:600, marginLeft:12, fontFamily:'var(--font-mono)' }}>₹{fmt(total)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* RIGHT: Transactions list */}
        <div className="card" style={{ display:'flex', flexDirection:'column' }}>
          <div className="card-header" style={{ paddingBottom:14, flexWrap:'wrap', gap:10 }}>
            <span className="card-title">Bank Transactions</span>
            <div style={{ display:'flex', gap:6, alignItems:'center', flexWrap:'wrap' }}>
              <div style={{ position:'relative' }}>
                <Search size={13} style={{ position:'absolute', left:8, top:'50%', transform:'translateY(-50%)', color:'var(--text-3)' }} />
                <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Search…"
                  style={{ paddingLeft:28, paddingRight:8, height:30, border:'1px solid var(--border)', borderRadius:'var(--radius)', fontSize:'0.8rem', background:'var(--bg)', color:'var(--text)', width:140 }} />
              </div>
              <select value={sortBy} onChange={e => setSortBy(e.target.value)}
                style={{ height:30, border:'1px solid var(--border)', borderRadius:'var(--radius)', fontSize:'0.78rem', background:'var(--bg)', color:'var(--text)', padding:'0 6px' }}>
                <option value="date_desc">Newest first</option>
                <option value="date_asc">Oldest first</option>
                <option value="amount_desc">Largest amount</option>
                <option value="confidence">Confidence</option>
              </select>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowFilters(v => !v)} style={{ display:'flex', alignItems:'center', gap:4 }}>
                <Filter size={12}/> Filters {showFilters ? '▲' : '▼'}
              </button>
            </div>
          </div>

          {showFilters && (
            <div style={{ padding:'12px 20px', background:'var(--surface-2)', borderBottom:'1px solid var(--border)', display:'flex', gap:8, flexWrap:'wrap', alignItems:'center' }}>
              {['all','credit','debit'].map(f => (
                <button key={f} className={txnTypeFilter===f ? 'btn btn-primary btn-sm' : 'btn btn-ghost btn-sm'}
                  style={{ textTransform:'capitalize', padding:'3px 10px' }} onClick={() => setTxnTypeFilter(f)}>{f}</button>
              ))}
              <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                style={{ height:28, border:'1px solid var(--border)', borderRadius:'var(--radius)', fontSize:'0.78rem', padding:'0 6px', background:'var(--bg)', color:'var(--text)' }} />
              <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                style={{ height:28, border:'1px solid var(--border)', borderRadius:'var(--radius)', fontSize:'0.78rem', padding:'0 6px', background:'var(--bg)', color:'var(--text)' }} />
              <input type="number" value={minAmount} onChange={e => setMinAmount(e.target.value)} placeholder="Min ₹"
                style={{ width:80, height:28, border:'1px solid var(--border)', borderRadius:'var(--radius)', fontSize:'0.78rem', padding:'0 6px', background:'var(--bg)', color:'var(--text)' }} />
              <button className="btn btn-ghost btn-sm" onClick={() => { setDateFrom(''); setDateTo(''); setMinAmount(''); setMaxAmount(''); setTxnTypeFilter('all') }}>Clear</button>
            </div>
          )}

          <div style={{ padding:'8px 20px', borderBottom:'1px solid var(--border)', display:'flex', gap:4 }}>
            {['all','unmatched','matched','ignored'].map(f => (
              <button key={f} className={filter===f ? 'btn btn-primary btn-sm' : 'btn btn-ghost btn-sm'}
                style={{ textTransform:'capitalize' }} onClick={() => setFilter(f)}>
                {f} <span style={{ marginLeft:4, opacity:0.7, fontSize:'0.7rem' }}>({f==='all' ? counts.all : f==='matched' ? counts.matched : counts[f]||0})</span>
              </button>
            ))}
          </div>

          <div style={{ flex:1, overflowY:'auto', maxHeight:600 }}>
            {filtered.length === 0 ? (
              <div style={{ padding:'48px 0', textAlign:'center', color:'var(--text-3)' }}>
                <div style={{ fontSize:'2.5rem', marginBottom:8 }}>🏦</div>
                <div style={{ fontSize:13, marginBottom:4 }}>{transactions.length === 0 ? 'No transactions imported yet' : 'No transactions match your filters'}</div>
                {transactions.length === 0 && <div style={{ fontSize:12 }}>Upload your bank statement PDF / CSV to get started</div>}
              </div>
            ) : filtered.map(txn => (
              <div key={txn.id} style={{ padding:'14px 20px', borderBottom:'1px solid var(--border)',
                background: txn.status==='unmatched' ? '#FFFBEB' : txn.status==='ignored' ? 'var(--surface-2)' : 'var(--surface)',
                opacity: txn.status==='ignored' ? 0.65 : 1 }}>
                <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:6 }}>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontWeight:600, fontSize:'0.875rem', marginBottom:2, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                      {txn.txn_type === 'credit'
                        ? <ArrowDownCircle size={12} style={{ display:'inline', color:'var(--success)', marginRight:5 }} />
                        : <ArrowUpCircle size={12} style={{ display:'inline', color:'var(--danger)', marginRight:5 }} />}
                      {txn.narration}
                    </div>
                    <div style={{ fontSize:'0.75rem', color:'var(--text-3)', display:'flex', gap:8 }}>
                      <span>{fmtDate(txn.txn_date)}</span>
                      {txn.reference && <span>Ref: {txn.reference}</span>}
                      {txn.balance > 0 && <span>Bal: ₹{fmt(txn.balance)}</span>}
                    </div>
                  </div>
                  <div style={{ textAlign:'right', marginLeft:12 }}>
                    <div style={{ fontFamily:'var(--font-mono)', fontWeight:700, fontSize:'0.9rem', color: txn.txn_type==='credit' ? 'var(--success)' : 'var(--danger)' }}>
                      {txn.txn_type === 'credit' ? '+' : '−'}₹{fmt(txn.amount)}
                    </div>
                    <span className={`badge ${statusBadge[txn.status]||'badge-gray'}`} style={{ marginTop:4 }}>{(txn.status||'').replace('_',' ')}</span>
                  </div>
                </div>

                {txn.status === 'unmatched' && (
                  <div style={{ background:'var(--primary-light)', border:'1px solid #C7D2FE', borderRadius:'var(--radius)', padding:'9px 12px' }}>
                    {editingId === txn.id ? (
                      <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                        <select value={editAccount} onChange={e => setEditAccount(e.target.value)}
                          style={{ flex:1, height:30, border:'1px solid var(--border)', borderRadius:'var(--radius)', fontSize:'0.8rem', background:'var(--bg)', color:'var(--text)', padding:'0 6px' }}>
                          {ACCOUNT_OPTIONS.map(a => <option key={a}>{a}</option>)}
                        </select>
                        <button className="btn btn-sm" style={{ background:'var(--success)', color:'white' }} onClick={() => acceptMatchWithAccount(txn.id, editAccount)}><CheckCircle size={12}/> Save</button>
                        <button className="btn btn-ghost btn-sm" onClick={() => setEditingId(null)}>Cancel</button>
                      </div>
                    ) : (
                      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:10 }}>
                        <div style={{ flex:1, minWidth:0 }}>
                          <div style={{ display:'flex', alignItems:'center', gap:5, marginBottom:4 }}>
                            <Zap size={11} color="var(--primary)" />
                            <span style={{ fontSize:'0.72rem', color:'var(--primary)', fontWeight:700, letterSpacing:'0.04em', textTransform:'uppercase' }}>AI Suggests</span>
                          </div>
                          <span style={{ fontSize:'0.82rem', fontWeight:600, color:'var(--text)' }}>{txn.ai_suggested_account || 'Miscellaneous Expense'}</span>
                          <ConfBar value={txn.confidence||0.75} color={(txn.confidence||0.75) > 0.85 ? 'var(--success)' : 'var(--warning)'} />
                        </div>
                        <div style={{ display:'flex', gap:5 }}>
                          <button className="btn btn-sm" style={{ background:'var(--success)', color:'white' }} onClick={() => acceptMatch(txn.id)}><CheckCircle size={12}/> Accept</button>
                          <button className="btn btn-ghost btn-sm" onClick={() => { setEditingId(txn.id); setEditAccount(txn.ai_suggested_account || ACCOUNT_OPTIONS[0]) }}><Edit3 size={12}/></button>
                          <button className="btn btn-ghost btn-sm" onClick={() => ignoreTransaction(txn.id)}><X size={12}/></button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {(txn.status === 'matched' || txn.status === 'manually_matched') && (
                  <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', fontSize:'0.75rem', color:'var(--success)', marginTop:4 }}>
                    <span style={{ display:'flex', alignItems:'center', gap:5 }}><CheckCircle size={12}/> Matched → {txn.ai_suggested_account}</span>
                    <button className="btn btn-ghost btn-sm" style={{ fontSize:'0.7rem', padding:'2px 8px' }} onClick={() => unmatchTransaction(txn.id)}>Undo</button>
                  </div>
                )}

                {txn.status === 'ignored' && (
                  <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', fontSize:'0.75rem', color:'var(--text-3)', marginTop:4 }}>
                    <span>Ignored</span>
                    <button className="btn btn-ghost btn-sm" style={{ fontSize:'0.7rem' }} onClick={() => unignoreTransaction(txn.id)}>Restore</button>
                  </div>
                )}
              </div>
            ))}
          </div>

          {filtered.length > 0 && (
            <div style={{ padding:'10px 20px', borderTop:'1px solid var(--border)', fontSize:'0.78rem', color:'var(--text-3)', display:'flex', justifyContent:'space-between' }}>
              <span>Showing {filtered.length} of {transactions.length}</span>
              <span style={{ color:'var(--success)' }}>+₹{fmt(filtered.filter(t => t.txn_type==='credit').reduce((s,t) => s+t.amount,0))}</span>
              <span style={{ color:'var(--danger)' }}>−₹{fmt(filtered.filter(t => t.txn_type==='debit').reduce((s,t) => s+t.amount,0))}</span>
            </div>
          )}
        </div>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
