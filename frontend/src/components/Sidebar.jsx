// src/components/Sidebar.jsx
import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard, BookOpen, Building2, ArrowLeftRight,
  FileText, Users, Settings, ChevronRight, Zap
} from 'lucide-react'

const navItems = [
  { label: 'Dashboard',       icon: LayoutDashboard, to: '/' },
  { label: 'Journal & Ledger', icon: BookOpen,        to: '/journal' },
  { label: 'Bank & Reconcile', icon: ArrowLeftRight,  to: '/bank' },
  { label: 'GST Reports',      icon: FileText,        to: '/gst' },
  { label: 'Payroll',          icon: Users,           to: '/payroll' },
]

const bottomItems = [
  { label: 'Accounts',  icon: Building2, to: '/accounts' },
  { label: 'Settings',  icon: Settings,  to: '/settings' },
]

export default function Sidebar() {
  return (
    <aside className="sidebar">
      {/* Logo */}
      <div className="sidebar-logo">
        <div className="flex items-center gap-2">
          <div style={{
            width: 28, height: 28, borderRadius: 6,
            background: 'linear-gradient(135deg, #2563eb, #7c3aed)',
            display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}>
            <Zap size={14} color="#fff" fill="#fff" />
          </div>
          <span className="wordmark">LedgrAI</span>
        </div>
        <div className="tagline" style={{ marginTop: 4 }}>Intelligent Accounting</div>
      </div>

      {/* Main nav */}
      <div className="sidebar-section-label">Main Menu</div>
      <nav className="sidebar-nav">
        {navItems.map(item => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
          >
            <item.icon size={16} className="nav-icon" />
            {item.label}
          </NavLink>
        ))}
      </nav>

      {/* Bottom nav */}
      <div className="sidebar-section-label">Settings</div>
      <nav className="sidebar-nav" style={{ flex: 0 }}>
        {bottomItems.map(item => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
          >
            <item.icon size={16} className="nav-icon" />
            {item.label}
          </NavLink>
        ))}
      </nav>

      {/* Company footer */}
      <div className="sidebar-footer">
        <div className="company-pill">
          <div className="company-avatar">AC</div>
          <div>
            <div className="company-name">Acme Corp Pvt Ltd</div>
            <div className="company-plan">Pro Plan · FY 2024-25</div>
          </div>
        </div>
      </div>
    </aside>
  )
}
