// src/pages/Bank.jsx
// ═══════════════════════════════════════════════════════════════════════
// 100% CLIENT-SIDE PARSING — No backend / no pdfplumber needed.
// PDF.js (loaded from CDN) extracts text from the browser.
// SBI/HDFC/ICICI/Axis/Kotak PDF + CSV + Excel all parsed in JavaScript.
// ═══════════════════════════════════════════════════════════════════════
import { useState, useCallback, useEffect, useRef } from 'react'
import { useDropzone } from 'react-dropzone'
import { useSearchParams } from 'react-router-dom'
import {
  Upload, CheckCircle, X, Zap, RefreshCw, FileText,
  CreditCard, Brain, Download, Search,
  Filter, Edit3, Trash2, ArrowUpCircle, ArrowDownCircle, AlertCircle,
  Plus, Eye, Users, Hash, CreditCard as CardIcon, ChevronRight,
  Pencil, Settings, BookOpen, Building2, BookMarked, Send, Table2, FileScan
} from 'lucide-react'
import toast from 'react-hot-toast'
import { loadCompanyData, saveCompanyData, addBankTransactions, updateBankTransaction, clearBankTransactions,
  loadCustomHeads, addCustomHead, renameCustomHead, deleteCustomHead, addVoucher, addVouchers } from '../api/companyStore'
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
// SIMILARITY ENGINE  — finds transactions that look like the given one
// Checks: payment mode, party name keywords, amount proximity
// ════════════════════════════════════════════════════════════════════
function extractPaymentMode(narration) {
  const u = (narration || '').toUpperCase()
  if (u.includes('UPI'))                      return 'UPI'
  if (u.includes('NEFT'))                     return 'NEFT'
  if (u.includes('IMPS'))                     return 'IMPS'
  if (u.includes('RTGS'))                     return 'RTGS'
  if (u.includes('DEBIT CARD') || u.includes('OTHPG') || u.includes('BY DEBIT CARD')) return 'CARD'
  if (u.includes('ATM'))                      return 'ATM'
  if (u.includes('CASH'))                     return 'CASH'
  if (u.includes('CHEQUE') || u.includes('CHQ')) return 'CHEQUE'
  return 'OTHER'
}

function extractKeywords(narration) {
  return (narration || '').toUpperCase()
    .replace(/[^A-Z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 3 && !['WITH','FROM','NEFT','IMPS','RTGS','CARD','BANK','TRANS','TRANSFER','DEBIT','CREDIT'].includes(w))
}

function similarityScore(a, b) {
  if (a.txn_type !== b.txn_type) return 0

  let score = 0

  // Amount: exact match = 50pts, within 2% = 30pts, within 10% = 15pts
  const amtDiff = Math.abs(a.amount - b.amount) / Math.max(a.amount, 1)
  if (amtDiff === 0)       score += 50
  else if (amtDiff < 0.02) score += 30
  else if (amtDiff < 0.10) score += 15

  // Payment mode match = 25pts
  if (extractPaymentMode(a.narration) === extractPaymentMode(b.narration)) score += 25

  // Shared keywords
  const kA = extractKeywords(a.narration)
  const kB = extractKeywords(b.narration)
  const shared = kA.filter(w => kB.includes(w)).length
  score += Math.min(shared * 10, 30)

  return score
}

function findSimilarUnmatched(transactions, targetTxn) {
  return transactions.filter(t => {
    if (t.id === targetTxn.id) return false
    if (t.status !== 'unmatched') return false
    return similarityScore(t, targetTxn) >= 50   // threshold
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
const CUSTOM_SENTINEL = '__CUSTOM__'

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
  const [bankAccounts,   setBankAccounts]   = useState([])   // NEW: bank accounts registry
  const [filter,       setFilter]       = useState('all')
  const [searchQuery,  setSearchQuery]  = useState('')
  const [loading,      setLoading]      = useState(false)
  const [uploadedFile, setUploadedFile] = useState(null)
  const [parseStatus,  setParseStatus]  = useState('')
  const [parseProgress,setParseProgress]= useState(0)
  const [editingId,    setEditingId]    = useState(null)
  const [editAccount,  setEditAccount]  = useState('')
  const [customAccount,setCustomAccount]= useState('')
  const [showCustom,   setShowCustom]   = useState(false)
  const [selectedTxn,  setSelectedTxn]  = useState(null)
  const [similarApplied,setSimilarApplied]=useState(null)
  // ── Custom heads
  const [customHeads,  setCustomHeads]  = useState([])
  const [showManageHeads, setShowManageHeads] = useState(false)
  const [editingHead,  setEditingHead]  = useState(null)
  const [newHeadInput, setNewHeadInput] = useState('')
  const [sortBy,       setSortBy]       = useState('date_desc')
  const [showFilters,  setShowFilters]  = useState(false)
  const [dateFrom,     setDateFrom]     = useState('')
  const [dateTo,       setDateTo]       = useState('')
  const [minAmount,    setMinAmount]    = useState('')
  const [maxAmount,    setMaxAmount]    = useState('')
  const [txnTypeFilter,setTxnTypeFilter]= useState('all')
  // ── Bulk selection
  const [bulkMode,       setBulkMode]       = useState(false)
  const [selectedIds,    setSelectedIds]    = useState(new Set())
  const [bulkAccount,    setBulkAccount]    = useState(ACCOUNT_OPTIONS[0])
  const [bulkCustom,     setBulkCustom]     = useState('')
  const [showBulkCustom, setShowBulkCustom] = useState(false)
  const [showBulkPanel,  setShowBulkPanel]  = useState(false)
  // ── NEW: Post to Journal modal
  const [showPostJournal, setShowPostJournal] = useState(false)
  const [postingTxns,     setPostingTxns]     = useState([])
  const [postProgress,    setPostProgress]    = useState(0)
  const [postDone,        setPostDone]        = useState(false)
  // ── NEW: Bank Accounts modal
  const [showBankAccounts, setShowBankAccounts] = useState(false)
  const [newAccForm,       setNewAccForm]       = useState({ name:'', bankName:'', accountNo:'', ifsc:'', type:'current' })
  const [autoFillParsing, setAutoFillParsing] = useState(false)
  const autoFillInputRef = useRef(null)
  // ── NEW: XLS Bulk Import
  const [showXLSImport,   setShowXLSImport]   = useState(false)
  const [xlsFile,         setXLSFile]         = useState(null)
  const [xlsType,         setXLSType]         = useState('sales')
  const [xlsPreview,      setXLSPreview]      = useState(null)
  const [xlsImporting,    setXLSImporting]    = useState(false)

  const loadTxns = () => {
    const data = loadCompanyData(activeCompany?.id)
    setTransactions(data.bankTransactions || [])
    setCustomHeads(loadCustomHeads(activeCompany?.id))
    setBankAccounts(data.bankAccounts || [])
  }

  useEffect(() => { loadTxns() }, [activeCompany?.id])

  // All options = built-ins + company custom heads
  const allAccountOptions = [...ACCOUNT_OPTIONS, ...customHeads]

  const handleSaveCustomHead = (name) => {
    const trimmed = (name || '').trim()
    if (!trimmed) return toast.error('Head name cannot be empty')
    if (allAccountOptions.some(h => h.toLowerCase() === trimmed.toLowerCase()))
      return toast.error('This account head already exists')
    addCustomHead(activeCompany?.id, trimmed)
    setCustomHeads(loadCustomHeads(activeCompany?.id))
    toast.success(`"${trimmed}" added to account heads ✓`)
    return trimmed
  }

  const handleRenameHead = (original, newName) => {
    const trimmed = (newName || '').trim()
    if (!trimmed) return toast.error('Name cannot be empty')
    renameCustomHead(activeCompany?.id, original, trimmed)
    setCustomHeads(loadCustomHeads(activeCompany?.id))
    loadTxns()
    setEditingHead(null)
    toast.success(`Renamed to "${trimmed}" ✓`)
  }

  const handleDeleteHead = (head) => {
    if (!window.confirm(`Delete account head "${head}"? Transactions tagged with it won't be changed.`)) return
    deleteCustomHead(activeCompany?.id, head)
    setCustomHeads(loadCustomHeads(activeCompany?.id))
    toast.success(`"${head}" removed`)
  }

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

      // Auto-detect & suggest bank account
      if (newTxns.length > 0) {
        const detectedBank = detectBankFromStatement(newTxns)
        const data2 = loadCompanyData(activeCompany?.id)
        const existingAccts = data2.bankAccounts || []
        const alreadyExists = existingAccts.some(a => a.bankName === detectedBank)
        if (!alreadyExists) {
          toast((t2) => (
            <div style={{ fontSize: 13 }}>
              <strong>Detected: {detectedBank}</strong><br/>
              <span style={{ fontSize: 11, color: '#666' }}>Save as bank account?</span><br/>
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <button onClick={() => { saveBankAccount({ name: detectedBank, bankName: detectedBank, accountNo: '', ifsc: '', type: 'current' }); toast.dismiss(t2.id) }}
                  style={{ background: '#4F46E5', color: 'white', border: 'none', borderRadius: 6, padding: '4px 12px', cursor: 'pointer', fontSize: 12 }}>
                  Add Account
                </button>
                <button onClick={() => toast.dismiss(t2.id)}
                  style={{ background: '#E5E7EB', border: 'none', borderRadius: 6, padding: '4px 12px', cursor: 'pointer', fontSize: 12 }}>
                  Skip
                </button>
              </div>
            </div>
          ), { duration: 8000 })
        }
      }
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

  const acceptMatch = (id) => {
    const txn = transactions.find(t => t.id === id)
    updateBankTransaction(activeCompany?.id, id, { status:'matched' })
    // auto-apply to similar
    if (txn) {
      const similars = findSimilarUnmatched(transactions, txn)
      similars.forEach(s => updateBankTransaction(activeCompany?.id, s.id, { status:'matched', ai_suggested_account: txn.ai_suggested_account }))
      if (similars.length > 0) setSimilarApplied({ count: similars.length, account: txn.ai_suggested_account })
    }
    loadTxns()
    toast.success('Transaction matched ✓')
  }

  const acceptMatchWithAccount = (id, account) => {
    const resolvedAccount = (account === CUSTOM_SENTINEL || !account) ? customAccount : account
    if (!resolvedAccount.trim()) return toast.error('Please enter an account name')
    // Persist custom head if it's not in existing options
    if (!allAccountOptions.includes(resolvedAccount.trim())) {
      addCustomHead(activeCompany?.id, resolvedAccount.trim())
      setCustomHeads(loadCustomHeads(activeCompany?.id))
    }
    const txn = transactions.find(t => t.id === id)
    updateBankTransaction(activeCompany?.id, id, { status:'matched', ai_suggested_account: resolvedAccount })
    // auto-apply to similar
    if (txn) {
      const similars = findSimilarUnmatched(transactions, txn)
      similars.forEach(s => updateBankTransaction(activeCompany?.id, s.id, { status:'matched', ai_suggested_account: resolvedAccount }))
      if (similars.length > 0) setSimilarApplied({ count: similars.length, account: resolvedAccount })
    }
    loadTxns()
    setEditingId(null)
    setShowCustom(false)
    setCustomAccount('')
    toast.success('Transaction matched ✓')
  }
  const ignoreTransaction   = (id) => { updateBankTransaction(activeCompany?.id, id, { status:'ignored' });   loadTxns(); toast('Transaction ignored', { icon:'🔕' }) }
  const unignoreTransaction = (id) => { updateBankTransaction(activeCompany?.id, id, { status:'unmatched' }); loadTxns() }
  const unmatchTransaction  = (id) => { updateBankTransaction(activeCompany?.id, id, { status:'unmatched' }); loadTxns() }

  const flipTransactionSign = (txn) => {
    const newType = txn.txn_type === 'credit' ? 'debit' : 'credit'
    updateBankTransaction(activeCompany?.id, txn.id, { txn_type: newType, status: 'unmatched' })
    loadTxns()
    toast.success(`Flipped to ${newType === 'credit' ? '+ Credit (Income)' : '− Debit (Expense)'}`, { icon: '🔄' })
  }
  const handleClearAll      = () => { if (!window.confirm('Clear all imported transactions?')) return; clearBankTransactions(activeCompany?.id); loadTxns(); toast.success('All transactions cleared') }

  const openTxnDetail  = (txn) => setSelectedTxn(txn)
  const closeDetail    = ()    => setSelectedTxn(null)
  const startEditing   = (txn) => {
    setEditingId(txn.id)
    setShowCustom(false)
    setCustomAccount('')
    const suggested = txn.ai_suggested_account || ACCOUNT_OPTIONS[0]
    setEditAccount(allAccountOptions.includes(suggested) ? suggested : CUSTOM_SENTINEL)
    if (!allAccountOptions.includes(suggested)) { setShowCustom(true); setCustomAccount(suggested) }
  }

  const handleSelectChange = (val) => {
    setEditAccount(val)
    setShowCustom(val === CUSTOM_SENTINEL)
    if (val !== CUSTOM_SENTINEL) setCustomAccount('')
  }

  // ── BULK HELPERS ─────────────────────────────────────────────────
  const toggleBulkMode = () => {
    setBulkMode(v => !v)
    setSelectedIds(new Set())
    setShowBulkPanel(false)
  }

  const toggleSelect = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const selectAll = () => setSelectedIds(new Set(filtered.map(t => t.id)))
  const deselectAll = () => setSelectedIds(new Set())

  const handleBulkSelectChange = (val) => {
    setBulkAccount(val)
    setShowBulkCustom(val === CUSTOM_SENTINEL)
    if (val !== CUSTOM_SENTINEL) setBulkCustom('')
  }

  const handleBulkApply = (action) => {
    if (selectedIds.size === 0) return toast.error('Select at least one transaction')
    const ids = [...selectedIds]

    if (action === 'change_head') {
      const head = showBulkCustom ? bulkCustom.trim() : bulkAccount
      if (!head) return toast.error('Select an account head')
      // Persist custom head if new
      if (!allAccountOptions.includes(head)) {
        addCustomHead(activeCompany?.id, head)
        setCustomHeads(loadCustomHeads(activeCompany?.id))
      }
      ids.forEach(id => updateBankTransaction(activeCompany?.id, id, { ai_suggested_account: head }))
      toast.success(`Account head updated for ${ids.length} transaction${ids.length > 1 ? 's' : ''} ✓`)
    } else if (action === 'match') {
      ids.forEach(id => updateBankTransaction(activeCompany?.id, id, { status: 'matched' }))
      toast.success(`Matched ${ids.length} transaction${ids.length > 1 ? 's' : ''} ✓`)
    } else if (action === 'ignore') {
      ids.forEach(id => updateBankTransaction(activeCompany?.id, id, { status: 'ignored' }))
      toast(`Ignored ${ids.length} transaction${ids.length > 1 ? 's' : ''}`, { icon: '🔕' })
    } else if (action === 'unmatch') {
      ids.forEach(id => updateBankTransaction(activeCompany?.id, id, { status: 'unmatched' }))
      toast.success(`Unmatched ${ids.length} transaction${ids.length > 1 ? 's' : ''}`)
    } else if (action === 'match_with_head') {
      const head = showBulkCustom ? bulkCustom.trim() : bulkAccount
      if (!head) return toast.error('Select an account head')
      if (!allAccountOptions.includes(head)) {
        addCustomHead(activeCompany?.id, head)
        setCustomHeads(loadCustomHeads(activeCompany?.id))
      }
      ids.forEach(id => updateBankTransaction(activeCompany?.id, id, { status: 'matched', ai_suggested_account: head }))
      toast.success(`Matched & categorised ${ids.length} transaction${ids.length > 1 ? 's' : ''} ✓`)
    }

    loadTxns()
    setSelectedIds(new Set())
    setShowBulkPanel(false)
  }

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

  // ── NEW: Save bank account ────────────────────────────────────────
  const saveBankAccount = (acc) => {
    const data = loadCompanyData(activeCompany?.id)
    const existing = data.bankAccounts || []
    const newAcc = { ...acc, id: `ba-${Date.now()}`, addedAt: new Date().toISOString() }
    data.bankAccounts = [...existing, newAcc]
    saveCompanyData(activeCompany?.id, data)
    loadTxns()
    toast.success(`Bank account "${acc.name}" added ✓`)
    setNewAccForm({ name:'', bankName:'', accountNo:'', ifsc:'', type:'current' })
  }

  const detectBankFromStatement = (txns) => {
    // Auto-detect bank name from narration patterns
    const sample = txns.slice(0, 10).map(t => t.narration.toUpperCase()).join(' ')
    let bankName = 'Unknown Bank'
    if (sample.includes('SBI') || sample.includes('STATE BANK'))   bankName = 'State Bank of India'
    if (sample.includes('HDFC'))  bankName = 'HDFC Bank'
    if (sample.includes('ICICI')) bankName = 'ICICI Bank'
    if (sample.includes('AXIS'))  bankName = 'Axis Bank'
    if (sample.includes('KOTAK')) bankName = 'Kotak Mahindra Bank'
    if (sample.includes('YES'))   bankName = 'Yes Bank'
    if (sample.includes('INDUS')) bankName = 'IndusInd Bank'
    if (sample.includes('PNB'))   bankName = 'Punjab National Bank'
    return bankName
  }

  // ── Parse account header details from a bank statement PDF ───────
  const parseAccountDetailsFromPDF = async (file) => {
    setAutoFillParsing(true)
    try {
      const buf  = await file.arrayBuffer()
      const text = await extractPDFText(new Uint8Array(buf))
      const lines = text.split('\n').map(l => l.trim()).filter(Boolean)
      const full  = lines.join(' ')

      const result = { name:'', bankName:'', accountNo:'', ifsc:'', type:'current' }

      // ── Account Number ── 12-18 digit number that follows "Account Number"
      const accNoMatch = full.match(/account\s*number\s*[:\-]?\s*(\d{9,18})/i)
      if (accNoMatch) result.accountNo = accNoMatch[1]

      // ── IFSC ── standard 11-char IFSC format
      const ifscMatch = full.match(/\b(IFS\s*(?:C(?:ode)?)?|IFC|IFSC)[:\s]*([A-Z]{4}0[A-Z0-9]{6})\b/i)
                     || full.match(/\b([A-Z]{4}0[A-Z0-9]{6})\b/)
      if (ifscMatch) result.ifsc = (ifscMatch[2] || ifscMatch[1]).replace(/\s/g,'').toUpperCase()

      // ── Account Type ── look for keywords near "Account Type"
      const accTypeMatch = full.match(/account\s*type\s*[:\-]?\s*(current|savings|cash\s*credit|overdraft|od|cc|sb|ca)/i)
      if (accTypeMatch) {
        const t = accTypeMatch[1].toLowerCase()
        if (t.includes('current') || t === 'ca') result.type = 'current'
        else if (t.includes('saving') || t === 'sb') result.type = 'savings'
        else if (t.includes('overdraft') || t === 'od') result.type = 'od'
        else if (t.includes('cash') || t === 'cc') result.type = 'cc'
      }

      // ── Bank Name ── from IFSC prefix or header keywords
      const ifscPrefix = result.ifsc?.slice(0,4).toUpperCase()
      const BANK_IFSC = {
        SBIN:'State Bank of India', HDFC:'HDFC Bank', ICIC:'ICICI Bank',
        UTIB:'Axis Bank', KKBK:'Kotak Mahindra Bank', YESB:'Yes Bank',
        BARB:'Bank of Baroda', PUNB:'Punjab National Bank', CNRB:'Canara Bank',
        UBIN:'Union Bank of India', IDFB:'IDFC First Bank', INDB:'IndusInd Bank',
        UCBA:'UCO Bank', BKID:'Bank of India', MAHB:'Bank of Maharashtra',
      }
      if (ifscPrefix && BANK_IFSC[ifscPrefix]) result.bankName = BANK_IFSC[ifscPrefix]
      else {
        // Fallback: scan header text
        if (/state bank/i.test(full))   result.bankName = 'State Bank of India'
        else if (/hdfc/i.test(full))    result.bankName = 'HDFC Bank'
        else if (/icici/i.test(full))   result.bankName = 'ICICI Bank'
        else if (/axis\s*bank/i.test(full))  result.bankName = 'Axis Bank'
        else if (/kotak/i.test(full))   result.bankName = 'Kotak Mahindra Bank'
        else if (/yes\s*bank/i.test(full))   result.bankName = 'Yes Bank'
        else if (/punjab\s*national/i.test(full)) result.bankName = 'Punjab National Bank'
        else if (/bank of baroda/i.test(full))    result.bankName = 'Bank of Baroda'
        else if (/canara/i.test(full))  result.bankName = 'Canara Bank'
        else if (/idfc/i.test(full))    result.bankName = 'IDFC First Bank'
        else if (/indusind/i.test(full)) result.bankName = 'IndusInd Bank'
      }

      // ── Account Name (label) ── "Account Name" line or company name
      const accNameMatch = full.match(/account\s*name\s*[:\-]?\s*([A-Z][A-Za-z0-9 &.,'\-]{3,60}?)(?:\s{2,}|Address|Branch|Date|Account)/i)
      if (accNameMatch) {
        result.name = accNameMatch[1].trim()
      } else {
        // Derive a short label from bank + type
        result.name = result.bankName
          ? `${result.bankName.split(' ')[0]} ${result.type === 'savings' ? 'Savings' : 'Current'}`
          : 'Main Account'
      }

      // ── Branch name from MICR / Branch field ──
      const branchMatch = full.match(/branch\s*[:\-]?\s*([A-Z][A-Za-z0-9 ()]{3,40})(?:\s{2,}|\()/i)
      // (branch is informational only, not stored in form)

      const filled = [result.accountNo, result.ifsc, result.bankName].filter(Boolean).length
      if (filled === 0) {
        toast.error('Could not extract account details. Ensure this is a text-based bank statement PDF.')
      } else {
        toast.success(`Auto-filled ${filled + (result.name ? 1 : 0)} fields from statement ✓`)
        setNewAccForm(result)
      }
    } catch (err) {
      toast.error('Failed to read PDF: ' + err.message)
    } finally {
      setAutoFillParsing(false)
    }
  }

  // ── NEW: Post matched transactions to Journal ─────────────────────
  const handlePostToJournal = async () => {
    const matched = transactions.filter(t => (t.status === 'matched' || t.status === 'manually_matched') && !t.journal_posted)
    if (matched.length === 0) { toast.error('No matched transactions to post. Match transactions first.'); return }
    setPostingTxns(matched)
    setPostDone(false)
    setPostProgress(0)
    setShowPostJournal(true)
  }

  const confirmPostToJournal = async () => {
    setXLSImporting(true)
    let posted = 0
    for (let i = 0; i < postingTxns.length; i++) {
      const t = postingTxns[i]
      const isCredit = t.txn_type === 'credit'
      addVoucher(activeCompany?.id, {
        voucher_type: isCredit ? 'receipt' : 'payment',
        date:         t.txn_date,
        reference:    t.reference || '',
        party:        '',
        narration:    t.narration.substring(0, 200),
        amount:       t.amount,
        cgst:         0, sgst: 0, igst: 0,
        source:       'bank_import',
        debit_account:  isCredit ? 'Bank Account' : (t.ai_suggested_account || 'Miscellaneous Expense'),
        credit_account: isCredit ? (t.ai_suggested_account || 'Miscellaneous Income') : 'Bank Account',
        bank_txn_id:  t.id,
      })
      // Mark as journal_posted
      updateBankTransaction(activeCompany?.id, t.id, { journal_posted: true })
      posted++
      setPostProgress(Math.round((i + 1) / postingTxns.length * 100))
      await new Promise(r => setTimeout(r, 30))
    }
    loadTxns()
    setPostDone(true)
    setXLSImporting(false)
    toast.success(`${posted} journal entries created ✓`)
  }

  // ── NEW: XLS Bulk Import (Sales/Purchase) ─────────────────────────
  const handleXLSFile = async (file) => {
    if (!file) return
    setXLSFile(file)
    setXLSPreview(null)
    try {
      if (!window.XLSX) {
        await new Promise((res, rej) => {
          const s = document.createElement('script')
          s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js'
          s.onload = res; s.onerror = rej
          document.head.appendChild(s)
        })
      }
      const buf = await file.arrayBuffer()
      const wb  = window.XLSX.read(new Uint8Array(buf), { type: 'array' })
      const ws  = wb.Sheets[wb.SheetNames[0]]
      const rows = window.XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })

      // Find header row (look for Date column)
      let headerIdx = -1
      for (let i = 0; i < Math.min(10, rows.length); i++) {
        const row = rows[i].map(c => String(c).toLowerCase())
        if (row.some(c => c.includes('date')) && row.some(c => c.includes('party') || c.includes('invoice') || c.includes('amount'))) {
          headerIdx = i; break
        }
      }

      if (headerIdx === -1) {
        toast.error('Could not detect header row. Expected columns: Date, Party Name, Invoice No, Amount.')
        return
      }

      const headers = rows[headerIdx].map(c => String(c).toLowerCase().trim())
      const findCol = (keys) => keys.reduce((f, k) => f !== -1 ? f : headers.findIndex(h => h.includes(k)), -1)

      const cols = {
        date:    findCol(['date']),
        party:   findCol(['party name', 'party', 'customer', 'vendor', 'supplier']),
        invoice: findCol(['invoice no', 'invoice', 'voucher']),
        amount:  findCol(['total amount', 'amount']),
        gst:     findCol(['gst', 'cgst', 'tax']),
        status:  findCol(['payment status', 'status']),
        type:    findCol(['transaction type', 'type']),
      }

      const dataRows = rows.slice(headerIdx + 1).filter(r => r.some(c => c !== ''))
      const parsed = dataRows.map((r, idx) => ({
        _idx: idx,
        date:    String(r[cols.date] || '').trim(),
        party:   String(r[cols.party] || '').trim(),
        invoice: String(r[cols.invoice] || '').trim(),
        amount:  parseFloat(String(r[cols.amount] || '0').replace(/[₹,]/g, '')) || 0,
        status:  String(r[cols.status] || 'Unpaid').trim(),
        type:    String(r[cols.type] || xlsType).trim(),
      })).filter(r => r.date && r.amount > 0)

      setXLSPreview({ headers: rows[headerIdx], rows: parsed, cols, total: parsed.reduce((s, r) => s + r.amount, 0) })
      toast.success(`Found ${parsed.length} records in ${file.name}`)
    } catch (err) {
      toast.error('Could not parse file: ' + err.message)
    }
  }

  const handleXLSImport = async () => {
    if (!xlsPreview) return
    setXLSImporting(true)
    let count = 0
    for (const row of xlsPreview.rows) {
      const vType = xlsType === 'sales' ? 'sales' : xlsType === 'purchase' ? 'purchase' : 'journal'
      // Parse date
      let dateStr = row.date
      const parsed = parseDate(dateStr)
      if (parsed) dateStr = parsed

      addVoucher(activeCompany?.id, {
        voucher_type: vType,
        date:         dateStr || new Date().toISOString().slice(0,10),
        reference:    row.invoice,
        party:        row.party,
        narration:    `${vType.charAt(0).toUpperCase()+vType.slice(1)} - ${row.party} - ${row.invoice}`,
        amount:       row.amount,
        cgst:         0, sgst: 0, igst: 0,
        source:       'xls_import',
      })
      count++
      await new Promise(r => setTimeout(r, 10))
    }
    loadTxns()
    setXLSImporting(false)
    setXLSPreview(null)
    setXLSFile(null)
    setShowXLSImport(false)
    toast.success(`✅ ${count} ${xlsType} vouchers imported from ${xlsFile?.name}`)
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
          <button className="btn btn-secondary" onClick={() => setShowXLSImport(true)} style={{ display:'flex', alignItems:'center', gap:6 }}>
            <Table2 size={15}/> Bulk XLS Import
          </button>
          <button className="btn btn-secondary" onClick={() => setShowBankAccounts(true)} style={{ display:'flex', alignItems:'center', gap:6 }}>
            <Building2 size={15}/> Bank Accounts {bankAccounts.length > 0 && <span style={{ background:'var(--primary)', color:'white', borderRadius:999, fontSize:'0.65rem', padding:'1px 6px' }}>{bankAccounts.length}</span>}
          </button>
          <button className="btn btn-secondary" onClick={() => setShowManageHeads(true)} style={{ display:'flex', alignItems:'center', gap:6 }}>
            <BookOpen size={15}/> Account Heads {customHeads.length > 0 && <span style={{ background:'var(--primary)', color:'white', borderRadius:999, fontSize:'0.65rem', padding:'1px 6px' }}>{customHeads.length}</span>}
          </button>
          {transactions.filter(t => (t.status==='matched'||t.status==='manually_matched') && !t.journal_posted).length > 0 && (
            <button className="btn btn-secondary" onClick={handlePostToJournal} style={{ display:'flex', alignItems:'center', gap:6, color:'var(--success)', borderColor:'var(--success)' }}>
              <BookMarked size={15}/> Post to Journal ({transactions.filter(t => (t.status==='matched'||t.status==='manually_matched') && !t.journal_posted).length})
            </button>
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
              <button
                className={bulkMode ? 'btn btn-primary btn-sm' : 'btn btn-ghost btn-sm'}
                onClick={toggleBulkMode}
                style={{ display:'flex', alignItems:'center', gap:4 }}>
                <CheckCircle size={12}/> {bulkMode ? `Bulk (${selectedIds.size})` : 'Bulk'}
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

          {/* ── BULK ACTION BAR ── */}
          {bulkMode && (
            <div style={{ padding:'10px 16px', background:'#EEF2FF', borderBottom:'1px solid #C7D2FE', display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
              {/* Select all / none */}
              <input type="checkbox"
                checked={filtered.length > 0 && selectedIds.size === filtered.length}
                ref={el => { if (el) el.indeterminate = selectedIds.size > 0 && selectedIds.size < filtered.length }}
                onChange={e => e.target.checked ? selectAll() : deselectAll()}
                style={{ width:15, height:15, cursor:'pointer', accentColor:'var(--primary)' }} />
              <span style={{ fontSize:'0.78rem', color:'var(--primary)', fontWeight:600, minWidth:70 }}>
                {selectedIds.size === 0 ? 'Select all' : `${selectedIds.size} selected`}
              </span>

              {selectedIds.size > 0 && (
                <>
                  <div style={{ width:1, height:20, background:'#C7D2FE' }} />

                  {/* Quick actions */}
                  <button className="btn btn-sm" style={{ background:'var(--success)', color:'white', gap:4, display:'flex', alignItems:'center' }}
                    onClick={() => handleBulkApply('match')}><CheckCircle size={11}/> Match All</button>
                  <button className="btn btn-ghost btn-sm" style={{ gap:4, display:'flex', alignItems:'center' }}
                    onClick={() => handleBulkApply('ignore')}><X size={11}/> Ignore All</button>
                  <button className="btn btn-ghost btn-sm" style={{ gap:4, display:'flex', alignItems:'center' }}
                    onClick={() => handleBulkApply('unmatch')}><RefreshCw size={11}/> Unmatch All</button>

                  <div style={{ width:1, height:20, background:'#C7D2FE' }} />

                  {/* Change head */}
                  <button className="btn btn-sm" style={{ background:'var(--primary)', color:'white', gap:4, display:'flex', alignItems:'center' }}
                    onClick={() => setShowBulkPanel(v => !v)}>
                    <Edit3 size={11}/> Change Head {showBulkPanel ? '▲' : '▼'}
                  </button>

                  <button className="btn btn-ghost btn-sm" style={{ marginLeft:'auto' }} onClick={deselectAll}>Clear</button>
                </>
              )}
            </div>
          )}

          {/* ── BULK HEAD PANEL ── */}
          {bulkMode && showBulkPanel && selectedIds.size > 0 && (
            <div style={{ padding:'12px 16px', background:'#F5F3FF', borderBottom:'1px solid #DDD6FE', display:'flex', flexDirection:'column', gap:10 }}>
              <div style={{ fontSize:'0.75rem', fontWeight:700, color:'var(--primary)', textTransform:'uppercase', letterSpacing:'0.04em' }}>
                Assign Account Head to {selectedIds.size} transaction{selectedIds.size > 1 ? 's' : ''}
              </div>
              <div style={{ display:'flex', gap:8, flexWrap:'wrap', alignItems:'flex-start' }}>
                <div style={{ flex:1, minWidth:200 }}>
                  <select value={bulkAccount} onChange={e => handleBulkSelectChange(e.target.value)}
                    style={{ width:'100%', height:32, border:'1px solid #C4B5FD', borderRadius:'var(--radius)', fontSize:'0.82rem', background:'white', color:'var(--text)', padding:'0 8px' }}>
                    {ACCOUNT_OPTIONS.map(a => <option key={a} value={a}>{a}</option>)}
                    {customHeads.length > 0 && <option disabled>── Custom Heads ──</option>}
                    {customHeads.map(a => <option key={a} value={a}>⭐ {a}</option>)}
                    <option value={CUSTOM_SENTINEL}>➕ Add New Custom Head…</option>
                  </select>
                  {showBulkCustom && (
                    <input autoFocus value={bulkCustom} onChange={e => setBulkCustom(e.target.value)}
                      placeholder="Type custom account head…"
                      style={{ width:'100%', marginTop:6, height:32, border:'1px solid var(--primary)', borderRadius:'var(--radius)', fontSize:'0.82rem', background:'white', color:'var(--text)', padding:'0 8px', boxSizing:'border-box' }} />
                  )}
                </div>
                <div style={{ display:'flex', gap:6 }}>
                  <button className="btn btn-sm" style={{ background:'#7C3AED', color:'white', gap:4, display:'flex', alignItems:'center' }}
                    onClick={() => handleBulkApply('change_head')}>
                    <Edit3 size={11}/> Update Head Only
                  </button>
                  <button className="btn btn-sm" style={{ background:'var(--success)', color:'white', gap:4, display:'flex', alignItems:'center' }}
                    onClick={() => handleBulkApply('match_with_head')}>
                    <CheckCircle size={11}/> Match + Set Head
                  </button>
                  <button className="btn btn-ghost btn-sm" onClick={() => setShowBulkPanel(false)}>Cancel</button>
                </div>
              </div>
            </div>
          )}

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
                  <div style={{ flex:1, minWidth:0, cursor:'pointer' }} onClick={() => openTxnDetail(txn)}>
                    <div style={{ fontWeight:600, fontSize:'0.875rem', marginBottom:2, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', display:'flex', alignItems:'center', gap:5 }}>
                      {txn.txn_type === 'credit'
                        ? <ArrowDownCircle size={12} style={{ display:'inline', color:'var(--success)', flexShrink:0 }} />
                        : <ArrowUpCircle size={12} style={{ display:'inline', color:'var(--danger)', flexShrink:0 }} />}
                      <span style={{ flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{txn.narration}</span>
                      <ChevronRight size={11} style={{ color:'var(--text-3)', flexShrink:0 }} />
                    </div>
                    <div style={{ fontSize:'0.75rem', color:'var(--text-3)', display:'flex', gap:8 }}>
                      <span>{fmtDate(txn.txn_date)}</span>
                      {txn.reference && <span>Ref: {txn.reference}</span>}
                      {txn.balance > 0 && <span>Bal: ₹{fmt(txn.balance)}</span>}
                      <span style={{ background:'var(--border)', borderRadius:4, padding:'0 5px', fontSize:'0.68rem', letterSpacing:'0.03em' }}>{extractPaymentMode(txn.narration)}</span>
                    </div>
                  </div>
                  <div style={{ textAlign:'right', marginLeft:12 }}>
                    <div style={{ fontFamily:'var(--font-mono)', fontWeight:700, fontSize:'0.9rem', color: txn.txn_type==='credit' ? 'var(--success)' : 'var(--danger)', display:'flex', alignItems:'center', gap:5, justifyContent:'flex-end' }}>
                      {txn.txn_type === 'credit' ? '+' : '−'}₹{fmt(txn.amount)}
                      <button
                        title="Flip sign (fix parsing error)"
                        onClick={e => { e.stopPropagation(); flipTransactionSign(txn) }}
                        style={{
                          width:18, height:18, borderRadius:'50%', border:'1px solid currentColor',
                          background:'transparent', cursor:'pointer', display:'flex', alignItems:'center',
                          justifyContent:'center', opacity:0.45, padding:0, flexShrink:0,
                          color: txn.txn_type==='credit' ? 'var(--success)' : 'var(--danger)',
                          transition:'opacity .15s'
                        }}
                        onMouseEnter={e => e.currentTarget.style.opacity='1'}
                        onMouseLeave={e => e.currentTarget.style.opacity='0.45'}
                      >
                        <RefreshCw size={9}/>
                      </button>
                    </div>
                    <span className={`badge ${statusBadge[txn.status]||'badge-gray'}`} style={{ marginTop:4 }}>{(txn.status||'').replace('_',' ')}</span>
                  </div>
                </div>

                {txn.status === 'unmatched' && (
                  <div style={{ background:'var(--primary-light)', border:'1px solid #C7D2FE', borderRadius:'var(--radius)', padding:'9px 12px' }}>
                    {editingId === txn.id ? (
                      <div>
                        <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom: showCustom ? 8 : 0 }}>
                          <select value={editAccount} onChange={e => handleSelectChange(e.target.value)}
                            style={{ flex:1, height:30, border:'1px solid var(--border)', borderRadius:'var(--radius)', fontSize:'0.8rem', background:'var(--bg)', color:'var(--text)', padding:'0 6px' }}>
                            {ACCOUNT_OPTIONS.map(a => <option key={a} value={a}>{a}</option>)}
                            {customHeads.length > 0 && <option disabled>── Custom Heads ──</option>}
                            {customHeads.map(a => <option key={a} value={a}>⭐ {a}</option>)}
                            <option value={CUSTOM_SENTINEL}>➕ Add New Custom Head…</option>
                          </select>
                          {!showCustom && (
                            <>
                              <button className="btn btn-sm" style={{ background:'var(--success)', color:'white' }} onClick={() => acceptMatchWithAccount(txn.id, editAccount)}><CheckCircle size={12}/> Save</button>
                              <button className="btn btn-ghost btn-sm" onClick={() => { setEditingId(null); setShowCustom(false); setCustomAccount('') }}>Cancel</button>
                            </>
                          )}
                        </div>
                        {showCustom && (
                          <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                            <input autoFocus value={customAccount} onChange={e => setCustomAccount(e.target.value)}
                              placeholder="Type your custom account head…"
                              style={{ flex:1, height:30, border:'1px solid var(--primary)', borderRadius:'var(--radius)', fontSize:'0.8rem', background:'var(--bg)', color:'var(--text)', padding:'0 8px' }} />
                            <button className="btn btn-sm" style={{ background:'var(--success)', color:'white' }} onClick={() => acceptMatchWithAccount(txn.id, CUSTOM_SENTINEL)}><CheckCircle size={12}/> Save</button>
                            <button className="btn btn-ghost btn-sm" onClick={() => { setEditingId(null); setShowCustom(false); setCustomAccount('') }}>Cancel</button>
                          </div>
                        )}
                        {/* Similarity preview */}
                        {(() => {
                          const sims = findSimilarUnmatched(transactions, txn)
                          return sims.length > 0 ? (
                            <div style={{ marginTop:8, fontSize:'0.72rem', color:'var(--primary)', display:'flex', alignItems:'center', gap:5, padding:'4px 8px', background:'#EEF2FF', borderRadius:6 }}>
                              <Users size={10}/> Saving will also match {sims.length} similar transaction{sims.length > 1 ? 's' : ''} automatically
                            </div>
                          ) : null
                        })()}
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
                          <button className="btn btn-ghost btn-sm" onClick={() => startEditing(txn)}><Edit3 size={12}/></button>
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

      {/* ── MANAGE ACCOUNT HEADS MODAL ───────────────────────────── */}
      {showManageHeads && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.45)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}
          onClick={() => { setShowManageHeads(false); setEditingHead(null); setNewHeadInput('') }}>
          <div style={{ background:'var(--surface)', borderRadius:16, width:'100%', maxWidth:540, boxShadow:'0 24px 80px rgba(0,0,0,0.22)', overflow:'hidden', maxHeight:'85vh', display:'flex', flexDirection:'column' }}
            onClick={e => e.stopPropagation()}>

            {/* Header */}
            <div style={{ padding:'18px 22px', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', justifyContent:'space-between', background:'linear-gradient(135deg,#EEF2FF,#F5F3FF)' }}>
              <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                <BookOpen size={20} color="var(--primary)" />
                <div>
                  <div style={{ fontWeight:700, fontSize:'1rem' }}>Account Heads</div>
                  <div style={{ fontSize:'0.72rem', color:'var(--text-3)' }}>Manage built-in & custom account categories</div>
                </div>
              </div>
              <button onClick={() => { setShowManageHeads(false); setEditingHead(null); setNewHeadInput('') }}
                style={{ background:'none', border:'none', cursor:'pointer', color:'var(--text-3)' }}><X size={18}/></button>
            </div>

            {/* Add new head */}
            <div style={{ padding:'14px 22px', borderBottom:'1px solid var(--border)', background:'var(--surface-2)' }}>
              <div style={{ fontSize:'0.75rem', fontWeight:700, color:'var(--text-3)', marginBottom:8, textTransform:'uppercase', letterSpacing:'0.05em' }}>Add New Custom Head</div>
              <div style={{ display:'flex', gap:8 }}>
                <input value={newHeadInput} onChange={e => setNewHeadInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { const r = handleSaveCustomHead(newHeadInput); if (r) setNewHeadInput('') } }}
                  placeholder="e.g. Trademark Fees, Director Remuneration…"
                  style={{ flex:1, height:34, border:'1px solid var(--border)', borderRadius:'var(--radius)', fontSize:'0.83rem', padding:'0 10px', background:'var(--bg)', color:'var(--text)' }} />
                <button className="btn btn-primary btn-sm" style={{ gap:5, display:'flex', alignItems:'center' }}
                  onClick={() => { const r = handleSaveCustomHead(newHeadInput); if (r) setNewHeadInput('') }}>
                  <Plus size={13}/> Add
                </button>
              </div>
            </div>

            {/* Lists */}
            <div style={{ flex:1, overflowY:'auto' }}>
              {/* Custom heads */}
              {customHeads.length > 0 && (
                <div style={{ padding:'14px 22px' }}>
                  <div style={{ fontSize:'0.72rem', fontWeight:700, color:'var(--primary)', marginBottom:10, textTransform:'uppercase', letterSpacing:'0.05em', display:'flex', alignItems:'center', gap:6 }}>
                    ⭐ Custom Heads <span style={{ background:'var(--primary)', color:'white', borderRadius:999, fontSize:'0.65rem', padding:'1px 7px' }}>{customHeads.length}</span>
                  </div>
                  <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                    {customHeads.map(head => (
                      <div key={head} style={{ display:'flex', alignItems:'center', gap:8, padding:'9px 12px', background:'#EEF2FF', borderRadius:10, border:'1px solid #C7D2FE' }}>
                        {editingHead?.original === head ? (
                          <>
                            <input autoFocus value={editingHead.value}
                              onChange={e => setEditingHead(h => ({ ...h, value: e.target.value }))}
                              onKeyDown={e => { if (e.key === 'Enter') handleRenameHead(head, editingHead.value); if (e.key === 'Escape') setEditingHead(null) }}
                              style={{ flex:1, height:28, border:'1px solid var(--primary)', borderRadius:6, fontSize:'0.83rem', padding:'0 8px', background:'white', color:'var(--text)' }} />
                            <button className="btn btn-sm" style={{ background:'var(--success)', color:'white', padding:'3px 10px' }}
                              onClick={() => handleRenameHead(head, editingHead.value)}><CheckCircle size={11}/> Save</button>
                            <button className="btn btn-ghost btn-sm" style={{ padding:'3px 8px' }} onClick={() => setEditingHead(null)}>✕</button>
                          </>
                        ) : (
                          <>
                            <span style={{ flex:1, fontSize:'0.85rem', fontWeight:600, color:'var(--primary)' }}>{head}</span>
                            <button title="Rename" className="btn btn-ghost btn-sm" style={{ padding:'3px 7px' }}
                              onClick={() => setEditingHead({ original: head, value: head })}>
                              <Pencil size={11}/>
                            </button>
                            <button title="Delete" className="btn btn-ghost btn-sm" style={{ padding:'3px 7px', color:'var(--danger)' }}
                              onClick={() => handleDeleteHead(head)}>
                              <Trash2 size={11}/>
                            </button>
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Built-in heads (read-only) */}
              <div style={{ padding: customHeads.length > 0 ? '0 22px 14px' : '14px 22px' }}>
                <div style={{ fontSize:'0.72rem', fontWeight:700, color:'var(--text-3)', marginBottom:10, textTransform:'uppercase', letterSpacing:'0.05em' }}>
                  Built-in Heads (read-only)
                </div>
                <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
                  {ACCOUNT_OPTIONS.map(opt => (
                    <span key={opt} style={{ fontSize:'0.75rem', padding:'4px 10px', background:'var(--surface-2)', border:'1px solid var(--border)', borderRadius:20, color:'var(--text-2)' }}>
                      {opt}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            <div style={{ padding:'12px 22px', borderTop:'1px solid var(--border)', display:'flex', justifyContent:'flex-end' }}>
              <button className="btn btn-secondary btn-sm" onClick={() => { setShowManageHeads(false); setEditingHead(null); setNewHeadInput('') }}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* ── TRANSACTION DETAIL MODAL ──────────────────────────────── */}
      {selectedTxn && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.45)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center', padding:20 }} onClick={closeDetail}>
          <div style={{ background:'var(--surface)', borderRadius:16, padding:0, width:'100%', maxWidth:520, boxShadow:'0 24px 80px rgba(0,0,0,0.22)', overflow:'hidden' }} onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div style={{ padding:'18px 22px', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', justifyContent:'space-between',
              background: selectedTxn.txn_type === 'credit' ? 'linear-gradient(135deg,#ECFDF5,#F0FDF4)' : 'linear-gradient(135deg,#FEF2F2,#FFF1F2)' }}>
              <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                {selectedTxn.txn_type === 'credit'
                  ? <ArrowDownCircle size={22} color="var(--success)" />
                  : <ArrowUpCircle size={22} color="var(--danger)" />}
                <div>
                  <div style={{ fontWeight:700, fontSize:'1rem', color:'var(--text)' }}>Transaction Details</div>
                  <div style={{ fontSize:'0.75rem', color:'var(--text-3)' }}>{fmtDate(selectedTxn.txn_date)}</div>
                </div>
              </div>
              <button onClick={closeDetail} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--text-3)', padding:4 }}><X size={18}/></button>
            </div>

            {/* Amount hero */}
            <div style={{ padding:'22px 22px 16px', textAlign:'center', borderBottom:'1px solid var(--border)' }}>
              <div style={{ fontSize:'2rem', fontWeight:800, fontFamily:'var(--font-mono)', color: selectedTxn.txn_type==='credit' ? 'var(--success)' : 'var(--danger)', display:'flex', alignItems:'center', justifyContent:'center', gap:10 }}>
                {selectedTxn.txn_type === 'credit' ? '+' : '−'}₹{fmt(selectedTxn.amount)}
                <button
                  title="Flip sign — fix debit/credit parsing error"
                  onClick={() => { flipTransactionSign(selectedTxn); closeDetail() }}
                  style={{
                    display:'flex', alignItems:'center', gap:5, fontSize:'0.7rem', fontWeight:600,
                    padding:'4px 10px', borderRadius:20, border:'1.5px solid currentColor',
                    background:'transparent', cursor:'pointer',
                    color: selectedTxn.txn_type==='credit' ? 'var(--success)' : 'var(--danger)',
                    opacity:0.65, transition:'opacity .15s'
                  }}
                  onMouseEnter={e => e.currentTarget.style.opacity='1'}
                  onMouseLeave={e => e.currentTarget.style.opacity='0.65'}
                >
                  <RefreshCw size={11}/> Flip Sign
                </button>
              </div>
              <span className={`badge ${statusBadge[selectedTxn.status]||'badge-gray'}`} style={{ marginTop:6, fontSize:'0.78rem', padding:'4px 12px' }}>
                {(selectedTxn.status||'').replace('_',' ')}
              </span>
            </div>

            {/* Details grid */}
            <div style={{ padding:'16px 22px', display:'grid', gridTemplateColumns:'1fr 1fr', gap:'12px 24px' }}>
              {[
                { icon: '📝', label:'Full Narration',    value: selectedTxn.narration,                              colSpan:2 },
                { icon: '📅', label:'Date',              value: fmtDate(selectedTxn.txn_date) },
                { icon: '💳', label:'Payment Mode',      value: extractPaymentMode(selectedTxn.narration) },
                { icon: '🔢', label:'Reference / Cheque',value: selectedTxn.reference || '—' },
                { icon: '💰', label:'Balance After',     value: selectedTxn.balance > 0 ? `₹${fmt(selectedTxn.balance)}` : '—' },
                { icon: '🏷️', label:'Account Category',  value: selectedTxn.ai_suggested_account || '—' },
                { icon: '🤖', label:'AI Confidence',     value: selectedTxn.confidence ? `${(selectedTxn.confidence*100).toFixed(0)}%` : '—' },
              ].map(({ icon, label, value, colSpan }) => (
                <div key={label} style={{ gridColumn: colSpan ? `span ${colSpan}` : undefined, background:'var(--surface-2)', borderRadius:8, padding:'10px 12px' }}>
                  <div style={{ fontSize:'0.7rem', color:'var(--text-3)', marginBottom:4 }}>{icon} {label}</div>
                  <div style={{ fontSize:'0.85rem', fontWeight:600, color:'var(--text)', wordBreak:'break-all' }}>{value}</div>
                </div>
              ))}
            </div>

            {/* Similar transactions count */}
            {(() => {
              const sims = findSimilarUnmatched(transactions, selectedTxn)
              return sims.length > 0 ? (
                <div style={{ margin:'0 22px 16px', padding:'10px 14px', background:'#EEF2FF', borderRadius:8, display:'flex', alignItems:'center', gap:8, fontSize:'0.8rem', color:'var(--primary)' }}>
                  <Users size={14}/> <strong>{sims.length}</strong> similar unmatched transaction{sims.length>1?'s':''} found — accepting this will auto-match them too
                </div>
              ) : null
            })()}

            {/* Actions */}
            <div style={{ padding:'0 22px 20px', display:'flex', gap:8, justifyContent:'flex-end' }}>
              {selectedTxn.status === 'unmatched' && (
                <>
                  <button className="btn btn-sm" style={{ background:'var(--success)', color:'white' }}
                    onClick={() => { acceptMatch(selectedTxn.id); closeDetail() }}>
                    <CheckCircle size={13}/> Accept & Match
                  </button>
                  <button className="btn btn-ghost btn-sm"
                    onClick={() => { startEditing(selectedTxn); closeDetail() }}>
                    <Edit3 size={13}/> Edit Category
                  </button>
                  <button className="btn btn-ghost btn-sm"
                    onClick={() => { ignoreTransaction(selectedTxn.id); closeDetail() }}>
                    <X size={13}/> Ignore
                  </button>
                </>
              )}
              {(selectedTxn.status === 'matched' || selectedTxn.status === 'manually_matched') && (
                <button className="btn btn-ghost btn-sm" onClick={() => { unmatchTransaction(selectedTxn.id); closeDetail() }}>Undo Match</button>
              )}
              <button className="btn btn-secondary btn-sm" onClick={closeDetail}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* ── SIMILAR AUTO-APPLY BANNER ─────────────────────────────── */}
      {similarApplied && (
        <div style={{ position:'fixed', bottom:28, left:'50%', transform:'translateX(-50%)', zIndex:999,
          background:'var(--primary)', color:'white', borderRadius:12, padding:'14px 22px',
          boxShadow:'0 8px 32px rgba(79,70,229,0.35)', display:'flex', alignItems:'center', gap:12, fontSize:'0.88rem', maxWidth:420 }}>
          <Users size={16}/>
          <span>Auto-matched <strong>{similarApplied.count}</strong> similar transaction{similarApplied.count>1?'s':''} → <strong>{similarApplied.account}</strong></span>
          <button onClick={() => setSimilarApplied(null)} style={{ background:'rgba(255,255,255,0.2)', border:'none', cursor:'pointer', color:'white', borderRadius:6, padding:'2px 8px', fontSize:'0.78rem' }}>✕</button>
        </div>
      )}

      {/* ── NEW: BANK ACCOUNTS MODAL ─────────────────────────────────── */}
      {showBankAccounts && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.45)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}
          onClick={() => setShowBankAccounts(false)}>
          <div style={{ background:'var(--surface)', borderRadius:16, width:'100%', maxWidth:600, boxShadow:'0 24px 80px rgba(0,0,0,0.22)', overflow:'hidden', maxHeight:'85vh', display:'flex', flexDirection:'column' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ padding:'18px 22px', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', justifyContent:'space-between', background:'linear-gradient(135deg,#EFF6FF,#EEF2FF)' }}>
              <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                <Building2 size={20} color="var(--primary)" />
                <div>
                  <div style={{ fontWeight:700, fontSize:'1rem' }}>Bank Accounts</div>
                  <div style={{ fontSize:'0.72rem', color:'var(--text-3)' }}>Manage linked bank accounts · Auto-detected from statements</div>
                </div>
              </div>
              <button onClick={() => setShowBankAccounts(false)} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--text-3)' }}><X size={18}/></button>
            </div>

            {/* Add account form */}
            <div style={{ padding:'16px 22px', borderBottom:'1px solid var(--border)', background:'var(--surface-2)' }}>
              {/* Header row with auto-fill button */}
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10 }}>
                <div style={{ fontSize:'0.75rem', fontWeight:700, color:'var(--text-3)', textTransform:'uppercase', letterSpacing:'0.05em' }}>Add Bank Account Manually</div>
                <button
                  onClick={() => autoFillInputRef.current?.click()}
                  disabled={autoFillParsing}
                  style={{ display:'flex', alignItems:'center', gap:6, fontSize:'0.75rem', fontWeight:600,
                    padding:'5px 12px', borderRadius:6, border:'1.5px dashed #93C5FD',
                    background:'linear-gradient(135deg,#EFF6FF,#F5F3FF)', color:'#2563EB',
                    cursor: autoFillParsing ? 'not-allowed' : 'pointer', opacity: autoFillParsing ? 0.7 : 1,
                    whiteSpace:'nowrap' }}>
                  {autoFillParsing
                    ? <><span style={{ width:11,height:11,border:'2px solid rgba(37,99,235,0.3)',borderTopColor:'#2563EB',borderRadius:'50%',display:'inline-block',animation:'spin .7s linear infinite' }}/> Reading PDF…</>
                    : <><FileScan size={13}/> Auto-fill from Statement PDF</>
                  }
                </button>
                <input
                  ref={autoFillInputRef}
                  type="file"
                  accept=".pdf"
                  style={{ display:'none' }}
                  onChange={e => { const f = e.target.files?.[0]; if (f) { parseAccountDetailsFromPDF(f); e.target.value='' } }}
                />
              </div>

              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8, marginBottom:8 }}>
                <input value={newAccForm.name} onChange={e => setNewAccForm(f => ({...f, name:e.target.value}))}
                  placeholder="Account Label (e.g. Main Current)"
                  style={{ height:34, border:'1px solid var(--border)', borderRadius:'var(--radius)', fontSize:'0.82rem', padding:'0 10px', background:'var(--bg)', color:'var(--text)',
                    ...(newAccForm.name ? { borderColor:'#22C55E', background:'#F0FDF4' } : {}) }} />
                <input value={newAccForm.bankName} onChange={e => setNewAccForm(f => ({...f, bankName:e.target.value}))}
                  placeholder="Bank Name (e.g. HDFC Bank)"
                  style={{ height:34, border:'1px solid var(--border)', borderRadius:'var(--radius)', fontSize:'0.82rem', padding:'0 10px', background:'var(--bg)', color:'var(--text)',
                    ...(newAccForm.bankName ? { borderColor:'#22C55E', background:'#F0FDF4' } : {}) }} />
                <select value={newAccForm.type} onChange={e => setNewAccForm(f => ({...f, type:e.target.value}))}
                  style={{ height:34, border:'1px solid var(--border)', borderRadius:'var(--radius)', fontSize:'0.82rem', padding:'0 6px', background:'var(--bg)', color:'var(--text)' }}>
                  <option value="current">Current Account</option>
                  <option value="savings">Savings Account</option>
                  <option value="cc">Cash Credit</option>
                  <option value="od">Overdraft</option>
                </select>
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr auto', gap:8 }}>
                <input value={newAccForm.accountNo} onChange={e => setNewAccForm(f => ({...f, accountNo:e.target.value}))}
                  placeholder="Account Number"
                  style={{ height:34, border:'1px solid var(--border)', borderRadius:'var(--radius)', fontSize:'0.82rem', padding:'0 10px', background:'var(--bg)', color:'var(--text)',
                    ...(newAccForm.accountNo ? { borderColor:'#22C55E', background:'#F0FDF4' } : {}) }} />
                <input value={newAccForm.ifsc} onChange={e => setNewAccForm(f => ({...f, ifsc:e.target.value}))}
                  placeholder="IFSC Code"
                  style={{ height:34, border:'1px solid var(--border)', borderRadius:'var(--radius)', fontSize:'0.82rem', padding:'0 10px', background:'var(--bg)', color:'var(--text)',
                    ...(newAccForm.ifsc ? { borderColor:'#22C55E', background:'#F0FDF4' } : {}) }} />
                <button className="btn btn-primary btn-sm" style={{ gap:5, display:'flex', alignItems:'center', padding:'0 16px' }}
                  onClick={() => { if (!newAccForm.name || !newAccForm.bankName) { toast.error('Name and bank name required'); return } saveBankAccount(newAccForm) }}>
                  <Plus size={13}/> Add
                </button>
              </div>
            </div>

            <div style={{ flex:1, overflowY:'auto', padding:'16px 22px' }}>
              {bankAccounts.length === 0 ? (
                <div style={{ textAlign:'center', padding:'32px 0', color:'var(--text-3)' }}>
                  <Building2 size={36} style={{ margin:'0 auto 12px', opacity:0.3 }} />
                  <div style={{ fontSize:13 }}>No bank accounts added yet</div>
                  <div style={{ fontSize:12, marginTop:4 }}>Accounts are auto-detected when you import a bank statement, or add manually above.</div>
                </div>
              ) : (
                <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                  {bankAccounts.map(acc => (
                    <div key={acc.id} style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 16px', background:'var(--surface-2)', borderRadius:10, border:'1px solid var(--border)' }}>
                      <div style={{ width:40, height:40, borderRadius:10, background:'linear-gradient(135deg,#4F46E5,#7C3AED)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                        <Building2 size={18} color="white" />
                      </div>
                      <div style={{ flex:1 }}>
                        <div style={{ fontWeight:700, fontSize:'0.9rem' }}>{acc.name}</div>
                        <div style={{ fontSize:'0.75rem', color:'var(--text-3)' }}>{acc.bankName} · {acc.type?.toUpperCase()} {acc.accountNo ? `· ****${acc.accountNo.slice(-4)}` : ''} {acc.ifsc ? `· ${acc.ifsc}` : ''}</div>
                      </div>
                      <span style={{ fontSize:'0.7rem', padding:'3px 10px', background:'#EEF2FF', color:'var(--primary)', borderRadius:20, fontWeight:600 }}>
                        {transactions.filter(t => (t.bankAccountId === acc.id || t.narration?.toUpperCase().includes(acc.bankName?.toUpperCase()?.slice(0,4) || ''))).length} txns
                      </span>
                      <button onClick={() => {
                        const data2 = loadCompanyData(activeCompany?.id)
                        data2.bankAccounts = (data2.bankAccounts || []).filter(a => a.id !== acc.id)
                        saveCompanyData(activeCompany?.id, data2)
                        loadTxns()
                        toast.success('Account removed')
                      }} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--danger)', padding:4 }}>
                        <Trash2 size={14}/>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div style={{ padding:'12px 22px', borderTop:'1px solid var(--border)', display:'flex', justifyContent:'flex-end' }}>
              <button className="btn btn-secondary btn-sm" onClick={() => setShowBankAccounts(false)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* ── NEW: POST TO JOURNAL MODAL ────────────────────────────────── */}
      {showPostJournal && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.45)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}
          onClick={() => { if (!xlsImporting) setShowPostJournal(false) }}>
          <div style={{ background:'var(--surface)', borderRadius:16, width:'100%', maxWidth:640, boxShadow:'0 24px 80px rgba(0,0,0,0.22)', overflow:'hidden', maxHeight:'85vh', display:'flex', flexDirection:'column' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ padding:'18px 22px', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', justifyContent:'space-between', background:'linear-gradient(135deg,#F0FDF4,#ECFDF5)' }}>
              <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                <BookMarked size={20} color="var(--success)" />
                <div>
                  <div style={{ fontWeight:700, fontSize:'1rem' }}>Post Transactions to Journal</div>
                  <div style={{ fontSize:'0.72rem', color:'var(--text-3)' }}>Create journal entries & ledger for {postingTxns.length} matched transactions</div>
                </div>
              </div>
              {!xlsImporting && <button onClick={() => setShowPostJournal(false)} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--text-3)' }}><X size={18}/></button>}
            </div>

            {postDone ? (
              <div style={{ padding:'48px 22px', textAlign:'center' }}>
                <CheckCircle size={52} color="var(--success)" style={{ margin:'0 auto 16px' }} />
                <div style={{ fontWeight:700, fontSize:'1.2rem', marginBottom:8 }}>Journal Entries Created!</div>
                <div style={{ fontSize:'0.85rem', color:'var(--text-3)', marginBottom:24 }}>
                  {postingTxns.length} vouchers posted to Journal. Ledger updated automatically.<br/>
                  Debit/Credit entries created with AI-suggested account heads.
                </div>
                <button className="btn btn-primary" onClick={() => { setShowPostJournal(false); setPostDone(false) }}>Close</button>
              </div>
            ) : (
              <>
                {/* Summary */}
                <div style={{ padding:'14px 22px', borderBottom:'1px solid var(--border)', background:'var(--surface-2)', display:'flex', gap:24 }}>
                  <div><span style={{ fontSize:'0.75rem', color:'var(--text-3)' }}>Entries to Post</span><div style={{ fontWeight:700, fontSize:'1.1rem', color:'var(--text)' }}>{postingTxns.length}</div></div>
                  <div><span style={{ fontSize:'0.75rem', color:'var(--text-3)' }}>Credits (Money In)</span><div style={{ fontWeight:700, fontSize:'1.1rem', color:'var(--success)' }}>₹{fmt(postingTxns.filter(t=>t.txn_type==='credit').reduce((s,t)=>s+t.amount,0))}</div></div>
                  <div><span style={{ fontSize:'0.75rem', color:'var(--text-3)' }}>Debits (Money Out)</span><div style={{ fontWeight:700, fontSize:'1.1rem', color:'var(--danger)' }}>₹{fmt(postingTxns.filter(t=>t.txn_type==='debit').reduce((s,t)=>s+t.amount,0))}</div></div>
                </div>

                {/* AI ledger preview */}
                <div style={{ flex:1, overflowY:'auto', maxHeight:340 }}>
                  <div style={{ padding:'10px 22px 6px', fontSize:'0.72rem', fontWeight:700, color:'var(--text-3)', textTransform:'uppercase', letterSpacing:'0.05em', borderBottom:'1px solid var(--border)', display:'grid', gridTemplateColumns:'80px 1fr 1fr 90px', gap:8 }}>
                    <span>Date</span><span>Debit Account</span><span>Credit Account</span><span>Amount</span>
                  </div>
                  {postingTxns.slice(0, 20).map(t => (
                    <div key={t.id} style={{ padding:'8px 22px', borderBottom:'1px solid var(--border)', display:'grid', gridTemplateColumns:'80px 1fr 1fr 90px', gap:8, fontSize:'0.8rem', alignItems:'center' }}>
                      <span style={{ color:'var(--text-3)' }}>{fmtDate(t.txn_date)}</span>
                      <span style={{ fontWeight:600, color:'var(--danger)' }}>{t.txn_type==='credit' ? 'Bank Account' : (t.ai_suggested_account||'Misc. Expense')}</span>
                      <span style={{ fontWeight:600, color:'var(--success)' }}>{t.txn_type==='credit' ? (t.ai_suggested_account||'Misc. Income') : 'Bank Account'}</span>
                      <span style={{ fontFamily:'var(--font-mono)', fontWeight:700 }}>₹{fmt(t.amount)}</span>
                    </div>
                  ))}
                  {postingTxns.length > 20 && (
                    <div style={{ padding:'10px 22px', fontSize:'0.78rem', color:'var(--text-3)', fontStyle:'italic' }}>…and {postingTxns.length - 20} more entries</div>
                  )}
                </div>

                {xlsImporting && (
                  <div style={{ padding:'12px 22px', borderTop:'1px solid var(--border)', background:'#F0FDF4' }}>
                    <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8, fontSize:'0.82rem', color:'var(--success)', fontWeight:600 }}>
                      <Spinner color="var(--success)" /> Posting journal entries… {postProgress}%
                    </div>
                    <div style={{ height:6, background:'var(--border)', borderRadius:99 }}>
                      <div style={{ height:'100%', width:`${postProgress}%`, background:'var(--success)', borderRadius:99, transition:'width 0.3s ease' }} />
                    </div>
                  </div>
                )}

                <div style={{ padding:'14px 22px', borderTop:'1px solid var(--border)', display:'flex', gap:8, justifyContent:'flex-end' }}>
                  <button className="btn btn-secondary btn-sm" onClick={() => setShowPostJournal(false)} disabled={xlsImporting}>Cancel</button>
                  <button className="btn btn-primary" onClick={confirmPostToJournal} disabled={xlsImporting}
                    style={{ background:'var(--success)', display:'flex', alignItems:'center', gap:7 }}>
                    <Send size={14}/> Post {postingTxns.length} Journal Entries
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── NEW: XLS BULK IMPORT MODAL ────────────────────────────────── */}
      {showXLSImport && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.45)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}
          onClick={() => { if (!xlsImporting) { setShowXLSImport(false); setXLSFile(null); setXLSPreview(null) } }}>
          <div style={{ background:'var(--surface)', borderRadius:16, width:'100%', maxWidth:700, boxShadow:'0 24px 80px rgba(0,0,0,0.22)', overflow:'hidden', maxHeight:'88vh', display:'flex', flexDirection:'column' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ padding:'18px 22px', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', justifyContent:'space-between', background:'linear-gradient(135deg,#FFF7ED,#FFFBEB)' }}>
              <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                <Table2 size={20} color="#D97706" />
                <div>
                  <div style={{ fontWeight:700, fontSize:'1rem' }}>Bulk XLS Import</div>
                  <div style={{ fontSize:'0.72rem', color:'var(--text-3)' }}>Import Sales, Purchase, or any report from Excel / XLS files</div>
                </div>
              </div>
              {!xlsImporting && <button onClick={() => { setShowXLSImport(false); setXLSFile(null); setXLSPreview(null) }}
                style={{ background:'none', border:'none', cursor:'pointer', color:'var(--text-3)' }}><X size={18}/></button>}
            </div>

            {/* Type selector + upload */}
            <div style={{ padding:'16px 22px', borderBottom:'1px solid var(--border)', background:'var(--surface-2)' }}>
              <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:12 }}>
                <span style={{ fontSize:'0.82rem', fontWeight:600, color:'var(--text-2)' }}>Import as:</span>
                {['sales','purchase','journal','receipt','payment'].map(t => (
                  <button key={t} onClick={() => setXLSType(t)}
                    className={xlsType===t ? 'btn btn-primary btn-sm' : 'btn btn-ghost btn-sm'}
                    style={{ textTransform:'capitalize', padding:'4px 14px' }}>{t}</button>
                ))}
              </div>
              <div
                onDragOver={e => e.preventDefault()}
                onDrop={e => { e.preventDefault(); handleXLSFile(e.dataTransfer.files[0]) }}
                onClick={() => { const inp = document.getElementById('xls-file-inp'); inp?.click() }}
                style={{ border:'2px dashed var(--border)', borderRadius:10, padding:'20px 0', textAlign:'center', cursor:'pointer',
                  background: xlsFile ? '#F0FDF4' : 'var(--bg)', transition:'all 0.2s',
                  borderColor: xlsFile ? 'var(--success)' : 'var(--border)' }}>
                <input id="xls-file-inp" type="file" accept=".xls,.xlsx,.csv" style={{ display:'none' }}
                  onChange={e => handleXLSFile(e.target.files[0])} />
                {xlsFile ? (
                  <>
                    <CheckCircle size={24} color="var(--success)" style={{ margin:'0 auto 8px' }} />
                    <div style={{ fontWeight:600, color:'var(--success)', marginBottom:2 }}>{xlsFile.name}</div>
                    <div style={{ fontSize:'0.75rem', color:'var(--text-3)' }}>Click to change file</div>
                  </>
                ) : (
                  <>
                    <Upload size={24} color="var(--text-3)" style={{ margin:'0 auto 8px' }} />
                    <div style={{ fontWeight:600, color:'var(--text)', marginBottom:2 }}>Drag & drop or click to browse</div>
                    <div style={{ fontSize:'0.75rem', color:'var(--text-3)' }}>Supports .xls · .xlsx · .csv · Max 20 MB</div>
                    <div style={{ fontSize:'0.72rem', color:'var(--text-3)', marginTop:4 }}>Expected columns: Date · Party Name · Invoice No · Amount</div>
                  </>
                )}
              </div>
            </div>

            {/* Preview */}
            {xlsPreview && (
              <>
                <div style={{ padding:'10px 22px 6px', background:'#FFFBEB', borderBottom:'1px solid #FDE68A', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                  <div style={{ fontSize:'0.82rem', fontWeight:600, color:'#92400E' }}>
                    Preview — {xlsPreview.rows.length} records found · Total: ₹{fmt(xlsPreview.total)}
                  </div>
                  <span style={{ fontSize:'0.75rem', color:'#92400E' }}>Showing first 10 of {xlsPreview.rows.length}</span>
                </div>
                <div style={{ flex:1, overflowY:'auto', maxHeight:260 }}>
                  <div style={{ padding:'6px 22px', borderBottom:'1px solid var(--border)', display:'grid', gridTemplateColumns:'100px 1fr 100px 80px 80px', gap:8, fontSize:'0.72rem', fontWeight:700, color:'var(--text-3)', textTransform:'uppercase', letterSpacing:'0.04em' }}>
                    <span>Date</span><span>Party</span><span>Invoice</span><span>Amount</span><span>Status</span>
                  </div>
                  {xlsPreview.rows.slice(0, 10).map((row, i) => (
                    <div key={i} style={{ padding:'8px 22px', borderBottom:'1px solid var(--border)', display:'grid', gridTemplateColumns:'100px 1fr 100px 80px 80px', gap:8, fontSize:'0.8rem', alignItems:'center' }}>
                      <span style={{ color:'var(--text-3)' }}>{row.date}</span>
                      <span style={{ fontWeight:600, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{row.party || '—'}</span>
                      <span style={{ color:'var(--primary)', fontSize:'0.75rem' }}>{row.invoice || '—'}</span>
                      <span style={{ fontFamily:'var(--font-mono)', fontWeight:700 }}>₹{fmt(row.amount)}</span>
                      <span style={{ fontSize:'0.7rem', padding:'2px 6px', borderRadius:10,
                        background: row.status?.toLowerCase() === 'paid' ? '#ECFDF5' : row.status?.toLowerCase() === 'unpaid' ? '#FEF2F2' : '#F3F4F6',
                        color: row.status?.toLowerCase() === 'paid' ? '#065F46' : row.status?.toLowerCase() === 'unpaid' ? '#991B1B' : '#374151' }}>
                        {row.status || 'N/A'}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            )}

            {xlsImporting && (
              <div style={{ padding:'12px 22px', background:'#FFFBEB', borderTop:'1px solid #FDE68A' }}>
                <div style={{ display:'flex', alignItems:'center', gap:8, fontSize:'0.82rem', color:'#92400E', fontWeight:600, marginBottom:6 }}>
                  <Spinner color="#D97706" /> Importing {xlsType} vouchers…
                </div>
                <div style={{ height:6, background:'var(--border)', borderRadius:99 }}>
                  <div style={{ height:'100%', width:'60%', background:'#D97706', borderRadius:99, animation:'xls-prog 1.5s ease-in-out infinite alternate' }} />
                </div>
              </div>
            )}

            <div style={{ padding:'14px 22px', borderTop:'1px solid var(--border)', display:'flex', gap:8, justifyContent:'space-between', alignItems:'center' }}>
              <div style={{ fontSize:'0.78rem', color:'var(--text-3)' }}>
                {xlsPreview ? `${xlsPreview.rows.length} vouchers will be posted to ${xlsType} journal` : 'Upload a file to preview before importing'}
              </div>
              <div style={{ display:'flex', gap:8 }}>
                <button className="btn btn-secondary btn-sm" disabled={xlsImporting} onClick={() => { setShowXLSImport(false); setXLSFile(null); setXLSPreview(null) }}>Cancel</button>
                <button className="btn btn-primary" disabled={!xlsPreview || xlsImporting} onClick={handleXLSImport}
                  style={{ background:'#D97706', display:'flex', alignItems:'center', gap:7 }}>
                  <Upload size={14}/> Import {xlsPreview?.rows.length || ''} {xlsType} Vouchers
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } } @keyframes xls-prog { from { width:20% } to { width:80% } }`}</style>
    </div>
  )
}
