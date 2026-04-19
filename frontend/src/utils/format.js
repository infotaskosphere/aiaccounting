// src/utils/format.js

// Format number with Indian comma system (1,00,000)
export const fmt = (n) => {
  const num = parseFloat(n) || 0
  return num.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

// Format as ₹ Crores / Lakhs / thousands
export const fmtCr = (n) => {
  const num = parseFloat(n) || 0
  if (num >= 10000000) return `₹${(num / 10000000).toFixed(2)} Cr`
  if (num >= 100000)   return `₹${(num / 100000).toFixed(2)} L`
  if (num >= 1000)     return `₹${(num / 1000).toFixed(1)}K`
  return `₹${fmt(num)}`
}

// Format date
export const fmtDate = (d) => {
  if (!d) return ''
  const date = new Date(d)
  return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}
