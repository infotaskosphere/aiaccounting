// src/context/AuthContext.jsx — with Sign Up support, no hardcoded demo accounts
import { createContext, useContext, useState, useEffect } from 'react'

const AuthContext = createContext(null)

function currentFY() {
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth() + 1
  const fyStart = month >= 4 ? year : year - 1
  const fyEnd   = String(fyStart + 1).slice(-2)
  return `FY ${fyStart}-${fyEnd}`
}

const DEFAULT_COMPANIES = [
  { id:'co-1', name:'Acme Corp Pvt Ltd',  type:'Private Limited', gstin:'29AABCA1234C1ZX', fy:currentFY(), color:'#2563EB', initials:'AC' },
  { id:'co-2', name:'Beta Traders',        type:'Partnership Firm', gstin:'27AACBT5678D1ZY', fy:currentFY(), color:'#7C3AED', initials:'BT' },
]

// No hardcoded demo accounts — all users register via Sign Up
const INITIAL_USERS = []

export function AuthProvider({ children }) {
  const [user,          setUser]      = useState(null)
  const [companies,     setCompanies] = useState([])
  const [activeCompany, setActive]    = useState(null)
  const [loading,       setLoading]   = useState(true)
  const [allUsers,      setAllUsers]  = useState(INITIAL_USERS)

  useEffect(() => {
    try {
      const saved = localStorage.getItem('finix_session')
      if (saved) {
        const { user, companies, activeId, allUsers: savedUsers } = JSON.parse(saved)
        const patched = (companies || []).map(c => ({ ...c, fy: c.fy || currentFY() }))
        setUser(user)
        setCompanies(patched)
        setActive(patched.find(c => c.id === activeId) || patched[0])
        if (savedUsers) setAllUsers(savedUsers)
      }
    } catch (e) {
      localStorage.removeItem('finix_session')
    }
    setLoading(false)
  }, [])

  const persist = (u, cos, activeId, users) => {
    localStorage.setItem('finix_session', JSON.stringify({
      user: u,
      companies: cos,
      activeId,
      allUsers: users !== undefined ? users : allUsers,
    }))
  }

  // ── Sign Up (self-registration) ──
  const signup = ({ name, email, password, role }) => {
    // Load latest users from storage to avoid stale state
    let currentUsers = allUsers
    try {
      const saved = localStorage.getItem('finix_session')
      if (saved) {
        const parsed = JSON.parse(saved)
        if (parsed.allUsers) currentUsers = parsed.allUsers
      }
    } catch (_) {}

    const exists = currentUsers.find(u => u.email.toLowerCase() === email.toLowerCase())
    if (exists) return { error: 'An account with this email already exists' }

    const newUser = {
      id: `u-${Date.now()}`,
      email,
      password,
      name,
      role: role || 'accountant',
      status: 'active',
      createdAt: new Date().toISOString().slice(0, 10),
    }
    const updated = [...currentUsers, newUser]
    setAllUsers(updated)

    // Persist users without logging in
    const saved = (() => { try { return JSON.parse(localStorage.getItem('finix_session') || '{}') } catch(_) { return {} } })()
    localStorage.setItem('finix_session', JSON.stringify({ ...saved, allUsers: updated }))

    return { success: true }
  }

  // ── Login ──
  const login = (email, password) => {
    // Read latest users from storage
    let currentUsers = allUsers
    try {
      const saved = localStorage.getItem('finix_session')
      if (saved) {
        const parsed = JSON.parse(saved)
        if (parsed.allUsers) currentUsers = parsed.allUsers
      }
    } catch (_) {}

    const found = currentUsers.find(
      u => u.email.toLowerCase() === email.toLowerCase() &&
           u.password === password &&
           u.status === 'active'
    )
    if (!found) return { error: 'Invalid email or password' }

    const cos = [...DEFAULT_COMPANIES]
    const first = cos[0]
    setUser(found); setCompanies(cos); setActive(first)
    persist(found, cos, first.id, currentUsers)
    return { success: true }
  }

  const logout = () => {
    // Keep allUsers in storage so accounts survive logout
    const saved = (() => { try { return JSON.parse(localStorage.getItem('finix_session') || '{}') } catch(_) { return {} } })()
    localStorage.setItem('finix_session', JSON.stringify({ allUsers: saved.allUsers || allUsers }))
    setUser(null); setCompanies([]); setActive(null)
  }

  const switchCompany = (company) => {
    setActive(company)
    const saved = JSON.parse(localStorage.getItem('finix_session') || '{}')
    localStorage.setItem('finix_session', JSON.stringify({ ...saved, activeId: company.id }))
  }

  const addCompany = (data) => {
    const fyLabel = data.fy ? (data.fy.startsWith('FY ') ? data.fy : `FY ${data.fy}`) : currentFY()
    const newCo = {
      id: `co-${Date.now()}`, name: data.name, type: data.type || 'Private Limited',
      gstin: data.gstin || '', fy: fyLabel, color: data.color || '#059669',
      initials: data.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase(),
    }
    const updated = [...companies, newCo]
    setCompanies(updated)
    persist(user, updated, activeCompany?.id)
    return newCo
  }

  const updateCompany = (id, data) => {
    const fyLabel = data.fy ? (data.fy.startsWith('FY ') ? data.fy : `FY ${data.fy}`) : currentFY()
    const updated = companies.map(c => c.id === id ? { ...c, ...data, fy: fyLabel } : c)
    setCompanies(updated)
    if (activeCompany?.id === id) setActive(updated.find(c => c.id === id))
    persist(user, updated, activeCompany?.id)
  }

  const deleteCompany = (id) => {
    const updated = companies.filter(c => c.id !== id)
    setCompanies(updated)
    if (activeCompany?.id === id) setActive(updated[0] || null)
    persist(user, updated, activeCompany?.id === id ? updated[0]?.id : activeCompany?.id)
  }

  // ── User Management (admin only) ──
  const addUser = (data) => {
    const newUser = {
      id: `u-${Date.now()}`,
      email: data.email,
      password: data.password || 'Welcome@123',
      name: data.name,
      role: data.role || 'accountant',
      status: 'active',
      createdAt: new Date().toISOString().slice(0, 10),
    }
    const updated = [...allUsers, newUser]
    setAllUsers(updated)
    persist(user, companies, activeCompany?.id, updated)
    return newUser
  }

  const updateUser = (id, data) => {
    const updated = allUsers.map(u => u.id === id ? { ...u, ...data } : u)
    setAllUsers(updated)
    persist(user, companies, activeCompany?.id, updated)
  }

  const deleteUser = (id) => {
    if (user?.id === id) return { error: 'Cannot delete yourself' }
    const updated = allUsers.filter(u => u.id !== id)
    setAllUsers(updated)
    persist(user, companies, activeCompany?.id, updated)
  }

  const resetUserPassword = (id, newPassword) => {
    const updated = allUsers.map(u => u.id === id ? { ...u, password: newPassword } : u)
    setAllUsers(updated)
    persist(user, companies, activeCompany?.id, updated)
  }

  return (
    <AuthContext.Provider value={{
      user, companies, activeCompany, loading, allUsers,
      login, logout, signup, switchCompany,
      addCompany, updateCompany, deleteCompany,
      addUser, updateUser, deleteUser, resetUserPassword,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
