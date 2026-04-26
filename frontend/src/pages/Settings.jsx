// src/pages/Settings.jsx — Full Settings for FINIX AI Accounting (India)
// FEATURE: Smart Document Upload — upload GST Certificate (PDF) and/or MCA Master Data (XLSX/CSV)
//          and all company profile fields are auto-filled from the documents.
import { useState, useEffect, useRef } from 'react'
import {
  Building2, Users, Shield, Bell, Palette, Database,
  Printer, Globe, Zap, FileText, IndianRupee, Receipt,
  Lock, Key, ChevronRight, Check,
  Save, AlertTriangle, Info, Upload, RefreshCw, Trash2,
  Eye, EyeOff, Plus, Edit2, X, Sparkles, FileCheck, FileScan
} from 'lucide-react'
import toast from 'react-hot-toast'
import { useAuth } from '../context/AuthContext'

const SIDEBAR = [
  { key:'company',      label:'Company Profile',   icon:Building2,   desc:'GSTIN, PAN, CIN, address' },
  { key:'users',        label:'Users & Roles',      icon:Users,       desc:'Manage team access' },
  { key:'security',     label:'Security',           icon:Shield,      desc:'Password, 2FA, sessions' },
  { key:'gst',          label:'GST & Tax',          icon:Receipt,     desc:'GST rates, HSN, TDS' },
  { key:'payroll',      label:'Payroll & HR',       icon:IndianRupee, desc:'PF, ESIC, TDS slabs' },
  { key:'notifications',label:'Notifications',      icon:Bell,        desc:'Email, SMS, push alerts' },
  { key:'appearance',   label:'Appearance',         icon:Palette,     desc:'Theme, language, date format' },
  { key:'integrations', label:'Integrations',       icon:Globe,       desc:'Tally, Zoho, GSP, bank feeds' },
  { key:'ai',           label:'AI & Automation',    icon:Zap,         desc:'Smart rules, auto-classify' },
  { key:'data',         label:'Data & Backup',      icon:Database,    desc:'Export, backup, import' },
  { key:'print',        label:'Print & Invoice',    icon:Printer,     desc:'Templates, e-invoice, e-way bill' },
]

// ── Shared UI helpers ──────────────────────────────────────────
function Section({ title, children, action }) {
  return (
    <div className="card" style={{ marginBottom:16 }}>
      <div style={{ padding:'14px 18px', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <h3 style={{ fontSize:14, fontWeight:700, color:'var(--text)' }}>{title}</h3>
        {action}
      </div>
      <div style={{ padding:'16px 18px' }}>{children}</div>
    </div>
  )
}

function Field({ label, hint, children }) {
  return (
    <div style={{ marginBottom:18 }}>
      <label style={{ display:'block', fontSize:12, fontWeight:600, color:'var(--text-2)', marginBottom:4 }}>{label}</label>
      {children}
      {hint && <div style={{ fontSize:11, color:'var(--text-4)', marginTop:3 }}>{hint}</div>}
    </div>
  )
}

function Toggle2({ value, onChange, label }) {
  return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'10px 0', borderBottom:'1px solid var(--border)' }}>
      <span style={{ fontSize:13, color:'var(--text-2)' }}>{label}</span>
      <button
        onClick={() => onChange(!value)}
        style={{
          width:40, height:22, borderRadius:11, border:'none', cursor:'pointer',
          background:value ? 'var(--accent)' : 'var(--border-2)',
          position:'relative', transition:'background .2s',
          flexShrink:0
        }}
      >
        <span style={{
          display:'block', width:16, height:16, borderRadius:'50%', background:'white',
          position:'absolute', top:3, left:value ? 21 : 3, transition:'left .2s',
          boxShadow:'0 1px 3px rgba(0,0,0,.2)'
        }}/>
      </button>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
// DOCUMENT PARSERS — 100% client-side, no backend needed
// ══════════════════════════════════════════════════════════════

// ── Load PDF.js from CDN ──────────────────────────────────────
const PDFJS_CDN    = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js'
const PDFJS_WORKER = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'

async function loadPDFJS() {
  if (window.pdfjsLib) return window.pdfjsLib
  return new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = PDFJS_CDN
    s.onload = () => { window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER; resolve(window.pdfjsLib) }
    s.onerror = () => reject(new Error('Failed to load PDF.js'))
    document.head.appendChild(s)
  })
}

async function extractPDFText(file) {
  const buf     = await file.arrayBuffer()
  const pdfjsLib = await loadPDFJS()
  const pdf     = await pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise
  let text = ''
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p)
    const tc   = await page.getTextContent()
    // Reconstruct rows by Y position so key–value pairs land on the same line
    const byY  = {}
    tc.items.forEach(item => {
      const y = Math.round(item.transform[5])
      if (!byY[y]) byY[y] = []
      byY[y].push(item.str)
    })
    text += Object.keys(byY)
      .sort((a, b) => b - a)
      .map(y => byY[y].join(' '))
      .join('\n') + '\n'
  }
  return text
}

// ── Load SheetJS from CDN ─────────────────────────────────────
async function loadSheetJS() {
  if (window.XLSX) return window.XLSX
  return new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js'
    s.onload = () => resolve(window.XLSX)
    s.onerror = () => reject(new Error('Failed to load SheetJS'))
    document.head.appendChild(s)
  })
}

async function extractXLSXData(file) {
  const XLSX = await loadSheetJS()
  const buf  = await file.arrayBuffer()
  const wb   = XLSX.read(new Uint8Array(buf), { type: 'array' })
  // Return all sheets as { sheetName: [[row], [row], ...] }
  const result = {}
  for (const name of wb.SheetNames) {
    result[name] = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: '' })
  }
  return result
}

// ── GST Certificate PDF parser ────────────────────────────────
// Handles Form GST REG-06 (standard govt certificate)
function parseGSTCertificate(text) {
  const extracted = {}
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean)
  const fullText = lines.join(' ')

  // GSTIN — 15-char alphanumeric starting with 2-digit state code
  const gstinMatch = fullText.match(/\b(\d{2}[A-Z]{5}\d{4}[A-Z]{1}\d{1}[Z]{1}[A-Z\d]{1})\b/)
  if (gstinMatch) extracted.gstin = gstinMatch[1]

  // Legal Name — line after "Legal Name" label
  const legalIdx = lines.findIndex(l => /^legal\s*name$/i.test(l) || /^1\.\s*legal\s*name$/i.test(l))
  if (legalIdx !== -1 && lines[legalIdx + 1]) {
    // Skip if next line is just a label word
    const candidate = lines[legalIdx + 1]
    if (candidate.length > 5 && !/^trade\s*name/i.test(candidate)) {
      extracted.legalName = candidate
    }
  }

  // Trade Name
  const tradeIdx = lines.findIndex(l => /^trade\s*name/i.test(l) || /^2\.\s*trade\s*name/i.test(l))
  if (tradeIdx !== -1 && lines[tradeIdx + 1]) {
    const candidate = lines[tradeIdx + 1]
    if (candidate.length > 5 && !/^additional/i.test(candidate)) {
      extracted.tradeName = candidate
    }
  }

  // Fallback: look for "PRODIGIST" style name pattern anywhere in text
  if (!extracted.legalName) {
    const nameMatch = fullText.match(/([A-Z][A-Z\s]+(?:PRIVATE LIMITED|PVT\.?\s*LTD\.?|LLP|ENTERPRISES|INDUSTRIES|TRADERS|SOLUTIONS|SERVICES|TECHNOLOGIES|TECH|VENTURES))/)
    if (nameMatch) extracted.legalName = nameMatch[1].trim()
  }

  // Constitution / Business Type
  const constMatch = fullText.match(/constitution of business[:\s]+([^\n]+)/i)
  if (constMatch) extracted.businessType = constMatch[1].trim()

  // Address — line after "Address of Principal Place of Business"
  const addrIdx = lines.findIndex(l => /address of principal place/i.test(l))
  if (addrIdx !== -1) {
    // Collect next 2-3 lines that look like address content
    const addrLines = []
    for (let i = addrIdx + 1; i < Math.min(addrIdx + 5, lines.length); i++) {
      const l = lines[i]
      if (/^date of|^period of|^type of|^\d+\./i.test(l)) break
      addrLines.push(l)
    }
    const rawAddr = addrLines.join(' ').trim()
    if (rawAddr.length > 10) {
      // Try to extract city, state, pincode from the address
      extracted.address = rawAddr

      // Pincode — 6-digit number
      const pinMatch = rawAddr.match(/\b(\d{6})\b/)
      if (pinMatch) extracted.pincode = pinMatch[1]

      // State — common Indian state names
      const stateMatch = rawAddr.match(/\b(Gujarat|Maharashtra|Karnataka|Delhi|Tamil Nadu|Telangana|Rajasthan|Uttar Pradesh|Haryana|Punjab|West Bengal|Odisha|Kerala|Madhya Pradesh|Andhra Pradesh|Bihar|Assam|Jharkhand|Himachal Pradesh|Uttarakhand|Goa|Chhattisgarh|Manipur|Meghalaya|Mizoram|Nagaland|Sikkim|Tripura)\b/i)
      if (stateMatch) extracted.state = stateMatch[1]

      // City — word before state name or pincode
      if (extracted.state) {
        const beforeState = rawAddr.substring(0, rawAddr.toLowerCase().indexOf(extracted.state.toLowerCase())).trim()
        const parts = beforeState.split(/[,\s]+/).filter(Boolean)
        if (parts.length > 0) extracted.city = parts[parts.length - 1]
      }
    }
  }

  // Type of Registration
  const regTypeMatch = fullText.match(/type of registration[:\s]+([^\n]+)/i)
  if (regTypeMatch) extracted.gstRegType = regTypeMatch[1].trim()

  // Date of registration / liability
  const dateMatch = fullText.match(/(\d{2}\/\d{2}\/\d{4})/g)
  if (dateMatch && dateMatch.length > 0) extracted.gstRegDate = dateMatch[0]

  return extracted
}

// ── MCA Master Data XLSX parser ───────────────────────────────
// Handles the standard MCA21 "Company Master Data" Excel export
function parseMCAMasterData(sheets) {
  const extracted = {}

  // Sheet: MasterData (key-value pairs in col A = label, col B = value)
  const masterSheet = sheets['MasterData'] || sheets['Master Data'] || sheets[Object.keys(sheets)[0]]
  if (masterSheet) {
    const kvMap = {}
    for (const row of masterSheet) {
      const key = String(row[0] || '').trim()
      const val = String(row[1] || '').trim()
      if (key && val && val !== 'None' && val !== '-') {
        kvMap[key.toLowerCase()] = val
      }
    }

    // CIN
    extracted.cin = kvMap['cin'] || ''

    // Company Name → both legal and trade name
    const coName = kvMap['company name'] || ''
    if (coName) { extracted.legalName = coName; extracted.tradeName = coName }

    // Email — decode [dot] and [at] obfuscation used by MCA
    const rawEmail = kvMap['email id'] || kvMap['email'] || ''
    if (rawEmail) {
      extracted.email = rawEmail
        .replace(/\[dot\]/gi, '.')
        .replace(/\[at\]/gi, '@')
        .replace(/\s+/g, '')
    }

    // Registered Address
    const rawAddr = kvMap['registered address'] || kvMap['address'] || ''
    if (rawAddr && rawAddr !== '-') {
      extracted.address = rawAddr

      // Pincode
      const pinMatch = rawAddr.match(/\b(\d{6})\b/)
      if (pinMatch) extracted.pincode = pinMatch[1]

      // State
      const stateMatch = rawAddr.match(/\b(Gujarat|Maharashtra|Karnataka|Delhi|Tamil Nadu|Telangana|Rajasthan|Uttar Pradesh|Haryana|Punjab|West Bengal|Odisha|Kerala|Madhya Pradesh|Andhra Pradesh|Bihar|Assam|Jharkhand|Himachal Pradesh|Uttarakhand|Goa|Chhattisgarh)\b/i)
      if (stateMatch) extracted.state = stateMatch[1]

      // City — usually the last city-like word before state/pincode
      const addrParts = rawAddr.split(',').map(p => p.trim())
      // Find city: part that contains the state word, go one part before
      if (extracted.state) {
        const si = addrParts.findIndex(p => p.toLowerCase().includes(extracted.state.toLowerCase()))
        if (si > 0) {
          // Part before state may be "City, State" — take the city portion
          const candidate = addrParts[si - 1]
          extracted.city = candidate.split(/\s+/).pop() || candidate
        }
      }
    }

    // Date of Incorporation → use as company founding reference
    extracted.dateOfIncorporation = kvMap['date of incorporation'] || ''

    // Registration Number
    extracted.regNo = kvMap['registration number'] || ''

    // ROC
    extracted.roc = kvMap['roc name'] || kvMap['roc (name and office)'] || ''

    // Company Status
    extracted.companyStatus = kvMap['company status'] || ''

    // Capital
    extracted.authorisedCapital = kvMap['authorised capital (rs)'] || kvMap['authorised capital'] || ''
    extracted.paidUpCapital     = kvMap['paid up capital (rs)']     || kvMap['paid up capital']     || ''

    // Classify business type for our dropdown
    const classOfCo = (kvMap['class of company'] || '').toLowerCase()
    const subCat    = (kvMap['subcategory of the company'] || '').toLowerCase()
    if (classOfCo.includes('private')) extracted.businessType = 'Private Limited'
    else if (classOfCo.includes('public')) extracted.businessType = 'Public Limited'
    else if (subCat.includes('llp') || classOfCo.includes('llp')) extracted.businessType = 'LLP'
    else extracted.businessType = 'Private Limited'
  }

  // Sheet: Director Details
  const dirSheet = sheets['Director Details'] || sheets['Director details'] || sheets['Directors']
  if (dirSheet) {
    const directors = []
    let headerFound = false
    for (const row of dirSheet) {
      const r0 = String(row[0] || '').toLowerCase()
      if (r0.includes('sr') || r0.includes('din')) { headerFound = true; continue }
      if (!headerFound) continue
      const name = String(row[2] || '').trim()
      const desig = String(row[3] || '').trim()
      if (name && name.length > 2) {
        directors.push({ name, designation: desig, din: String(row[1] || '').trim() })
      }
    }
    if (directors.length > 0) extracted.directors = directors
  }

  return extracted
}

// ── Merge parsed data from multiple documents ─────────────────
// GST certificate and MCA data may overlap; prefer the more specific/longer value
function mergeExtracted(gstData, mcaData) {
  const merged = {}
  const allKeys = new Set([...Object.keys(gstData || {}), ...Object.keys(mcaData || {})])

  for (const key of allKeys) {
    const g = gstData?.[key]
    const m = mcaData?.[key]
    if (g && m) {
      // Prefer longer / more complete value
      merged[key] = String(g).length >= String(m).length ? g : m
    } else {
      merged[key] = g || m
    }
  }

  return merged
}

// ── Map extracted data → Settings form fields ─────────────────
function extractedToForm(extracted) {
  const updates = {}
  if (extracted.legalName) updates.legalName = extracted.legalName
  if (extracted.tradeName)  updates.tradeName  = extracted.tradeName
  if (extracted.gstin)      updates.gstin      = extracted.gstin
  if (extracted.cin)        updates.cin        = extracted.cin
  if (extracted.email)      updates.email      = extracted.email
  if (extracted.address)    updates.address    = extracted.address
  if (extracted.city)       updates.city       = extracted.city
  if (extracted.state)      updates.state      = extracted.state
  if (extracted.pincode)    updates.pincode    = extracted.pincode
  if (extracted.phone)      updates.phone      = extracted.phone
  if (extracted.website)    updates.website    = extracted.website
  return updates
}

// ══════════════════════════════════════════════════════════════
// SMART DOCUMENT UPLOAD COMPONENT
// ══════════════════════════════════════════════════════════════
function SmartDocUpload({ onExtracted }) {
  const [files, setFiles]     = useState([])   // [{file, type, status, data}]
  const [parsing, setParsing] = useState(false)
  const [parsed, setParsed]   = useState(null) // final merged result
  const inputRef              = useRef()

  const FILE_TYPES = {
    pdf:  { label:'GST Certificate', icon:'📄', color:'#DC2626', bg:'#FEF2F2', border:'#FECACA' },
    xlsx: { label:'MCA Master Data', icon:'📊', color:'#059669', bg:'#ECFDF5', border:'#A7F3D0' },
    xls:  { label:'MCA Master Data', icon:'📊', color:'#059669', bg:'#ECFDF5', border:'#A7F3D0' },
    csv:  { label:'Company Data CSV', icon:'📋', color:'#7C3AED', bg:'#F5F3FF', border:'#DDD6FE' },
  }

  const detectFileType = (file) => {
    const ext = file.name.split('.').pop().toLowerCase()
    return FILE_TYPES[ext] || { label:'Unknown', icon:'📁', color:'#6B7280', bg:'#F9FAFB', border:'#E5E7EB' }
  }

  const handleFileDrop = (e) => {
    e.preventDefault()
    const dropped = Array.from(e.dataTransfer?.files || e.target.files || [])
    addFiles(dropped)
  }

  const addFiles = (newFiles) => {
    const toAdd = newFiles
      .filter(f => /\.(pdf|xlsx|xls|csv)$/i.test(f.name))
      .filter(f => !files.some(existing => existing.file.name === f.name))
      .map(f => ({ file: f, type: detectFileType(f), status: 'ready', data: null }))

    if (toAdd.length === 0) { toast.error('Please upload PDF, XLSX, XLS or CSV files'); return }
    setFiles(prev => [...prev, ...toAdd])
    setParsed(null)
  }

  const removeFile = (idx) => setFiles(prev => prev.filter((_, i) => i !== idx))

  const parseAll = async () => {
    if (files.length === 0) { toast.error('Please upload at least one document'); return }
    setParsing(true)
    setParsed(null)

    let gstData = null
    let mcaData = null
    const updatedFiles = [...files]

    for (let i = 0; i < files.length; i++) {
      const { file } = files[i]
      const ext = file.name.split('.').pop().toLowerCase()
      updatedFiles[i] = { ...updatedFiles[i], status: 'parsing' }
      setFiles([...updatedFiles])

      try {
        if (ext === 'pdf') {
          const text = await extractPDFText(file)
          gstData = parseGSTCertificate(text)
          updatedFiles[i] = { ...updatedFiles[i], status: 'done', data: gstData }
        } else if (ext === 'xlsx' || ext === 'xls') {
          const sheets = await extractXLSXData(file)
          mcaData = parseMCAMasterData(sheets)
          updatedFiles[i] = { ...updatedFiles[i], status: 'done', data: mcaData }
        } else if (ext === 'csv') {
          // Treat as MCA data in CSV form: key,value rows
          const text = await file.text()
          const rows = text.split('\n').map(l => l.split(',').map(c => c.trim().replace(/^"|"$/g, '')))
          mcaData = parseMCAMasterData({ MasterData: rows })
          updatedFiles[i] = { ...updatedFiles[i], status: 'done', data: mcaData }
        }
      } catch (err) {
        updatedFiles[i] = { ...updatedFiles[i], status: 'error' }
        toast.error(`Failed to parse ${file.name}: ${err.message}`)
      }
    }

    setFiles([...updatedFiles])
    const merged = mergeExtracted(gstData, mcaData)
    setParsed(merged)
    setParsing(false)

    const fieldCount = Object.keys(extractedToForm(merged)).length
    if (fieldCount > 0) {
      toast.success(`✅ Extracted ${fieldCount} fields from your document${files.length > 1 ? 's' : ''}!`)
    } else {
      toast.error('Could not extract data. Please check the document format.')
    }
  }

  const handleApply = () => {
    if (!parsed) return
    const formUpdates = extractedToForm(parsed)
    onExtracted(formUpdates, parsed)
  }

  const fieldCount = parsed ? Object.keys(extractedToForm(parsed)).length : 0

  return (
    <div style={{
      marginBottom: 20,
      background: 'linear-gradient(135deg, #EFF6FF, #F5F3FF)',
      border: '1.5px dashed #93C5FD',
      borderRadius: 12,
      padding: '18px 20px',
    }}>
      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:14 }}>
        <div style={{ width:34, height:34, borderRadius:8, background:'var(--primary)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
          <FileScan size={18} color="white" />
        </div>
        <div>
          <div style={{ fontWeight:700, fontSize:14, color:'var(--text)' }}>Auto-fill from Documents</div>
          <div style={{ fontSize:11, color:'var(--text-3)' }}>Upload GST Certificate (PDF) and / or MCA Master Data (XLSX) — fields fill automatically</div>
        </div>
      </div>

      {/* Drop Zone */}
      <div
        onDragOver={e => e.preventDefault()}
        onDrop={handleFileDrop}
        onClick={() => inputRef.current?.click()}
        style={{
          border: '2px dashed #BFDBFE',
          borderRadius: 8,
          padding: '16px',
          textAlign: 'center',
          cursor: 'pointer',
          background: 'white',
          transition: 'border-color 0.2s',
          marginBottom: files.length > 0 ? 12 : 0,
        }}
      >
        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".pdf,.xlsx,.xls,.csv"
          style={{ display:'none' }}
          onChange={e => addFiles(Array.from(e.target.files))}
        />
        <Upload size={22} color="#93C5FD" style={{ margin:'0 auto 6px' }} />
        <div style={{ fontSize:13, fontWeight:600, color:'var(--text-2)', marginBottom:2 }}>
          Drop files here or click to browse
        </div>
        <div style={{ fontSize:11, color:'var(--text-3)' }}>
          <strong>GST REG-06 Certificate</strong> (.pdf) · <strong>MCA Master Data</strong> (.xlsx / .xls) · Both together
        </div>
      </div>

      {/* File list */}
      {files.length > 0 && (
        <div style={{ display:'flex', flexDirection:'column', gap:6, marginBottom:12 }}>
          {files.map((f, i) => (
            <div key={i} style={{
              display:'flex', alignItems:'center', gap:10, padding:'9px 12px',
              background: f.status === 'done' ? f.type.bg : f.status === 'error' ? '#FEF2F2' : 'white',
              border: `1px solid ${f.status === 'done' ? f.type.border : f.status === 'error' ? '#FECACA' : '#E5E7EB'}`,
              borderRadius: 8,
            }}>
              <span style={{ fontSize:20, flexShrink:0 }}>{f.type.icon}</span>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontWeight:600, fontSize:13, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', color: f.status === 'error' ? '#DC2626' : 'var(--text)' }}>
                  {f.file.name}
                </div>
                <div style={{ fontSize:11, color:'var(--text-3)', display:'flex', gap:8 }}>
                  <span style={{ color: f.type.color, fontWeight:600 }}>{f.type.label}</span>
                  <span>{(f.file.size / 1024).toFixed(0)} KB</span>
                  {f.status === 'done' && f.data && (
                    <span style={{ color:'var(--success)', fontWeight:600 }}>
                      ✓ {Object.keys(f.data).filter(k => f.data[k] && k !== 'directors').length} fields extracted
                    </span>
                  )}
                  {f.status === 'parsing' && <span style={{ color:'var(--warning)', fontWeight:600 }}>⏳ Parsing…</span>}
                  {f.status === 'error' && <span style={{ color:'#DC2626', fontWeight:600 }}>❌ Parse failed</span>}
                </div>
              </div>
              {f.status !== 'parsing' && (
                <button onClick={e => { e.stopPropagation(); removeFile(i) }}
                  style={{ background:'none', border:'none', cursor:'pointer', color:'var(--text-3)', padding:4 }}>
                  <X size={14} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Action buttons */}
      <div style={{ display:'flex', alignItems:'center', gap:10, flexWrap:'wrap' }}>
        <button
          onClick={parseAll}
          disabled={files.length === 0 || parsing}
          className="btn btn-primary"
          style={{ display:'flex', alignItems:'center', gap:7, fontSize:13, padding:'7px 16px' }}
        >
          {parsing
            ? <><span style={{ width:13, height:13, border:'2px solid rgba(255,255,255,0.3)', borderTopColor:'white', borderRadius:'50%', display:'inline-block', animation:'spin 0.7s linear infinite' }} /> Parsing…</>
            : <><Sparkles size={14}/> Extract Data</>
          }
        </button>

        {parsed && fieldCount > 0 && (
          <button
            onClick={handleApply}
            className="btn btn-secondary"
            style={{ display:'flex', alignItems:'center', gap:7, fontSize:13, padding:'7px 16px', background:'var(--success)', color:'white', border:'none' }}
          >
            <FileCheck size={14}/> Apply {fieldCount} Fields to Form
          </button>
        )}

        {parsed && fieldCount === 0 && (
          <div style={{ fontSize:12, color:'#DC2626', display:'flex', alignItems:'center', gap:5 }}>
            <AlertTriangle size:13 /> No fields could be extracted from this document.
          </div>
        )}
      </div>

      {/* Extracted data preview */}
      {parsed && fieldCount > 0 && (
        <div style={{ marginTop:14, padding:'12px 14px', background:'white', borderRadius:8, border:'1px solid #BFDBFE' }}>
          <div style={{ fontSize:11, fontWeight:700, color:'var(--primary)', marginBottom:10, textTransform:'uppercase', letterSpacing:'0.05em' }}>
            Extracted Data Preview
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'6px 20px' }}>
            {Object.entries(extractedToForm(parsed)).map(([key, val]) => (
              <div key={key} style={{ fontSize:12 }}>
                <span style={{ color:'var(--text-3)', fontWeight:600, textTransform:'capitalize' }}>
                  {key.replace(/([A-Z])/g, ' $1').trim()}:&nbsp;
                </span>
                <span style={{ color:'var(--text)', fontWeight:500 }}>
                  {String(val).length > 40 ? String(val).slice(0, 40) + '…' : String(val)}
                </span>
              </div>
            ))}
          </div>
          {parsed.directors && parsed.directors.length > 0 && (
            <div style={{ marginTop:8, paddingTop:8, borderTop:'1px solid #BFDBFE' }}>
              <div style={{ fontSize:11, fontWeight:700, color:'var(--text-3)', marginBottom:4 }}>Directors</div>
              {parsed.directors.map((d, i) => (
                <div key={i} style={{ fontSize:12, color:'var(--text-2)', marginBottom:2 }}>
                  {d.name} <span style={{ color:'var(--text-3)' }}>({d.designation})</span>
                  {d.din && <span style={{ color:'var(--text-4)', fontSize:11, marginLeft:6 }}>DIN: {d.din}</span>}
                </div>
              ))}
            </div>
          )}
          {parsed.cin && (
            <div style={{ marginTop:8, paddingTop:8, borderTop:'1px solid #BFDBFE', display:'flex', gap:16, flexWrap:'wrap', fontSize:12 }}>
              {parsed.cin && <span><span style={{ color:'var(--text-3)' }}>CIN:</span> <strong>{parsed.cin}</strong></span>}
              {parsed.dateOfIncorporation && <span><span style={{ color:'var(--text-3)' }}>Incorporated:</span> <strong>{parsed.dateOfIncorporation}</strong></span>}
              {parsed.companyStatus && <span><span style={{ color:'var(--text-3)' }}>Status:</span> <strong style={{ color:'var(--success)' }}>{parsed.companyStatus}</strong></span>}
              {parsed.authorisedCapital && <span><span style={{ color:'var(--text-3)' }}>Auth. Capital:</span> <strong>₹{parsed.authorisedCapital}</strong></span>}
            </div>
          )}
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}

// ─── Company Profile ───────────────────────────────────────────
function CompanySettings() {
  const { activeCompany, updateCompany } = useAuth()
  const companyId = activeCompany?.id
  const [form, setForm] = useState(() => buildForm(activeCompany))
  const [highlightedFields, setHighlightedFields] = useState(new Set())

  useEffect(() => {
    setForm(buildForm(activeCompany))
    setHighlightedFields(new Set())
  }, [companyId]) // eslint-disable-line react-hooks/exhaustive-deps

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  // Called when SmartDocUpload successfully extracts and the user clicks Apply
  const handleExtracted = (formUpdates, rawParsed) => {
    setForm(f => ({ ...f, ...formUpdates }))
    setHighlightedFields(new Set(Object.keys(formUpdates)))
    // Also pre-fill CIN from MCA data if not in standard form fields
    if (rawParsed.cin) setForm(f => ({ ...f, cin: rawParsed.cin, ...formUpdates }))
    toast.success('Form filled from document ✓ — review and save when ready')
    // Clear highlights after 4s
    setTimeout(() => setHighlightedFields(new Set()), 4000)
  }

  const handleSave = () => {
    if (!activeCompany) return
    updateCompany(activeCompany.id, {
      name:      form.tradeName,
      legalName: form.legalName,
      gstin:     form.gstin,
      pan:       form.pan,
      cin:       form.cin,
      tan:       form.tan,
      address:   form.address,
      city:      form.city,
      state:     form.state,
      pincode:   form.pincode,
      phone:     form.phone,
      email:     form.email,
      website:   form.website,
      fyStart:   form.fyStart,
      currency:  form.currency,
    })
    setHighlightedFields(new Set())
    toast.success('Company profile saved!')
  }

  const handleCancel = () => {
    setForm(buildForm(activeCompany))
    setHighlightedFields(new Set())
  }

  // Helper to style fields that were just filled by the parser
  const inputStyle = (key) => ({
    ...(highlightedFields.has(key) ? {
      border: '2px solid var(--success)',
      background: '#F0FDF4',
      transition: 'all 0.4s',
    } : {})
  })

  return (
    <>
      {/* ── Smart Document Upload ── */}
      <SmartDocUpload onExtracted={handleExtracted} />

      <Section title="Business Identity">
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'0 24px' }}>
          <Field label="Legal Name">
            <input className="input" value={form.legalName} onChange={e=>set('legalName',e.target.value)} style={inputStyle('legalName')}/>
          </Field>
          <Field label="Trade / Display Name">
            <input className="input" value={form.tradeName} onChange={e=>set('tradeName',e.target.value)} style={inputStyle('tradeName')}/>
          </Field>
          <Field label="GSTIN" hint="15-digit GST Identification Number">
            <input className="input" value={form.gstin} onChange={e=>set('gstin',e.target.value.toUpperCase())} placeholder="22AAAAA0000A1Z5" maxLength={15} style={inputStyle('gstin')}/>
          </Field>
          <Field label="PAN">
            <input className="input" value={form.pan} onChange={e=>set('pan',e.target.value.toUpperCase())} placeholder="AAAAA1234A" maxLength={10} style={inputStyle('pan')}/>
          </Field>
          <Field label="CIN (if applicable)">
            <input className="input" value={form.cin} onChange={e=>set('cin',e.target.value)} style={inputStyle('cin')}/>
          </Field>
          <Field label="TAN">
            <input className="input" value={form.tan} onChange={e=>set('tan',e.target.value)} style={inputStyle('tan')}/>
          </Field>
        </div>
      </Section>

      <Section title="Address & Contact">
        <Field label="Registered Address">
          <textarea className="input" rows={2} value={form.address} onChange={e=>set('address',e.target.value)} style={{ resize:'none', ...inputStyle('address') }}/>
        </Field>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:'0 16px' }}>
          <Field label="City">
            <input className="input" value={form.city} onChange={e=>set('city',e.target.value)} style={inputStyle('city')}/>
          </Field>
          <Field label="State">
            <select className="input" value={form.state} onChange={e=>set('state',e.target.value)} style={inputStyle('state')}>
              {STATES.map(s=><option key={s}>{s}</option>)}
            </select>
          </Field>
          <Field label="Pincode">
            <input className="input" value={form.pincode} onChange={e=>set('pincode',e.target.value)} maxLength={6} style={inputStyle('pincode')}/>
          </Field>
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:'0 16px' }}>
          <Field label="Phone">
            <input className="input" value={form.phone} onChange={e=>set('phone',e.target.value)} style={inputStyle('phone')}/>
          </Field>
          <Field label="Email">
            <input className="input" type="email" value={form.email} onChange={e=>set('email',e.target.value)} style={inputStyle('email')}/>
          </Field>
          <Field label="Website">
            <input className="input" value={form.website} onChange={e=>set('website',e.target.value)} style={inputStyle('website')}/>
          </Field>
        </div>
      </Section>

      <Section title="Financial Year & Currency">
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:'0 24px' }}>
          <Field label="FY Start Month" hint="Indian FY typically starts April">
            <select className="input" value={form.fyStart} onChange={e=>set('fyStart',e.target.value)}>
              <option value="04">April (Default — India)</option>
              <option value="01">January</option>
            </select>
          </Field>
          <Field label="Currency">
            <select className="input" value={form.currency} onChange={e=>set('currency',e.target.value)}>
              <option value="INR">INR — Indian Rupee (₹)</option>
              <option value="USD">USD — US Dollar</option>
              <option value="EUR">EUR — Euro</option>
            </select>
          </Field>
          <Field label="Round Off Method">
            <select className="input">
              <option>Nearest Rupee</option>
              <option>Nearest 50 Paise</option>
              <option>No Rounding</option>
            </select>
          </Field>
        </div>
      </Section>

      <div style={{ display:'flex', justifyContent:'flex-end', gap:10 }}>
        <button className="btn btn-secondary" onClick={handleCancel}>Cancel</button>
        <button className="btn btn-primary" onClick={handleSave}><Save size={13}/> Save Changes</button>
      </div>
    </>
  )
}

function buildForm(co) {
  return {
    legalName: co?.legalName || co?.name || '',
    tradeName: co?.name      || '',
    gstin:     co?.gstin     || '',
    pan:       co?.pan       || '',
    cin:       co?.cin       || '',
    tan:       co?.tan       || '',
    address:   co?.address   || '',
    city:      co?.city      || '',
    state:     co?.state     || 'Gujarat',
    pincode:   co?.pincode   || '',
    phone:     co?.phone     || '',
    email:     co?.email     || '',
    website:   co?.website   || '',
    fyStart:   co?.fyStart   || '04',
    currency:  co?.currency  || 'INR',
  }
}

const STATES = [
  'Andhra Pradesh','Assam','Bihar','Chhattisgarh','Delhi','Goa','Gujarat','Haryana',
  'Himachal Pradesh','Jharkhand','Karnataka','Kerala','Madhya Pradesh','Maharashtra',
  'Manipur','Meghalaya','Mizoram','Nagaland','Odisha','Punjab','Rajasthan','Sikkim',
  'Tamil Nadu','Telangana','Tripura','Uttar Pradesh','Uttarakhand','West Bengal',
]

// ─── Users & Roles ─────────────────────────────────────────────
function UsersSettings() {
  const ROLES = ['admin','accountant','auditor','view_only','billing']
  const ROLE_COLORS = { admin:'badge-red', accountant:'badge-blue', auditor:'badge-amber', view_only:'badge-gray', billing:'badge-green' }
  const ROLE_PERMS = {
    admin:       { view:true,  create:true,  edit:true,  delete:true,  export:true,  settings:true  },
    accountant:  { view:true,  create:true,  edit:true,  delete:false, export:true,  settings:false },
    auditor:     { view:true,  create:false, edit:false, delete:false, export:true,  settings:false },
    view_only:   { view:true,  create:false, edit:false, delete:false, export:false, settings:false },
    billing:     { view:true,  create:true,  edit:true,  delete:false, export:false, settings:false },
  }
  const [users, setUsers] = useState([
    { id:1, name:'Admin User',   email:'admin@finix.in',    role:'admin',      status:'active',  lastLogin:'Today 09:14' },
    { id:2, name:'Ravi Sharma',  email:'ravi@acmecorp.in',  role:'accountant', status:'active',  lastLogin:'Today 11:30' },
    { id:3, name:'Priya Mehta',  email:'priya@acmecorp.in', role:'auditor',    status:'active',  lastLogin:'Yesterday'   },
    { id:4, name:'Suresh Patel', email:'suresh@acmecorp.in',role:'view_only',  status:'invited', lastLogin:'Never'       },
  ])
  const [modal, setModal] = useState(null)
  const [form,  setForm]  = useState({ name:'', email:'', role:'accountant', sendInvite:true })
  const set = (k,v) => setForm(f=>({...f,[k]:v}))

  const handleSave = () => {
    if (!form.name || !form.email) { toast.error('Name and email required'); return }
    if (modal === 'add') {
      setUsers(u => [...u, { id:Date.now(), ...form, status:'invited', lastLogin:'Never' }])
      toast.success(`Invite sent to ${form.email}`)
    } else {
      setUsers(u => u.map(x => x.id===modal.id ? {...x, name:form.name, role:form.role} : x))
      toast.success('User updated')
    }
    setModal(null)
    setForm({ name:'', email:'', role:'accountant', sendInvite:true })
  }
  const handleEdit   = (u) => { setForm({ name:u.name, email:u.email, role:u.role, sendInvite:false }); setModal(u) }
  const handleDelete = (id) => { setUsers(u => u.filter(x=>x.id!==id)); toast.success('User removed') }

  return (
    <>
      <Section title="Team Members" action={
        <button className="btn btn-primary" style={{ fontSize:12 }} onClick={()=>{setForm({name:'',email:'',role:'accountant',sendInvite:true});setModal('add')}}><Plus size={12}/> Invite User</button>
      }>
        <table style={{ width:'100%', borderCollapse:'collapse' }}>
          <thead>
            <tr style={{ borderBottom:'1px solid var(--border)', fontSize:11, color:'var(--text-3)' }}>
              {['Name','Email','Role','Status','Last Login',''].map((h,i)=>(
                <th key={i} style={{ padding:'8px 10px', textAlign:'left', fontWeight:600 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {users.map(u => (
              <tr key={u.id} style={{ borderBottom:'1px solid var(--border)' }}
                onMouseEnter={e=>e.currentTarget.style.background='var(--surface-2)'}
                onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                <td style={{ padding:'10px 10px' }}>
                  <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                    <div style={{ width:28, height:28, borderRadius:'50%', background:'var(--primary-m)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:700, color:'var(--primary)', flexShrink:0 }}>
                      {u.name.charAt(0)}
                    </div>
                    <span style={{ fontWeight:500, fontSize:13 }}>{u.name}</span>
                  </div>
                </td>
                <td style={{ padding:'10px 10px', fontSize:12, color:'var(--text-3)' }}>{u.email}</td>
                <td style={{ padding:'10px 10px' }}>
                  <span className={`badge ${ROLE_COLORS[u.role]||'badge-gray'}`} style={{ textTransform:'capitalize' }}>{u.role}</span>
                </td>
                <td style={{ padding:'10px 10px' }}>
                  <span style={{ fontSize:11, padding:'2px 8px', borderRadius:10, background:u.status==='active'?'var(--success-l)':'var(--warning-l)', color:u.status==='active'?'var(--success)':'var(--warning)', fontWeight:600 }}>
                    {u.status}
                  </span>
                </td>
                <td style={{ padding:'10px 10px', fontSize:11, color:'var(--text-4)' }}>{u.lastLogin}</td>
                <td style={{ padding:'10px 10px' }}>
                  <div style={{ display:'flex', gap:6 }}>
                    <button className="btn btn-ghost btn-sm" onClick={()=>handleEdit(u)}><Edit2 size={12}/></button>
                    {u.role !== 'admin' && <button className="btn btn-ghost btn-sm" style={{ color:'var(--danger)' }} onClick={()=>handleDelete(u.id)}><Trash2 size={12}/></button>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <Section title="Role Permissions">
        <div style={{ overflowX:'auto' }}>
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
            <thead>
              <tr style={{ borderBottom:'1px solid var(--border)', background:'var(--surface-2)' }}>
                <th style={{ padding:'8px 12px', textAlign:'left', fontWeight:600 }}>Role</th>
                {['View','Create','Edit','Delete','Export','Settings'].map(p=>(
                  <th key={p} style={{ padding:'8px 12px', textAlign:'center', fontWeight:600 }}>{p}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ROLES.map(r=>(
                <tr key={r} style={{ borderBottom:'1px solid var(--border)' }}>
                  <td style={{ padding:'10px 12px' }}>
                    <span className={`badge ${ROLE_COLORS[r]||'badge-gray'}`} style={{ textTransform:'capitalize' }}>{r.replace('_',' ')}</span>
                  </td>
                  {Object.values(ROLE_PERMS[r]).map((has,i)=>(
                    <td key={i} style={{ padding:'10px 12px', textAlign:'center' }}>
                      {has ? <Check size={13} color="var(--success)"/> : <X size={13} color="var(--text-4)"/>}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ marginTop:12, padding:'10px 12px', background:'var(--info-l)', borderRadius:6, border:'1px solid var(--info-b)', fontSize:12, color:'var(--info)', display:'flex', gap:8 }}>
          <Info size={14} style={{ flexShrink:0, marginTop:1 }}/>
          Custom role permissions can be configured per company. Contact your admin to create custom roles.
        </div>
      </Section>

      {modal && (
        <div className="overlay" onClick={()=>setModal(null)}>
          <div className="modal" onClick={e=>e.stopPropagation()}>
            <div className="modal-head">
              <span className="modal-title">{modal==='add'?'Invite User':'Edit User'}</span>
              <button className="btn btn-ghost btn-icon" onClick={()=>setModal(null)}><X size={17}/></button>
            </div>
            <div className="modal-body">
              <div className="field-group"><label className="field-label">Full Name</label><input className="input" value={form.name} onChange={e=>set('name',e.target.value)} placeholder="Ravi Sharma"/></div>
              <div className="field-group"><label className="field-label">Email Address</label><input className="input" type="email" value={form.email} onChange={e=>set('email',e.target.value)} placeholder="ravi@company.in" disabled={modal!=='add'}/></div>
              <div className="field-group"><label className="field-label">Role</label>
                <select className="input" value={form.role} onChange={e=>set('role',e.target.value)}>
                  {ROLES.filter(r=>r!=='admin').map(r=><option key={r} value={r}>{r.replace('_',' ')}</option>)}
                </select>
              </div>
              {modal==='add' && (
                <label style={{ display:'flex', alignItems:'center', gap:8, fontSize:13, cursor:'pointer' }}>
                  <input type="checkbox" checked={form.sendInvite} onChange={e=>set('sendInvite',e.target.checked)}/>
                  Send email invitation to user
                </label>
              )}
            </div>
            <div className="modal-foot">
              <button className="btn btn-secondary" onClick={()=>setModal(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSave}>{modal==='add'?'Send Invite':'Save Changes'}</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

// ─── Security ────────────────────────────────────────────────
function SecuritySettings() {
  const [show, setShow]               = useState({})
  const toggle = (k) => setShow(s=>({...s,[k]:!s[k]}))
  const [twoFA,          setTwoFA]          = useState(false)
  const [sessionTimeout, setSessionTimeout] = useState('480')
  const [ipWhitelist,    setIpWhitelist]    = useState(false)

  return (
    <>
      <Section title="Change Password">
        <div style={{ maxWidth:400 }}>
          {['Current Password','New Password','Confirm New Password'].map((l,i)=>(
            <Field key={i} label={l}>
              <div style={{ position:'relative' }}>
                <input className="input" type={show[i]?'text':'password'} style={{ paddingRight:36 }} placeholder="••••••••"/>
                <button onClick={()=>toggle(i)} style={{ position:'absolute', right:8, top:'50%', transform:'translateY(-50%)', border:'none', background:'none', cursor:'pointer', color:'var(--text-3)', padding:4 }}>
                  {show[i]?<EyeOff size={14}/>:<Eye size={14}/>}
                </button>
              </div>
            </Field>
          ))}
          <div style={{ fontSize:11, color:'var(--text-4)', marginBottom:12 }}>Min 8 chars · 1 uppercase · 1 number · 1 special char</div>
          <button className="btn btn-primary" onClick={()=>toast.success('Password updated!')}><Lock size={13}/> Update Password</button>
        </div>
      </Section>

      <Section title="Two-Factor Authentication">
        <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:24 }}>
          <div>
            <div style={{ fontWeight:600, fontSize:13, marginBottom:4 }}>Authenticator App (TOTP)</div>
            <div style={{ fontSize:12, color:'var(--text-3)', marginBottom:12 }}>Use Google Authenticator or Authy for extra security</div>
            {twoFA
              ? <div style={{ display:'flex', alignItems:'center', gap:8, color:'var(--success)', fontSize:12, fontWeight:600 }}><Check size={14}/> 2FA is enabled</div>
              : <button className="btn btn-secondary" style={{ fontSize:12 }} onClick={()=>{setTwoFA(true);toast.success('2FA enabled! Scan QR with Authenticator app')}}><Key size={13}/> Enable 2FA</button>
            }
          </div>
          <div style={{ padding:'12px 16px', background:'var(--info-l)', borderRadius:6, border:'1px solid var(--info-b)', fontSize:11, color:'var(--info)', maxWidth:260 }}>
            <strong>Recommended:</strong> Enable 2FA for all admin accounts accessing financial data.
          </div>
        </div>
      </Section>

      <Section title="Session & Access Control">
        <Field label="Session Timeout" hint="Auto-logout after inactivity">
          <select className="input" style={{ width:240 }} value={sessionTimeout} onChange={e=>setSessionTimeout(e.target.value)}>
            <option value="30">30 minutes</option>
            <option value="60">1 hour</option>
            <option value="240">4 hours</option>
            <option value="480">8 hours (default)</option>
            <option value="1440">24 hours</option>
          </select>
        </Field>
        <Toggle2 value={ipWhitelist} onChange={setIpWhitelist} label="IP Whitelist — restrict login to specific IPs"/>
        <Toggle2 value={false} onChange={()=>toast.info('Feature coming soon')} label="Audit Log — track all user actions (required for CA firms)"/>
        <Toggle2 value={true} onChange={()=>{}} label="Login Alerts — email on new device login"/>
        <div style={{ marginTop:16 }}>
          <button className="btn btn-secondary" onClick={()=>toast.success('Active sessions terminated')} style={{ fontSize:12 }}>
            <RefreshCw size={12}/> Terminate All Other Sessions
          </button>
        </div>
      </Section>
    </>
  )
}

// ─── GST & Tax Settings ─────────────────────────────────────
function GSTSettings() {
  const [gstRegType,    setGstRegType]    = useState('regular')
  const [eInvoice,      setEInvoice]      = useState(false)
  const [eWayBill,      setEWayBill]      = useState(false)
  const [gspProvider,   setGspProvider]   = useState('')
  const [tdsApplicable, setTdsApplicable] = useState(true)

  return (
    <>
      <Section title="GST Registration">
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'0 24px' }}>
          <Field label="Registration Type">
            <select className="input" value={gstRegType} onChange={e=>setGstRegType(e.target.value)}>
              <option value="regular">Regular Taxpayer</option>
              <option value="composition">Composition Scheme</option>
              <option value="unregistered">Unregistered</option>
              <option value="sez">SEZ Unit</option>
            </select>
          </Field>
          <Field label="Filing Frequency">
            <select className="input">
              <option>Monthly (GSTR-1 + GSTR-3B)</option>
              <option>Quarterly (QRMP Scheme)</option>
            </select>
          </Field>
          <Field label="State of Registration">
            <select className="input">
              {STATES.map(s=><option key={s}>{s}</option>)}
            </select>
          </Field>
          <Field label="Aggregate Turnover (₹ Cr)">
            <input className="input" type="number" placeholder="e.g. 5.5"/>
          </Field>
        </div>
      </Section>

      <Section title="E-Invoice & E-Way Bill">
        <Toggle2 value={eInvoice} onChange={v=>{setEInvoice(v);v&&toast.success('E-Invoice enabled — IRP integration active')}} label="E-Invoice (IRN) — mandatory above ₹5 Cr turnover"/>
        <Toggle2 value={eWayBill} onChange={v=>{setEWayBill(v);v&&toast.success('E-Way Bill auto-generation enabled')}} label="Auto E-Way Bill generation on invoice save"/>
        {eInvoice && (
          <Field label="GSP Provider" hint="Government Sanctioned Portal for e-invoice integration">
            <select className="input" value={gspProvider} onChange={e=>setGspProvider(e.target.value)}>
              <option value="">Select GSP</option>
              <option>Tata Consultancy Services (TCS)</option>
              <option>Mastech Digital</option>
              <option>IRIS Business</option>
              <option>ClearTax</option>
              <option>Tera Software</option>
            </select>
          </Field>
        )}
      </Section>

      <Section title="TDS / TCS Configuration">
        <Toggle2 value={tdsApplicable} onChange={setTdsApplicable} label="TDS Applicable on this entity"/>
        {tdsApplicable && (
          <div style={{ marginTop:12 }}>
            <div style={{ fontSize:12, fontWeight:600, color:'var(--text-2)', marginBottom:10 }}>TDS Sections in use:</div>
            {[
              { section:'194C', desc:'Payments to Contractors', rate:'1% / 2%' },
              { section:'194I', desc:'Rent', rate:'10%' },
              { section:'194J', desc:'Professional / Technical Services', rate:'10%' },
              { section:'194Q', desc:'Purchase of Goods (>₹50L)', rate:'0.1%' },
            ].map(t => (
              <div key={t.section} style={{ display:'flex', alignItems:'center', gap:12, padding:'8px 10px', borderRadius:6, border:'1px solid var(--border)', marginBottom:6, fontSize:12 }}>
                <input type="checkbox" defaultChecked/>
                <span style={{ fontWeight:600, fontFamily:'var(--mono)', color:'var(--accent)' }}>{t.section}</span>
                <span style={{ flex:1, color:'var(--text-2)' }}>{t.desc}</span>
                <span style={{ color:'var(--text-3)' }}>Rate: {t.rate}</span>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section title="HSN / SAC Codes">
        <div style={{ display:'flex', gap:12, alignItems:'center', marginBottom:12 }}>
          <input className="input" placeholder="Search HSN or SAC code…" style={{ flex:1 }}/>
          <button className="btn btn-secondary" style={{ fontSize:12 }}><Plus size={12}/> Add HSN</button>
        </div>
        <div style={{ padding:'10px 12px', background:'var(--info-l)', borderRadius:6, border:'1px solid var(--info-b)', fontSize:12, color:'var(--info)' }}>
          HSN codes are auto-fetched from NIC portal. You can override for custom product mappings.
        </div>
      </Section>

      <div style={{ display:'flex', justifyContent:'flex-end' }}>
        <button className="btn btn-primary" onClick={()=>toast.success('GST settings saved!')}><Save size={13}/> Save GST Settings</button>
      </div>
    </>
  )
}

// ─── Notifications ────────────────────────────────────────────
function NotificationsSettings() {
  const NOTIFS = [
    { group:'Compliance', items:[
      { key:'gst_due',   label:'GST Filing Due Reminders', sub:'7 days, 3 days, 1 day before' },
      { key:'tds_due',   label:'TDS Challan Due (7th every month)' },
      { key:'roc_due',   label:'MCA / ROC Filing Reminders' },
      { key:'itr_due',   label:'Income Tax Return Reminders' },
    ]},
    { group:'Banking', items:[
      { key:'reconcile', label:'Unreconciled Transactions Alert' },
      { key:'low_bal',   label:'Low Bank Balance Alert' },
      { key:'cheque',    label:'Cheque Bounce / Dishonour Alert' },
    ]},
    { group:'Business', items:[
      { key:'overdue',   label:'Outstanding Receivables (overdue)' },
      { key:'payables',  label:'Payables Due Reminders' },
      { key:'payroll',   label:'Payroll Processing Reminders' },
    ]},
    { group:'AI & System', items:[
      { key:'ai_classify',label:'AI Classification Anomalies' },
      { key:'data_backup',label:'Daily Backup Completion' },
      { key:'login',      label:'New Login / Suspicious Activity' },
    ]},
  ]
  const [settings, setSettings] = useState(() => {
    const s = {}
    NOTIFS.forEach(g=>g.items.forEach(i=>{ s[i.key]={email:true,sms:false,push:true} }))
    return s
  })
  const toggle = (key,ch) => setSettings(s=>({...s,[key]:{...s[key],[ch]:!s[key][ch]}}))

  return (
    <>
      {NOTIFS.map(group=>(
        <Section key={group.group} title={group.group + ' Notifications'}>
          <div style={{ display:'grid', gridTemplateColumns:'1fr auto auto auto', gap:'0 24px', alignItems:'center' }}>
            <div style={{ fontSize:11, fontWeight:700, color:'var(--text-4)', padding:'0 0 8px' }}>Alert</div>
            {['Email','SMS','Push'].map(ch=>(
              <div key={ch} style={{ fontSize:11, fontWeight:700, color:'var(--text-4)', padding:'0 0 8px', textAlign:'center' }}>{ch}</div>
            ))}
          </div>
          {group.items.map(item=>(
            <div key={item.key} style={{ display:'grid', gridTemplateColumns:'1fr auto auto auto', gap:'0 24px', alignItems:'center', padding:'8px 0', borderBottom:'1px solid var(--border)' }}>
              <div>
                <div style={{ fontSize:13 }}>{item.label}</div>
                {item.sub && <div style={{ fontSize:11, color:'var(--text-4)' }}>{item.sub}</div>}
              </div>
              {['email','sms','push'].map(ch=>(
                <div key={ch} style={{ textAlign:'center' }}>
                  <button onClick={()=>toggle(item.key,ch)} style={{
                    width:32, height:18, borderRadius:9, border:'none', cursor:'pointer',
                    background:settings[item.key]?.[ch]?'var(--accent)':'var(--border-2)',
                    position:'relative', transition:'background .2s'
                  }}>
                    <span style={{
                      display:'block', width:12, height:12, borderRadius:'50%', background:'white',
                      position:'absolute', top:3, left:settings[item.key]?.[ch]?17:3, transition:'left .2s',
                      boxShadow:'0 1px 2px rgba(0,0,0,.2)'
                    }}/>
                  </button>
                </div>
              ))}
            </div>
          ))}
        </Section>
      ))}
      <div style={{ display:'flex', justifyContent:'flex-end' }}>
        <button className="btn btn-primary" onClick={()=>toast.success('Notification preferences saved!')}><Save size={13}/> Save</button>
      </div>
    </>
  )
}

// ─── Appearance ──────────────────────────────────────────────
function AppearanceSettings() {
  const [lang,       setLang]       = useState('en')
  const [dateFormat, setDateFormat] = useState('DD-MM-YYYY')
  const [numFormat,  setNumFormat]  = useState('indian')
  const [density,    setDensity]    = useState('comfortable')

  return (
    <>
      <Section title="Regional Settings">
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'0 24px' }}>
          <Field label="Language">
            <select className="input" value={lang} onChange={e=>setLang(e.target.value)}>
              <option value="en">English</option>
              <option value="hi">हिन्दी (Hindi)</option>
              <option value="gu">ગુજરાતી (Gujarati)</option>
              <option value="mr">मराठी (Marathi)</option>
              <option value="ta">தமிழ் (Tamil)</option>
              <option value="te">తెలుగు (Telugu)</option>
            </select>
          </Field>
          <Field label="Date Format">
            <select className="input" value={dateFormat} onChange={e=>setDateFormat(e.target.value)}>
              <option value="DD-MM-YYYY">DD-MM-YYYY (Indian default)</option>
              <option value="DD/MM/YYYY">DD/MM/YYYY</option>
              <option value="YYYY-MM-DD">YYYY-MM-DD</option>
            </select>
          </Field>
          <Field label="Number Format">
            <select className="input" value={numFormat} onChange={e=>setNumFormat(e.target.value)}>
              <option value="indian">₹1,23,45,678 (Indian Lakh System)</option>
              <option value="international">₹12,345,678 (International)</option>
            </select>
          </Field>
          <Field label="Timezone">
            <select className="input"><option>Asia/Kolkata (IST, UTC+5:30)</option></select>
          </Field>
        </div>
      </Section>
      <Section title="Display Density">
        <div style={{ display:'flex', gap:12 }}>
          {['compact','comfortable','spacious'].map(d=>(
            <button key={d} onClick={()=>{setDensity(d);toast.success(`Layout: ${d}`)}} style={{
              padding:'10px 20px', borderRadius:8, border:`2px solid ${density===d?'var(--accent)':'var(--border)'}`,
              background:density===d?'var(--primary-l)':'var(--surface)',
              color:density===d?'var(--accent)':'var(--text-2)',
              fontWeight:density===d?700:400, cursor:'pointer', fontSize:13, textTransform:'capitalize'
            }}>{d}</button>
          ))}
        </div>
      </Section>
    </>
  )
}

// ─── AI Settings ─────────────────────────────────────────────
function AISettings() {
  const [autoClassify,       setAutoClassify]   = useState(true)
  const [smartReconcile,     setSmartReconcile] = useState(true)
  const [anomalyDetect,      setAnomalyDetect]  = useState(true)
  const [forecastingEnabled, setForecasting]    = useState(false)
  const [taxOptimiser,       setTaxOptimiser]   = useState(true)
  const [confidence,         setConfidence]     = useState(85)

  return (
    <>
      <Section title="AI Automation">
        <div style={{ display:'flex', alignItems:'center', gap:12, padding:'10px 12px', background:'linear-gradient(135deg, #EFF6FF, #F5F3FF)', borderRadius:8, border:'1px solid #DBEAFE', marginBottom:16 }}>
          <Zap size={20} color="#2563EB"/>
          <div>
            <div style={{ fontWeight:700, fontSize:13, color:'var(--primary)' }}>FINIX AI Engine — Active</div>
            <div style={{ fontSize:11, color:'var(--text-3)' }}>Powered by Claude · 98.2% classification accuracy this month</div>
          </div>
          <span className="badge badge-blue" style={{ marginLeft:'auto' }}>Enabled</span>
        </div>
        <Toggle2 value={autoClassify}       onChange={setAutoClassify}   label="Auto-classify bank transactions using AI"/>
        <Toggle2 value={smartReconcile}     onChange={setSmartReconcile} label="Smart reconciliation — AI-powered matching"/>
        <Toggle2 value={anomalyDetect}      onChange={setAnomalyDetect}  label="Anomaly detection — flag unusual entries"/>
        <Toggle2 value={forecastingEnabled} onChange={v=>{setForecasting(v);v&&toast.success('Cash flow forecasting enabled!')}} label="Cash flow forecasting (Beta)"/>
        <Toggle2 value={taxOptimiser}       onChange={setTaxOptimiser}   label="Tax optimiser suggestions — ITC & deductions"/>
        <Field label={`Minimum AI Confidence Threshold: ${confidence}%`} hint="Transactions below this confidence score will be flagged for manual review">
          <input type="range" min={50} max={99} value={confidence} onChange={e=>setConfidence(Number(e.target.value))} style={{ width:'100%', accentColor:'var(--accent)' }}/>
          <div style={{ display:'flex', justifyContent:'space-between', fontSize:11, color:'var(--text-4)', marginTop:4 }}>
            <span>50% (more auto)</span><span>99% (more manual)</span>
          </div>
        </Field>
      </Section>

      <Section title="AI Assistant">
        <Toggle2 value={true}  onChange={()=>{}}                                   label="Smart Assistant — conversational queries in natural language"/>
        <Toggle2 value={true}  onChange={()=>{}}                                   label="Layman Mode — explain accounting in simple terms"/>
        <Toggle2 value={false} onChange={()=>toast.info('Whatsapp integration coming soon')} label="WhatsApp Bot — ask queries via WhatsApp (Coming Soon)"/>
        <Toggle2 value={false} onChange={()=>toast.info('Voice input coming soon')}          label="Voice Input — dictate entries (Coming Soon)"/>
      </Section>

      <div style={{ display:'flex', justifyContent:'flex-end' }}>
        <button className="btn btn-primary" onClick={()=>toast.success('AI settings saved!')}><Save size={13}/> Save</button>
      </div>
    </>
  )
}

// ─── Integrations ─────────────────────────────────────────────
function IntegrationsSettings() {
  const INTEGRATIONS = [
    { name:'Tally Prime',      icon:'🏢', desc:'Import/export data from Tally ERP 9 / Prime' },
    { name:'Zoho Books',       icon:'📊', desc:'Migrate data from Zoho Books'                 },
    { name:'QuickBooks',       icon:'💼', desc:'Import from QuickBooks Online / Desktop'       },
    { name:'HDFC Bank Feed',   icon:'🏦', desc:'Auto-import bank statement daily'              },
    { name:'ICICI Bank Feed',  icon:'🏦', desc:'Auto-import bank statement daily'              },
    { name:'SBI Bank Feed',    icon:'🏦', desc:'Auto-import SBI bank statement'                },
    { name:'ClearTax GST',     icon:'📋', desc:'File GSTR-1, GSTR-3B via ClearTax'            },
    { name:'Razorpay',         icon:'💳', desc:'Auto-reconcile Razorpay collections'           },
    { name:'Paytm Business',   icon:'💳', desc:'Auto-reconcile Paytm settlements'              },
    { name:'AWS / GCP',        icon:'☁️', desc:'Cloud storage for audit trail documents'       },
    { name:'Google Workspace', icon:'📧', desc:'Send invoices via Gmail'                       },
    { name:'Slack',            icon:'💬', desc:'Financial alerts in Slack channel'             },
  ]
  const [connected, setConnected] = useState(['HDFC Bank Feed','ClearTax GST'])
  const toggle = (name) => {
    setConnected(c => c.includes(name) ? c.filter(x=>x!==name) : [...c, name])
    toast.success(connected.includes(name) ? `${name} disconnected` : `${name} connected!`)
  }

  return (
    <Section title="Available Integrations">
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
        {INTEGRATIONS.map(ig=>(
          <div key={ig.name} style={{ padding:'14px 16px', border:`1px solid ${connected.includes(ig.name)?'var(--accent)':'var(--border)'}`, borderRadius:8, background:connected.includes(ig.name)?'var(--primary-l)':'var(--surface)', display:'flex', alignItems:'center', gap:12 }}>
            <span style={{ fontSize:22, flexShrink:0 }}>{ig.icon}</span>
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ fontWeight:600, fontSize:13 }}>{ig.name}</div>
              <div style={{ fontSize:11, color:'var(--text-3)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{ig.desc}</div>
            </div>
            <button className={`btn btn-sm ${connected.includes(ig.name)?'btn-secondary':'btn-primary'}`} style={{ fontSize:11, flexShrink:0 }} onClick={()=>toggle(ig.name)}>
              {connected.includes(ig.name)?'Disconnect':'Connect'}
            </button>
          </div>
        ))}
      </div>
    </Section>
  )
}

// ─── Data & Backup ────────────────────────────────────────────
function DataSettings() {
  return (
    <>
      <Section title="Data Export">
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
          {[
            { label:'Export All Vouchers',       fmt:'Excel / CSV', icon:'📊' },
            { label:'Export Chart of Accounts',  fmt:'Excel',       icon:'📋' },
            { label:'Export Trial Balance',       fmt:'PDF / Excel', icon:'⚖️'  },
            { label:'Export GSTR Data',           fmt:'JSON / Excel',icon:'🏛️'  },
            { label:'Export Payroll Data',        fmt:'Excel',       icon:'👥' },
            { label:'Full Company Backup',        fmt:'ZIP Archive', icon:'💾' },
          ].map(e=>(
            <div key={e.label} style={{ padding:'14px 16px', border:'1px solid var(--border)', borderRadius:8, display:'flex', alignItems:'center', gap:12 }}>
              <span style={{ fontSize:20 }}>{e.icon}</span>
              <div style={{ flex:1 }}>
                <div style={{ fontWeight:600, fontSize:13 }}>{e.label}</div>
                <div style={{ fontSize:11, color:'var(--text-3)' }}>{e.fmt}</div>
              </div>
              <button className="btn btn-secondary btn-sm" style={{ fontSize:11 }} onClick={()=>toast.success(`${e.label} downloaded`)}><Upload size={11}/> Export</button>
            </div>
          ))}
        </div>
      </Section>
      <Section title="Automated Backup">
        <Toggle2 value={true} onChange={()=>{}} label="Daily automatic backup at 2:00 AM IST"/>
        <Toggle2 value={true} onChange={()=>{}} label="Email backup summary to admin"/>
        <Field label="Backup Retention">
          <select className="input" style={{ width:240 }}>
            <option>30 days</option><option>90 days</option><option>1 year</option><option>7 years (CA recommended)</option>
          </select>
        </Field>
        <div style={{ padding:'10px 12px', background:'var(--success-l)', borderRadius:6, border:'1px solid var(--success-b)', fontSize:12, color:'var(--success)', display:'flex', gap:8, alignItems:'center' }}>
          <Check size={14}/> Last backup: Today at 02:00 AM — All data secure
        </div>
      </Section>
      <Section title="Danger Zone">
        <div style={{ padding:'12px 16px', border:'2px solid var(--danger-b)', borderRadius:8, background:'var(--danger-l)' }}>
          <div style={{ fontWeight:600, fontSize:13, color:'var(--danger)', marginBottom:4 }}>Delete All Data</div>
          <div style={{ fontSize:12, color:'var(--text-2)', marginBottom:12 }}>Permanently delete all vouchers and data for this financial year. This cannot be undone.</div>
          <button className="btn" style={{ background:'var(--danger)', color:'white', fontSize:12 }} onClick={()=>toast.error('Please contact support for data deletion')}>
            <Trash2 size={12}/> Delete FY 2024-25 Data
          </button>
        </div>
      </Section>
    </>
  )
}

// ─── Print & Invoice ──────────────────────────────────────────
function PrintSettings() {
  const [template, setTemplate] = useState('professional')
  return (
    <>
      <Section title="Invoice Template">
        <div style={{ display:'flex', gap:12, marginBottom:16 }}>
          {['professional','minimal','classic','colorful'].map(t=>(
            <button key={t} onClick={()=>{setTemplate(t);toast.success(`Template: ${t}`)}} style={{
              padding:'12px 16px', borderRadius:8, border:`2px solid ${template===t?'var(--accent)':'var(--border)'}`,
              background:template===t?'var(--primary-l)':'var(--surface)', cursor:'pointer',
              color:template===t?'var(--accent)':'var(--text-2)', fontWeight:template===t?700:400, fontSize:12, textTransform:'capitalize'
            }}>{t}</button>
          ))}
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'0 24px' }}>
          <Field label="Invoice Prefix"><input className="input" defaultValue="INV-"/></Field>
          <Field label="Starting Number"><input className="input" type="number" defaultValue="1001"/></Field>
          <Field label="Payment Terms"><select className="input"><option>Net 30</option><option>Net 15</option><option>Due on Receipt</option><option>Net 60</option></select></Field>
          <Field label="Late Fee (% per month)"><input className="input" type="number" defaultValue="1.5" step="0.1"/></Field>
        </div>
      </Section>
      <Section title="Invoice Content">
        <Toggle2 value={true}  onChange={()=>{}} label="Show GSTIN on invoice"/>
        <Toggle2 value={true}  onChange={()=>{}} label="Show HSN/SAC codes"/>
        <Toggle2 value={true}  onChange={()=>{}} label="Show bank details for payment"/>
        <Toggle2 value={false} onChange={()=>{}} label="Enable digital signature on PDF"/>
        <Toggle2 value={true}  onChange={()=>{}} label="Auto-send invoice to customer email"/>
        <Toggle2 value={false} onChange={()=>toast.info('WhatsApp invoicing coming soon')} label="Send invoice via WhatsApp (Coming Soon)"/>
      </Section>
    </>
  )
}

// ─── Payroll Settings ─────────────────────────────────────────
function PayrollSettings() {
  return (
    <>
      <Section title="Statutory Compliance">
        <Toggle2 value={true}  onChange={()=>{}} label="PF (Provident Fund) — 12% employer + 12% employee"/>
        <Toggle2 value={true}  onChange={()=>{}} label="ESI (Employee State Insurance) — applicable below ₹21,000 salary"/>
        <Toggle2 value={true}  onChange={()=>{}} label="Professional Tax — state-wise deduction"/>
        <Toggle2 value={true}  onChange={()=>{}} label="TDS on Salary (Section 192)"/>
        <Toggle2 value={false} onChange={()=>{}} label="NPS (National Pension System)"/>
        <Toggle2 value={false} onChange={()=>{}} label="Gratuity Provisioning"/>
      </Section>
      <Section title="Payroll Configuration">
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'0 24px' }}>
          <Field label="Salary Processing Day"><select className="input">{[...Array(28)].map((_,i)=><option key={i+1}>{i+1}th of month</option>)}</select></Field>
          <Field label="PF Registration Number"><input className="input" placeholder="MH/MUM/123456"/></Field>
          <Field label="ESIC Registration Number"><input className="input" placeholder="31-12345-101"/></Field>
          <Field label="LWF (Labour Welfare Fund)"><select className="input"><option>Applicable</option><option>Not Applicable</option></select></Field>
        </div>
      </Section>
      <div style={{ display:'flex', justifyContent:'flex-end' }}>
        <button className="btn btn-primary" onClick={()=>toast.success('Payroll settings saved!')}><Save size={13}/> Save</button>
      </div>
    </>
  )
}

// ─── Main Settings Page ───────────────────────────────────────
const PANELS = {
  company:       CompanySettings,
  users:         UsersSettings,
  security:      SecuritySettings,
  gst:           GSTSettings,
  payroll:       PayrollSettings,
  notifications: NotificationsSettings,
  appearance:    AppearanceSettings,
  integrations:  IntegrationsSettings,
  ai:            AISettings,
  data:          DataSettings,
  print:         PrintSettings,
}

export default function Settings() {
  const [active, setActive] = useState('company')
  const Panel   = PANELS[active] || CompanySettings
  const current = SIDEBAR.find(s => s.key === active)

  return (
    <div className="page-wrap page-enter">
      <div className="page-header">
        <div>
          <h1 className="page-title">Settings</h1>
          <p className="page-sub">Configure FINIX for your Indian accounting needs</p>
        </div>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'220px 1fr', gap:16, alignItems:'start' }}>
        {/* Sidebar */}
        <div className="card" style={{ padding:'8px 0', position:'sticky', top:8 }}>
          {SIDEBAR.map(s=>(
            <button key={s.key} onClick={()=>setActive(s.key)} style={{
              width:'100%', display:'flex', alignItems:'center', gap:10, padding:'10px 14px',
              background:active===s.key?'var(--primary-l)':'transparent',
              borderLeft:active===s.key?'3px solid var(--accent)':'3px solid transparent',
              border:'none', cursor:'pointer', textAlign:'left'
            }}>
              <s.icon size={15} color={active===s.key?'var(--accent)':'var(--text-3)'}/>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize:12, fontWeight:active===s.key?700:500, color:active===s.key?'var(--accent)':'var(--text-2)' }}>{s.label}</div>
                <div style={{ fontSize:10, color:'var(--text-4)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{s.desc}</div>
              </div>
              {active===s.key && <ChevronRight size={12} color="var(--accent)"/>}
            </button>
          ))}
        </div>

        {/* Content */}
        <div>
          <div style={{ marginBottom:16, padding:'12px 16px', background:'var(--surface)', borderRadius:8, border:'1px solid var(--border)', display:'flex', alignItems:'center', gap:10 }}>
            {current && <current.icon size={16} color="var(--accent)"/>}
            <div>
              <div style={{ fontWeight:700, fontSize:14 }}>{current?.label}</div>
              <div style={{ fontSize:11, color:'var(--text-3)' }}>{current?.desc}</div>
            </div>
          </div>
          <Panel />
        </div>
      </div>
    </div>
  )
}
