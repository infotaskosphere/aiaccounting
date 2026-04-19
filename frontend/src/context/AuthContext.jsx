// src/context/AuthContext.jsx
import { createContext, useContext, useState, useEffect } from 'react'

const AuthContext = createContext(null)

const DEFAULT_COMPANIES = [
  {
    id: 'co-1',
    name: 'Acme Corp Pvt Ltd',
    type: 'Private Limited',
    gstin: '29AABCA1234C1ZX',
    fy: 'FY 2024-25',
    color: '#2563EB',
    initials: 'AC',
  },
  {
    id: 'co-2',
    name: 'Beta Traders',
    type: 'Partnership Firm',
    gstin: '27AACBT5678D1ZY',
    fy: 'FY 2024-25',
    color: '#7C3AED',
    initials: 'BT',
  },
]

const DEMO_USERS = [
  { email: 'admin@finix.in',  password: 'admin123', name: 'Admin User', role: 'admin' },
  { email: 'demo@finix.in',   password: 'demo123',  name: 'Demo User',  role: 'accountant' },
]

export function AuthProvider({ children }) {
  const [user, setUser]            = useState(null)
  const [companies, setCompanies]  = useState([])
  const [activeCompany, setActive] = useState(null)
  const [loading, setLoading]      = useState(true)

  useEffect(() => {
    const saved = localStorage.getItem('finix_session')
    if (saved) {
      const { user, companies, activeId } = JSON.parse(saved)
      setUser(user)
      setCompanies(companies)
      setActive(companies.find(c => c.id === activeId) || companies[0])
    }
    setLoading(false)
  }, [])

  const persist = (u, cos, activeId) => {
    localStorage.setItem('finix_session', JSON.stringify({ user: u, companies: cos, activeId }))
  }

  const login = (email, password) => {
    const found = DEMO_USERS.find(
      u => u.email.toLowerCase() === email.toLowerCase() && u.password === password
    )
    if (!found) return { error: 'Invalid email or password' }
    const cos = [...DEFAULT_COMPANIES]
    const first = cos[0]
    setUser(found); setCompanies(cos); setActive(first)
    persist(found, cos, first.id)
    return { success: true }
  }

  const logout = () => {
    setUser(null); setCompanies([]); setActive(null)
    localStorage.removeItem('finix_session')
  }

  const switchCompany = (company) => {
    setActive(company)
    const saved = JSON.parse(localStorage.getItem('finix_session') || '{}')
    localStorage.setItem('finix_session', JSON.stringify({ ...saved, activeId: company.id }))
  }

  const addCompany = (data) => {
    const newCo = {
      id: `co-${Date.now()}`,
      name: data.name,
      type: data.type || 'Private Limited',
      gstin: data.gstin || '',
      fy: 'FY 2024-25',
      color: data.color || '#059669',
      initials: data.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase(),
    }
    const updated = [...companies, newCo]
    setCompanies(updated)
    persist(user, updated, activeCompany?.id)
    return newCo
  }

  const deleteCompany = (id) => {
    const updated = companies.filter(c => c.id !== id)
    setCompanies(updated)
    if (activeCompany?.id === id) {
      setActive(updated[0] || null)
      persist(user, updated, updated[0]?.id)
    } else {
      persist(user, updated, activeCompany?.id)
    }
  }

  return (
    <AuthContext.Provider value={{
      user, companies, activeCompany, loading,
      login, logout, switchCompany, addCompany, deleteCompany,
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
