// src/App.jsx
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import Sidebar from './components/Sidebar'
import Dashboard from './pages/Dashboard'
import Journal from './pages/Journal'
import Bank from './pages/Bank'
import GST from './pages/GST'
import Payroll from './pages/Payroll'

export default function App() {
  return (
    <BrowserRouter>
      <Toaster
        position="top-right"
        toastOptions={{
          duration: 3000,
          style: {
            background: '#1a1a1a',
            color: '#fff',
            fontSize: '13px',
            borderRadius: '8px',
            padding: '10px 16px',
          },
        }}
      />
      <div className="app-shell">
        <Sidebar />
        <main className="main-content">
          <Routes>
            <Route path="/"        element={<Dashboard />} />
            <Route path="/journal" element={<Journal />} />
            <Route path="/bank"    element={<Bank />} />
            <Route path="/gst"     element={<GST />} />
            <Route path="/payroll" element={<Payroll />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  )
}
