// src/App.jsx — updated with Opening Balances route
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { AuthProvider, useAuth } from './context/AuthContext'
import { ModeProvider, useMode } from './components/LaymanModeToggle'
import Topbar          from './components/Topbar'
import SmartAssistant  from './components/SmartAssistant'
import Login           from './pages/Login'
import Dashboard       from './pages/Dashboard'
import Journal         from './pages/Journal'
import Accounts        from './pages/Accounts'
import TrialBalance    from './pages/TrialBalance'
import Bank            from './pages/Bank'
import GST             from './pages/GST'
import Payroll         from './pages/Payroll'
import Reports         from './pages/Reports'
import Companies       from './pages/Companies'
import Upload          from './pages/Upload'
import Reconciliation  from './pages/Reconciliation'
import SimpleMode      from './pages/SimpleMode'
import OpeningBalances from './pages/OpeningBalances'
import Settings        from './pages/Settings'

function AppShell() {
  const { user, loading } = useAuth()
  const { isSimple }      = useMode()

  if (loading) {
    return (
      <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'var(--bg)' }}>
        <div style={{ textAlign:'center' }}>
          <div style={{ width:36, height:36, border:'3px solid var(--border)', borderTopColor:'var(--accent)', borderRadius:'50%', animation:'spin .7s linear infinite', margin:'0 auto 12px' }} />
          <div style={{ fontSize:'var(--fs-sm)', color:'var(--text-3)' }}>Loading FINIX...</div>
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    )
  }
  if (!user) return <Login />

  return (
    <div className="app-shell">
      <Topbar />
      <div className="app-body">
        <Routes>
          <Route path="/"                  element={isSimple ? <SimpleMode /> : <Dashboard />} />
          <Route path="/dashboard"         element={<Dashboard />} />
          <Route path="/simple"            element={<SimpleMode />} />
          <Route path="/upload"            element={<Upload />} />
          <Route path="/reconcile"         element={<Reconciliation />} />
          <Route path="/journal"           element={<Journal />} />
          <Route path="/accounts"          element={<Accounts />} />
          <Route path="/trial-balance"     element={<TrialBalance />} />
          <Route path="/bank"              element={<Bank />} />
          <Route path="/gst"               element={<GST />} />
          <Route path="/payroll"           element={<Payroll />} />
          <Route path="/reports"           element={<Reports />} />
          <Route path="/companies"         element={<Companies />} />
          <Route path="/opening-balances"  element={<OpeningBalances />} />
          <Route path="/settings"          element={<Settings />} />
          <Route path="*"                  element={<Navigate to="/" replace />} />
        </Routes>
      </div>
      <SmartAssistant />
    </div>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <ModeProvider>
        <HashRouter>
          <Toaster position="top-right" toastOptions={{ duration:3000, style:{ background:'#1F2937', color:'#F9FAFB', fontSize:'13px', borderRadius:'6px', padding:'10px 14px', fontFamily:"'IBM Plex Sans', sans-serif" }}} />
          <AppShell />
        </HashRouter>
      </ModeProvider>
    </AuthProvider>
  )
}
