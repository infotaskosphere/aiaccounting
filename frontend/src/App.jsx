// src/App.jsx
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { AuthProvider, useAuth } from './context/AuthContext'
import Topbar    from './components/Topbar'
import Login     from './pages/Login'
import Dashboard from './pages/Dashboard'
import Journal   from './pages/Journal'
import Bank      from './pages/Bank'
import GST       from './pages/GST'
import Payroll   from './pages/Payroll'
import Companies from './pages/Companies'

function AppShell() {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: 36, height: 36, border: '3px solid var(--border)', borderTopColor: 'var(--accent)', borderRadius: '50%', animation: 'spin .7s linear infinite', margin: '0 auto 12px' }} />
          <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-3)' }}>Loading FINIX...</div>
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
          <Route path="/"          element={<Dashboard />} />
          <Route path="/journal"   element={<Journal />} />
          <Route path="/bank"      element={<Bank />} />
          <Route path="/gst"       element={<GST />} />
          <Route path="/payroll"   element={<Payroll />} />
          <Route path="/companies" element={<Companies />} />
          <Route path="*"          element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    </div>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Toaster
          position="top-right"
          toastOptions={{
            duration: 3000,
            style: {
              background: '#1F2937',
              color: '#F9FAFB',
              fontSize: '13px',
              borderRadius: '6px',
              padding: '10px 14px',
              fontFamily: "'IBM Plex Sans', sans-serif",
            },
          }}
        />
        <AppShell />
      </BrowserRouter>
    </AuthProvider>
  )
}
