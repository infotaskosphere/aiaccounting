// src/components/Navbar.jsx
import { useLocation } from 'react-router-dom'
import { Bell, Search, HelpCircle, ChevronRight } from 'lucide-react'

const routeMap = {
  '/':        ['Dashboard'],
  '/journal': ['Journal & Ledger'],
  '/bank':    ['Bank & Reconcile'],
  '/gst':     ['GST Reports'],
  '/payroll': ['Payroll'],
  '/accounts':['Accounts'],
  '/settings':['Settings'],
}

export default function Navbar() {
  const { pathname } = useLocation()
  const crumbs = routeMap[pathname] || ['Page']

  return (
    <header className="navbar">
      {/* Breadcrumb */}
      <nav className="navbar-breadcrumb">
        <span>FINIX</span>
        <ChevronRight size={13} style={{ opacity: 0.4 }} />
        <span className="current">{crumbs[0]}</span>
      </nav>

      <div className="navbar-spacer" />

      <div className="navbar-actions">
        {/* Search */}
        <button className="icon-btn" title="Search (⌘K)">
          <Search size={17} />
        </button>

        {/* Help */}
        <button className="icon-btn" title="Help">
          <HelpCircle size={17} />
        </button>

        {/* Notifications */}
        <button className="icon-btn" title="Notifications" style={{ position: 'relative' }}>
          <Bell size={17} />
          <span className="notif-dot" />
        </button>

        {/* Divider */}
        <div style={{ width: 1, height: 22, background: 'var(--border)', margin: '0 4px' }} />

        {/* User Avatar */}
        <div className="user-avatar" title="Acme Corp · Admin">
          AC
        </div>
      </div>
    </header>
  )
}
