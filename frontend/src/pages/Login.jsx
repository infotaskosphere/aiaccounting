// src/pages/Login.jsx — Login + Sign Up system (no demo accounts)
import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { Eye, EyeOff, LogIn, UserPlus, AlertCircle, Shield, Zap, ArrowLeft, CheckCircle } from 'lucide-react'
import finixLogo from '../assets/logo.png'

export default function Login() {
  const { login, signup } = useAuth()
  const [mode, setMode] = useState('login') // 'login' | 'signup' | 'success'

  // Login state
  const [loginForm, setLoginForm] = useState({ email: '', password: '' })
  const [showLoginPwd, setShowLoginPwd] = useState(false)
  const [loginError, setLoginError] = useState('')
  const [loginLoading, setLoginLoading] = useState(false)

  // Sign Up state
  const [signupForm, setSignupForm] = useState({ name: '', email: '', password: '', confirmPassword: '', role: 'accountant' })
  const [showSignupPwd, setShowSignupPwd] = useState(false)
  const [showConfirmPwd, setShowConfirmPwd] = useState(false)
  const [signupError, setSignupError] = useState('')
  const [signupLoading, setSignupLoading] = useState(false)
  const [signupSuccess, setSignupSuccess] = useState('')

  const handleLogin = async (e) => {
    e.preventDefault()
    setLoginError('')
    setLoginLoading(true)
    await new Promise(r => setTimeout(r, 600))
    const res = login(loginForm.email, loginForm.password)
    if (res.error) setLoginError(res.error)
    setLoginLoading(false)
  }

  const handleSignup = async (e) => {
    e.preventDefault()
    setSignupError('')
    if (!signupForm.name.trim()) return setSignupError('Full name is required')
    if (signupForm.password.length < 6) return setSignupError('Password must be at least 6 characters')
    if (signupForm.password !== signupForm.confirmPassword) return setSignupError('Passwords do not match')

    setSignupLoading(true)
    await new Promise(r => setTimeout(r, 700))
    const res = signup({
      name: signupForm.name.trim(),
      email: signupForm.email.trim().toLowerCase(),
      password: signupForm.password,
      role: signupForm.role,
    })
    setSignupLoading(false)

    if (res.error) {
      setSignupError(res.error)
    } else {
      setSignupSuccess(signupForm.email.trim().toLowerCase())
      setMode('success')
    }
  }

  const goToLogin = () => {
    setMode('login')
    setLoginForm({ email: signupSuccess || '', password: '' })
    setLoginError('')
    setSignupError('')
    setSignupForm({ name: '', email: '', password: '', confirmPassword: '', role: 'accountant' })
  }

  const ROLES = [
    { value: 'admin',      label: 'Admin — Full Access' },
    { value: 'accountant', label: 'Accountant — Manage Entries' },
    { value: 'auditor',    label: 'Auditor — Read Only' },
    { value: 'view_only',  label: 'View Only' },
  ]

  return (
    <div className="login-shell">
      <div style={{ width: '100%', maxWidth: 440 }}>
        <div className="login-card">

          {/* Logo header */}
          <div className="login-header" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '28px 24px 20px' }}>
            <img src={finixLogo} alt="FINIX" style={{ height: 44, width: 'auto', display: 'block', marginBottom: 10 }} />
            <div style={{ fontSize: 10, letterSpacing: '.12em', color: 'rgba(255,255,255,.55)', fontWeight: 600 }}>
              AI ACCOUNTING SOFTWARE FOR INDIA
            </div>
          </div>

          <div className="login-body">

            {/* LOGIN MODE */}
            {mode === 'login' && (
              <>
                <div className="login-title">Welcome back</div>
                <div className="login-sub" style={{ marginBottom: 20 }}>Sign in to your FINIX account</div>

                {loginError && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px', background: 'var(--danger-l)', border: '1px solid var(--danger-b)', borderRadius: 'var(--r-md)', marginBottom: 16, fontSize: 'var(--fs-sm)', color: 'var(--danger)' }}>
                    <AlertCircle size={14} />{loginError}
                  </div>
                )}

                <form onSubmit={handleLogin}>
                  <div className="field-group">
                    <label className="field-label">EMAIL ADDRESS</label>
                    <input type="email" className="input" placeholder="you@company.in"
                      value={loginForm.email} onChange={e => setLoginForm(f => ({ ...f, email: e.target.value }))}
                      required autoFocus />
                  </div>
                  <div className="field-group" style={{ marginBottom: 8 }}>
                    <label className="field-label">PASSWORD</label>
                    <div style={{ position: 'relative' }}>
                      <input type={showLoginPwd ? 'text' : 'password'} className="input"
                        placeholder="Enter your password" value={loginForm.password}
                        onChange={e => setLoginForm(f => ({ ...f, password: e.target.value }))}
                        required style={{ paddingRight: 36 }} />
                      <button type="button" onClick={() => setShowLoginPwd(s => !s)}
                        style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-4)', background: 'none', border: 'none', cursor: 'pointer', display: 'flex' }}>
                        {showLoginPwd ? <EyeOff size={15} /> : <Eye size={15} />}
                      </button>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', marginBottom: 18 }}>
                    <button type="button" style={{ fontSize: 'var(--fs-xs)', color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--font)' }}>
                      Forgot password?
                    </button>
                  </div>
                  <button type="submit" className="btn btn-primary btn-lg" disabled={loginLoading}
                    style={{ width: '100%', justifyContent: 'center' }}>
                    {loginLoading
                      ? <span style={{ width: 15, height: 15, border: '2px solid rgba(255,255,255,.4)', borderTopColor: 'white', borderRadius: '50%', display: 'inline-block', animation: 'spin .7s linear infinite' }} />
                      : <LogIn size={15} />}
                    {loginLoading ? 'Signing in...' : 'Sign In'}
                  </button>
                </form>

                <div style={{ marginTop: 20, textAlign: 'center', fontSize: 'var(--fs-sm)', color: 'var(--text-3)' }}>
                  Don&apos;t have an account?{' '}
                  <button type="button" onClick={() => { setMode('signup'); setLoginError('') }}
                    style={{ color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600, fontFamily: 'var(--font)', fontSize: 'var(--fs-sm)' }}>
                    Create Account
                  </button>
                </div>

                <div style={{ marginTop: 20, display: 'flex', gap: 12, justifyContent: 'center' }}>
                  {[{ icon: Shield, text: 'GST Compliant' }, { icon: Zap, text: 'AI-Powered' }].map(b => (
                    <div key={b.text} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--text-4)' }}>
                      <b.icon size={12} />{b.text}
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* SIGN UP MODE */}
            {mode === 'signup' && (
              <>
                <button type="button" onClick={() => { setMode('login'); setSignupError('') }}
                  style={{ display: 'flex', alignItems: 'center', gap: 5, color: 'var(--text-3)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 'var(--fs-sm)', marginBottom: 16, padding: 0, fontFamily: 'var(--font)' }}>
                  <ArrowLeft size={14} /> Back to Sign In
                </button>

                <div className="login-title">Create Account</div>
                <div className="login-sub" style={{ marginBottom: 20 }}>Set up your FINIX account</div>

                {signupError && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px', background: 'var(--danger-l)', border: '1px solid var(--danger-b)', borderRadius: 'var(--r-md)', marginBottom: 16, fontSize: 'var(--fs-sm)', color: 'var(--danger)' }}>
                    <AlertCircle size={14} />{signupError}
                  </div>
                )}

                <form onSubmit={handleSignup}>
                  <div className="field-group">
                    <label className="field-label">FULL NAME</label>
                    <input type="text" className="input" placeholder="Your full name"
                      value={signupForm.name} onChange={e => setSignupForm(f => ({ ...f, name: e.target.value }))}
                      required autoFocus />
                  </div>
                  <div className="field-group">
                    <label className="field-label">EMAIL ADDRESS</label>
                    <input type="email" className="input" placeholder="you@company.in"
                      value={signupForm.email} onChange={e => setSignupForm(f => ({ ...f, email: e.target.value }))}
                      required />
                  </div>
                  <div className="field-group">
                    <label className="field-label">ROLE</label>
                    <select className="input" value={signupForm.role}
                      onChange={e => setSignupForm(f => ({ ...f, role: e.target.value }))}
                      style={{ cursor: 'pointer' }}>
                      {ROLES.map(r => (
                        <option key={r.value} value={r.value}>{r.label}</option>
                      ))}
                    </select>
                  </div>
                  <div className="field-group">
                    <label className="field-label">PASSWORD</label>
                    <div style={{ position: 'relative' }}>
                      <input type={showSignupPwd ? 'text' : 'password'} className="input"
                        placeholder="Min. 6 characters" value={signupForm.password}
                        onChange={e => setSignupForm(f => ({ ...f, password: e.target.value }))}
                        required style={{ paddingRight: 36 }} />
                      <button type="button" onClick={() => setShowSignupPwd(s => !s)}
                        style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-4)', background: 'none', border: 'none', cursor: 'pointer', display: 'flex' }}>
                        {showSignupPwd ? <EyeOff size={15} /> : <Eye size={15} />}
                      </button>
                    </div>
                  </div>
                  <div className="field-group" style={{ marginBottom: 20 }}>
                    <label className="field-label">CONFIRM PASSWORD</label>
                    <div style={{ position: 'relative' }}>
                      <input type={showConfirmPwd ? 'text' : 'password'} className="input"
                        placeholder="Re-enter password" value={signupForm.confirmPassword}
                        onChange={e => setSignupForm(f => ({ ...f, confirmPassword: e.target.value }))}
                        required style={{ paddingRight: 36 }} />
                      <button type="button" onClick={() => setShowConfirmPwd(s => !s)}
                        style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-4)', background: 'none', border: 'none', cursor: 'pointer', display: 'flex' }}>
                        {showConfirmPwd ? <EyeOff size={15} /> : <Eye size={15} />}
                      </button>
                    </div>
                  </div>
                  <button type="submit" className="btn btn-primary btn-lg" disabled={signupLoading}
                    style={{ width: '100%', justifyContent: 'center' }}>
                    {signupLoading
                      ? <span style={{ width: 15, height: 15, border: '2px solid rgba(255,255,255,.4)', borderTopColor: 'white', borderRadius: '50%', display: 'inline-block', animation: 'spin .7s linear infinite' }} />
                      : <UserPlus size={15} />}
                    {signupLoading ? 'Creating Account...' : 'Create Account'}
                  </button>
                </form>

                <div style={{ marginTop: 20, textAlign: 'center', fontSize: 'var(--fs-sm)', color: 'var(--text-3)' }}>
                  Already have an account?{' '}
                  <button type="button" onClick={() => { setMode('login'); setSignupError('') }}
                    style={{ color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600, fontFamily: 'var(--font)', fontSize: 'var(--fs-sm)' }}>
                    Sign In
                  </button>
                </div>
              </>
            )}

            {/* SUCCESS MODE */}
            {mode === 'success' && (
              <div style={{ textAlign: 'center', padding: '20px 0' }}>
                <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#dcfce7', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                  <CheckCircle size={28} color="#16a34a" />
                </div>
                <div className="login-title" style={{ marginBottom: 8 }}>Account Created!</div>
                <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-3)', marginBottom: 6 }}>
                  Your account has been created successfully.
                </div>
                <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-2)', fontWeight: 600, marginBottom: 24, wordBreak: 'break-all' }}>
                  {signupSuccess}
                </div>
                <button type="button" className="btn btn-primary btn-lg" onClick={goToLogin}
                  style={{ width: '100%', justifyContent: 'center' }}>
                  <LogIn size={15} /> Sign In Now
                </button>
              </div>
            )}

          </div>
        </div>

        <div style={{ textAlign: 'center', marginTop: 16, fontSize: 'var(--fs-xs)', color: 'rgba(255,255,255,.45)' }}>
          &copy; 2026 FINIX &middot; Intelligent Finance Software for India
        </div>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
