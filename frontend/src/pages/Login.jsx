// src/pages/Login.jsx
import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { Eye, EyeOff, LogIn, AlertCircle } from 'lucide-react'

export default function Login() {
  const { login } = useAuth()
  const [form, setForm]     = useState({ email: '', password: '' })
  const [show, setShow]     = useState(false)
  const [error, setError]   = useState('')
  const [loading, setLoading] = useState(false)

  const handle = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    await new Promise(r => setTimeout(r, 600))
    const res = login(form.email, form.password)
    if (res.error) setError(res.error)
    setLoading(false)
  }

  const fillDemo = () => setForm({ email: 'admin@finix.in', password: 'admin123' })

  return (
    <div className="login-shell">
      <div style={{ width: '100%', maxWidth: 420 }}>
        {/* Card */}
        <div className="login-card">
          {/* Header */}
          <div className="login-header">
            <div className="login-logo-wrap">
              <div className="login-logo-icon">F</div>
              <span className="login-logo-name">FINIX</span>
            </div>
            <div className="login-tagline">INTELLIGENT FINANCE SOFTWARE</div>
          </div>

          {/* Body */}
          <div className="login-body">
            <div className="login-title">Welcome back</div>
            <div className="login-sub">Sign in to your FINIX account</div>

            {error && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '9px 12px', background: 'var(--danger-l)',
                border: '1px solid var(--danger-b)', borderRadius: 'var(--r-md)',
                marginBottom: 16, fontSize: 'var(--fs-sm)', color: 'var(--danger)'
              }}>
                <AlertCircle size={14} />
                {error}
              </div>
            )}

            <form onSubmit={handle}>
              <div className="field-group">
                <label className="field-label">Email Address</label>
                <input
                  type="email"
                  className="input"
                  placeholder="you@company.com"
                  value={form.email}
                  onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                  required
                  autoFocus
                />
              </div>

              <div className="field-group" style={{ marginBottom: 8 }}>
                <label className="field-label">Password</label>
                <div style={{ position: 'relative' }}>
                  <input
                    type={show ? 'text' : 'password'}
                    className="input"
                    placeholder="Enter your password"
                    value={form.password}
                    onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                    required
                    style={{ paddingRight: 36 }}
                  />
                  <button
                    type="button"
                    onClick={() => setShow(s => !s)}
                    style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-4)', background: 'none', border: 'none', cursor: 'pointer', display: 'flex' }}
                  >
                    {show ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>

              <div style={{ textAlign: 'right', marginBottom: 18 }}>
                <button type="button" style={{ fontSize: 'var(--fs-xs)', color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--font)' }}>
                  Forgot password?
                </button>
              </div>

              <button
                type="submit"
                className="btn btn-primary btn-lg"
                disabled={loading}
                style={{ width: '100%', justifyContent: 'center' }}
              >
                {loading ? (
                  <span style={{ width: 15, height: 15, border: '2px solid rgba(255,255,255,.4)', borderTopColor: 'white', borderRadius: '50%', display: 'inline-block', animation: 'spin .7s linear infinite' }} />
                ) : <LogIn size={15} />}
                {loading ? 'Signing in...' : 'Sign In'}
              </button>
            </form>

            <div className="login-divider">OR USE DEMO CREDENTIALS</div>

            <button
              type="button"
              className="btn btn-secondary"
              style={{ width: '100%', justifyContent: 'center' }}
              onClick={fillDemo}
            >
              Fill Demo Credentials
            </button>

            <div style={{ marginTop: 16, padding: '10px 12px', background: 'var(--surface-2)', borderRadius: 'var(--r-md)', fontSize: 'var(--fs-xs)', color: 'var(--text-3)', border: '1px solid var(--border)' }}>
              <div style={{ fontWeight: 600, color: 'var(--text-2)', marginBottom: 4 }}>Demo Accounts</div>
              <div>Admin: admin@finix.in / admin123</div>
              <div>Viewer: demo@finix.in / demo123</div>
            </div>
          </div>
        </div>

        <div style={{ textAlign: 'center', marginTop: 16, fontSize: 'var(--fs-xs)', color: 'rgba(255,255,255,.5)' }}>
          © 2024 FINIX · Intelligent Finance Software
        </div>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
