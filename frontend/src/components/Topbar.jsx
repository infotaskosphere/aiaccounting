// src/components/Topbar.jsx
import { useState, useEffect, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import {
  LayoutDashboard, BookOpen, ArrowLeftRight, FileText,
  Users, Building2, Settings, Bell, ChevronDown,
  LogOut, UserCircle, Plus, Check, BarChart2, HelpCircle,
  RefreshCw, FileSpreadsheet, CreditCard, Briefcase,
  PieChart, TrendingUp, Receipt, List
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'

const NAV = [
  { key:'dashboard', label:'Dashboard', icon:LayoutDashboard, to:'/', exact:true },
  {
    key:'accounting', label:'Accounting', icon:BookOpen,
    children:[
      { label:'Journal & Ledger',  icon:List,           to:'/journal',       desc:'All vouchers and entries' },
      { label:'Chart of Accounts', icon:FileSpreadsheet,to:'/accounts',      desc:'Account master list' },
      { label:'Trial Balance',     icon:BarChart2,      to:'/trial-balance', desc:'Dr/Cr summary' },
    ]
  },
  {
    key:'banking', label:'Banking', icon:CreditCard,
    children:[
      { label:'Bank Accounts',   icon:Briefcase,      to:'/bank', desc:'Manage bank accounts' },
      { label:'Reconciliation',  icon:RefreshCw,      to:'/bank', desc:'Match transactions' },
      { label:'Import Statement',icon:ArrowLeftRight, to:'/bank', desc:'Upload CSV/Excel/PDF' },
    ]
  },
  {
    key:'compliance', label:'GST & Tax', icon:Receipt,
    children:[
      { label:'GST Reports',  icon:FileText, to:'/gst', desc:'GSTR-1, GSTR-3B' },
      { label:'GSTR-1 Filing',icon:FileText, to:'/gst', desc:'Outward supplies' },
      { label:'TDS / TCS',    icon:Receipt,  to:'/gst', desc:'Tax deducted at source' },
    ]
  },
  {
    key:'payroll', label:'Payroll', icon:Users,
    children:[
      { label:'Salary Processing',icon:Users,       to:'/payroll', desc:'Run monthly payroll' },
      { label:'Employee Master',  icon:UserCircle,  to:'/payroll', desc:'Manage employees' },
      { label:'PF / ESIC / TDS',  icon:FileText,    to:'/payroll', desc:'Statutory compliance' },
    ]
  },
  {
    key:'reports', label:'Reports', icon:PieChart,
    children:[
      { label:'P&L Statement', icon:TrendingUp,     to:'/reports', desc:'Profit & loss' },
      { label:'Balance Sheet', icon:BarChart2,      to:'/reports', desc:'Assets & liabilities' },
      { label:'Cash Flow',     icon:ArrowLeftRight, to:'/reports', desc:'Inflow / outflow' },
    ]
  },
]

function useOutsideClick(ref, cb) {
  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) cb() }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [ref, cb])
}

export default function Topbar() {
  const { user, companies, activeCompany, switchCompany, logout } = useAuth()
  const navigate  = useNavigate()
  const location  = useLocation()
  const [open, setOpen]         = useState(null)
  const [coDrop, setCoDrop]     = useState(false)
  const [userDrop, setUserDrop] = useState(false)
  const navRef  = useRef(null)
  const coRef   = useRef(null)
  const userRef = useRef(null)

  useOutsideClick(navRef,  () => setOpen(null))
  useOutsideClick(coRef,   () => setCoDrop(false))
  useOutsideClick(userRef, () => setUserDrop(false))

  const isActive = (item) => {
    if (item.to) return item.exact ? location.pathname === item.to : location.pathname.startsWith(item.to)
    if (item.children) return item.children.some(c => location.pathname === c.to)
    return false
  }

  const goTo = (to) => { navigate(to); setOpen(null); setCoDrop(false) }

  return (
    <header className="topbar">
      <div className="tb-logo" onClick={() => goTo('/')} style={{ cursor:'pointer' }}>
        <img src="/src/assets/logo.png" alt="Finix" style={{ height: 32, width: 'auto', display: 'block' }} />
      </div>

      <nav className="tb-nav" ref={navRef}>
        {NAV.map(item => (
          <div key={item.key} className={`tb-item${open === item.key ? ' open' : ''}`}>
            <div
              className={`tb-link${isActive(item) ? ' active' : ''}`}
              onClick={() => {
                if (item.to) { goTo(item.to); setOpen(null) }
                else setOpen(open === item.key ? null : item.key)
              }}
            >
              <item.icon size={14} />
              {item.label}
              {item.children && <ChevronDown size={12} className="caret" />}
            </div>

            {item.children && open === item.key && (
              <div className="tb-dropdown">
                <div className="dd-header">{item.label}</div>
                {item.children.map(child => (
                  <button
                    key={child.to + child.label}
                    className={`dd-item${location.pathname === child.to ? ' active' : ''}`}
                    onClick={() => goTo(child.to)}
                  >
                    <child.icon size={14} />
                    <div>
                      <div style={{ fontWeight:600, marginBottom:1 }}>{child.label}</div>
                      <div style={{ fontSize:'var(--fs-xs)', color:'var(--text-4)', fontWeight:400 }}>{child.desc}</div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </nav>

      <div className="tb-right">
        {/* Company switcher */}
        <div style={{ position:'relative' }} ref={coRef}>
          <div className="company-switcher" onClick={() => setCoDrop(d => !d)}>
            <div className="co-dot" style={{ background: activeCompany?.color || 'rgba(255,255,255,.2)' }}>
              {activeCompany?.initials || '?'}
            </div>
            <div style={{ overflow:'hidden' }}>
              <div className="co-name">{activeCompany?.name || 'Select Company'}</div>
              <div className="co-fy">{activeCompany?.fy}</div>
            </div>
            <ChevronDown size={12} style={{ opacity:.7, flexShrink:0 }} />
          </div>
          {coDrop && (
            <div className="tb-dropdown" style={{ right:0, left:'auto', minWidth:240 }}>
              <div className="dd-header">Switch Company</div>
              {companies.map(co => (
                <button
                  key={co.id}
                  className={`dd-item${activeCompany?.id === co.id ? ' active' : ''}`}
                  onClick={() => { switchCompany(co); setCoDrop(false) }}
                >
                  <div style={{ width:20, height:20, borderRadius:4, background:co.color, display:'flex', alignItems:'center', justifyContent:'center', fontSize:9, fontWeight:700, color:'white', flexShrink:0 }}>
                    {co.initials}
                  </div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontWeight:600, fontSize:'var(--fs-sm)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{co.name}</div>
                    <div style={{ fontSize:'var(--fs-xs)', color:'var(--text-4)' }}>{co.type}</div>
                  </div>
                  {activeCompany?.id === co.id && <Check size={13} />}
                </button>
              ))}
              <div className="dd-sep" />
              <button className="dd-item" onClick={() => { goTo('/companies'); setCoDrop(false) }}>
                <Plus size={14} />
                <div><div style={{ fontWeight:600 }}>Add / Manage Companies</div></div>
              </button>
            </div>
          )}
        </div>

        <button className="tb-icon-btn" title="Notifications" style={{ position:'relative' }}>
          <Bell size={16} />
          <span className="notif-dot" />
        </button>

        <button className="tb-icon-btn" title="Help">
          <HelpCircle size={16} />
        </button>

        <div style={{ position:'relative' }} ref={userRef}>
          <button className="user-btn" onClick={() => setUserDrop(d => !d)}>
            <div className="user-av">{user?.name?.charAt(0) || 'U'}</div>
            <span style={{ maxWidth:90, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
              {user?.name}
            </span>
            <ChevronDown size={12} style={{ opacity:.7, flexShrink:0 }} />
          </button>
          {userDrop && (
            <div className="tb-dropdown" style={{ right:0, left:'auto', minWidth:200 }}>
              <div style={{ padding:'12px 14px', borderBottom:'1px solid var(--border)' }}>
                <div style={{ fontWeight:600, fontSize:'var(--fs-sm)' }}>{user?.name}</div>
                <div style={{ fontSize:'var(--fs-xs)', color:'var(--text-3)', marginTop:2 }}>{user?.email}</div>
                <span className="badge badge-blue" style={{ marginTop:5 }}>{user?.role}</span>
              </div>
              <button className="dd-item" onClick={() => { goTo('/companies'); setUserDrop(false) }}>
                <Building2 size={14} />
                <div><div style={{ fontWeight:600 }}>Manage Companies</div></div>
              </button>
              <button className="dd-item" onClick={() => { goTo('/settings'); setUserDrop(false) }}>
                <Settings size={14} />
                <div><div style={{ fontWeight:600 }}>Settings</div></div>
              </button>
              <div className="dd-sep" />
              <button className="dd-item" style={{ color:'var(--danger)' }} onClick={logout}>
                <LogOut size={14} />
                <div><div style={{ fontWeight:600 }}>Sign Out</div></div>
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
