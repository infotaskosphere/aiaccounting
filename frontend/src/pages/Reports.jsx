// src/pages/Reports.jsx — P&L, Balance Sheet, Cash Flow (Schedule III / AS-3)
import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Download, TrendingUp, BarChart2, ArrowLeftRight, Info } from 'lucide-react'
import { fmt } from '../utils/format'
import { computeFinancials } from '../api/companyStore'
import { useAuth } from '../context/AuthContext'

// ─── Data ────────────────────────────────────────────────────────────────────

const CY = 'FY 2024-25 (Apr 2023 – Mar 2024)'
const PY = 'FY 2023-24 (Apr 2022 – Mar 2023)'

// P&L data — Schedule III Part II
const PL = {
  revenue: {
    salesProducts:   2840000, salesServices:  1980000,
    salesReturns:    125000,
    otherIncome:     { interest:28000, dividend:12000, misc:8000 }
  },
  expenses: {
    openingStock:    320000, closingStock: 380000,
    purchases:       1640000, purchaseReturns: 45000,
    freightInward:   38000,
    salaries:        1840000, pfEmployer: 32000, esicEmployer: 1600, staffWelfare: 24000,
    depreciation:    98000,
    bankInterest:    42000, bankCharges: 12400,
    rent:            480000, electricity: 84000, internet: 36000,
    software:        124000, advertising: 96000, travel: 48000,
    professional:    120000, repairs: 32000, printing: 18000, insurance: 36000,
  },
  tax: { currentTax: 280000, deferredTax: 45000 }
}

// Computed P&L
const grossRevenue  = PL.revenue.salesProducts + PL.revenue.salesServices - PL.revenue.salesReturns
const otherIncome   = PL.revenue.otherIncome.interest + PL.revenue.otherIncome.dividend + PL.revenue.otherIncome.misc
const totalRevenue  = grossRevenue + otherIncome
const cogs          = PL.expenses.openingStock + PL.expenses.purchases - PL.expenses.purchaseReturns + PL.expenses.freightInward - PL.expenses.closingStock
const employeeCost  = PL.expenses.salaries + PL.expenses.pfEmployer + PL.expenses.esicEmployer + PL.expenses.staffWelfare
const financeCosts  = PL.expenses.bankInterest + PL.expenses.bankCharges
const otherExpenses = PL.expenses.rent + PL.expenses.electricity + PL.expenses.internet + PL.expenses.software +
                      PL.expenses.advertising + PL.expenses.travel + PL.expenses.professional +
                      PL.expenses.repairs + PL.expenses.printing + PL.expenses.insurance
const totalExpenses = cogs + employeeCost + PL.expenses.depreciation + financeCosts + otherExpenses
const pbt           = totalRevenue - totalExpenses
const tax           = PL.tax.currentTax + PL.tax.deferredTax
const pat           = pbt - tax

// Balance Sheet data — Schedule III Part I
const BS = {
  equity: {
    shareCapital: 1000000, generalReserve: 500000, plBalance: 613300,
  },
  nonCurrentLiab: {
    termLoan: 800000, vehicleLoan: 220000, deferredTaxLiab: 45000,
  },
  currentLiab: {
    tradePayables: 346000, outputCGST: 72000, outputSGST: 72000,
    tdsPayable: 18500, pfPayable: 30000, esicPayable: 1500,
    salaryPayable: 349250, advanceFromCustomers: 50000,
  },
  nonCurrentAssets: {
    landBuilding: 1200000, plantMachinery: 680000, furniture: 95000,
    computers: 145000, vehicles: 380000, accDep: -320000,
    investments: 250000, securityDeposits: 120000,
  },
  currentAssets: {
    stockInTrade: 380000, rawMaterials: 140000, wip: 85000,
    debtors: 842000, billsReceivable: 95000,
    cashInHand: 45200, hdfcBank: 1284500, sbiBank: 320000,
    inputCGST: 38400, inputSGST: 38400, tdsReceivable: 24000,
    prepaid: 35000, advanceToSuppliers: 60000,
  }
}

const totalEquity      = BS.equity.shareCapital + BS.equity.generalReserve + BS.equity.plBalance
const totalNCLiab      = BS.nonCurrentLiab.termLoan + BS.nonCurrentLiab.vehicleLoan + BS.nonCurrentLiab.deferredTaxLiab
const totalCLiab       = Object.values(BS.currentLiab).reduce((a,b) => a+b, 0)
const totalEqLiab      = totalEquity + totalNCLiab + totalCLiab
const fixedAssetsGross = BS.nonCurrentAssets.landBuilding + BS.nonCurrentAssets.plantMachinery + BS.nonCurrentAssets.furniture + BS.nonCurrentAssets.computers + BS.nonCurrentAssets.vehicles
const totalNCA         = fixedAssetsGross + BS.nonCurrentAssets.accDep + BS.nonCurrentAssets.investments + BS.nonCurrentAssets.securityDeposits
const totalCA          = Object.values(BS.currentAssets).reduce((a,b) => a+b, 0)
const totalAssets      = totalNCA + totalCA

// Cash Flow data — AS-3 Indirect Method
const CF = {
  operating: {
    netProfit: pat,
    adjustments: { depreciation: 98000, interestExpense: 42000, interestIncome: -28000, dividendIncome: -12000 },
    workingCapital: { debtors: -122000, inventory: -85000, creditors: -26000, otherCurrentLiab: 15050, otherCurrentAssets: -18400 },
    tax_paid: -280000,
  },
  investing: {
    purchaseFA: -55000, saleFA: 0, purchaseInvestments: 0, saleInvestments: 0,
    interestReceived: 28000, dividendReceived: 12000, capitalExpenditure: 0,
  },
  financing: {
    proceedsBorrowings: 0, repaymentBorrowings: -280000,
    interestPaid: -42000, dividendPaid: 0,
  },
  openingCash: 1322000,
}
const cfOpsAdj     = Object.values(CF.operating.adjustments).reduce((a,b)=>a+b,0)
const cfOpsWC      = Object.values(CF.operating.workingCapital).reduce((a,b)=>a+b,0)
const cfFromOps    = CF.operating.netProfit + cfOpsAdj + cfOpsWC + CF.operating.tax_paid
const cfFromInvest = Object.values(CF.investing).reduce((a,b)=>a+b,0)
const cfFromFin    = Object.values(CF.financing).reduce((a,b)=>a+b,0)
const netCashChange= cfFromOps + cfFromInvest + cfFromFin
const closingCash  = CF.openingCash + netCashChange

// ─── Components ──────────────────────────────────────────────────────────────

function Section({ title, children }) {
  return (
    <div style={{ marginBottom:24 }}>
      <div style={{ fontWeight:700, fontSize:'0.8rem', textTransform:'uppercase', letterSpacing:'0.08em',
        color:'var(--text-3)', borderBottom:'2px solid var(--primary)', paddingBottom:6, marginBottom:0 }}>
        {title}
      </div>
      {children}
    </div>
  )
}

function Row({ label, cy, py, bold, indent, subtotal, total, note }) {
  const bg    = total ? 'var(--primary-l)' : subtotal ? 'var(--surface-2)' : 'transparent'
  const fSize = '0.83rem'
  return (
    <tr style={{ background: bg, borderBottom:'1px solid var(--border)' }}>
      <td style={{ padding:'7px 16px', paddingLeft: 16 + (indent||0)*16, fontSize: fSize,
        fontWeight: bold||total||subtotal ? 700 : 400, color:'var(--text)' }}>
        {label}
        {note && <span style={{ fontSize:'0.7rem', color:'var(--text-4)', marginLeft:6 }}>({note})</span>}
      </td>
      <td style={{ padding:'7px 16px', textAlign:'right', fontFamily:'var(--font-mono)', fontSize: fSize,
        fontWeight: bold||total||subtotal ? 700 : 400,
        color: (cy < 0) ? 'var(--danger)' : 'var(--text)' }}>
        {cy === null || cy === undefined ? '' : cy < 0 ? `(${fmt(Math.abs(cy))})` : fmt(cy)}
      </td>
      <td style={{ padding:'7px 16px', textAlign:'right', fontFamily:'var(--font-mono)', fontSize: fSize,
        color:'var(--text-3)' }}>
        {py === null || py === undefined ? '' : py < 0 ? `(${fmt(Math.abs(py))})` : fmt(py)}
      </td>
    </tr>
  )
}

function TableHeader({ title, note }) {
  return (
    <thead>
      <tr style={{ background:'var(--surface-2)', borderBottom:'2px solid var(--border)' }}>
        <th style={{ ...TH, width:'50%' }}>{title}</th>
        <th style={{ ...TH, textAlign:'right' }}>Current Year<br/><span style={{ fontWeight:400, textTransform:'none', fontSize:'0.7rem', color:'var(--text-4)' }}>(₹)</span></th>
        <th style={{ ...TH, textAlign:'right' }}>Previous Year<br/><span style={{ fontWeight:400, textTransform:'none', fontSize:'0.7rem', color:'var(--text-4)' }}>(₹)</span></th>
      </tr>
      {note && <tr><td colSpan={3} style={{ padding:'6px 16px', fontSize:'0.72rem', color:'var(--text-4)', background:'var(--surface-2)', borderBottom:'1px solid var(--border)' }}>{note}</td></tr>}
    </thead>
  )
}

const TH = { padding:'10px 16px', fontSize:'0.72rem', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.06em', color:'var(--text-3)', textAlign:'left' }

// ─── P&L Tab ──────────────────────────────────────────────────────────────────
function ProfitLoss() {
  return (
    <div>
      <div style={{ fontSize:'0.78rem', color:'var(--text-3)', marginBottom:16, padding:'10px 14px', background:'var(--surface-2)', borderRadius:'var(--r-md)', border:'1px solid var(--border)' }}>
        <Info size={13} style={{ display:'inline', marginRight:6, verticalAlign:'middle' }}/>
        Statement of Profit & Loss — As per Schedule III, Part II of Companies Act 2013 | Figures in ₹
      </div>
      <div className="card" style={{ overflow:'auto' }}>
        <table style={{ width:'100%', borderCollapse:'collapse' }}>
          <TableHeader title="Particulars" note="Note: Figures in brackets indicate deductions/losses" />
          <tbody>
            <Section title="I. Revenue from Operations"/>
            <Row label="Revenue from Operations" bold/>
            <Row label="Sales of Products" cy={PL.revenue.salesProducts} py={2580000} indent={1}/>
            <Row label="Sales of Services" cy={PL.revenue.salesServices} py={1720000} indent={1}/>
            <Row label="Less: Sales Returns & Discounts" cy={-PL.revenue.salesReturns} py={-98000} indent={1}/>
            <Row label="Net Revenue from Operations" cy={grossRevenue} py={4202000} subtotal/>

            <Row label="II. Other Income" bold/>
            <Row label="Interest Income" cy={PL.revenue.otherIncome.interest} py={22000} indent={1}/>
            <Row label="Dividend Income" cy={PL.revenue.otherIncome.dividend} py={8000} indent={1}/>
            <Row label="Miscellaneous Income" cy={PL.revenue.otherIncome.misc} py={5000} indent={1}/>
            <Row label="Total Other Income" cy={otherIncome} py={35000} subtotal/>

            <Row label="III. Total Revenue (I + II)" cy={totalRevenue} py={4237000} bold total/>

            <Row label="IV. Expenses" bold/>
            <Row label="Cost of Goods Sold" bold indent={1}/>
            <Row label="Opening Stock" cy={PL.expenses.openingStock} py={280000} indent={2}/>
            <Row label="Add: Purchases" cy={PL.expenses.purchases} py={1420000} indent={2}/>
            <Row label="Less: Purchase Returns" cy={-PL.expenses.purchaseReturns} py={-32000} indent={2}/>
            <Row label="Add: Freight Inward" cy={PL.expenses.freightInward} py={31000} indent={2}/>
            <Row label="Less: Closing Stock" cy={-PL.expenses.closingStock} py={-320000} indent={2}/>
            <Row label="Cost of Materials Consumed" cy={cogs} py={1379000} subtotal indent={1}/>

            <Row label="Employee Benefit Expense" bold indent={1}/>
            <Row label="Salaries & Wages" cy={PL.expenses.salaries} py={1620000} indent={2}/>
            <Row label="PF Contribution (Employer)" cy={PL.expenses.pfEmployer} py={28000} indent={2}/>
            <Row label="ESIC Contribution (Employer)" cy={PL.expenses.esicEmployer} py={1400} indent={2}/>
            <Row label="Staff Welfare" cy={PL.expenses.staffWelfare} py={19000} indent={2}/>
            <Row label="Total Employee Benefit Expense" cy={employeeCost} py={1668400} subtotal indent={1}/>

            <Row label="Finance Costs" bold indent={1}/>
            <Row label="Interest on Term Loans" cy={PL.expenses.bankInterest} py={52000} indent={2}/>
            <Row label="Bank Charges & Commission" cy={PL.expenses.bankCharges} py={10200} indent={2}/>
            <Row label="Total Finance Costs" cy={financeCosts} py={62200} subtotal indent={1}/>

            <Row label="Depreciation & Amortisation Expense" cy={PL.expenses.depreciation} py={88000} indent={1}/>

            <Row label="Other Expenses" bold indent={1}/>
            <Row label="Rent" cy={PL.expenses.rent} py={420000} indent={2}/>
            <Row label="Electricity Charges" cy={PL.expenses.electricity} py={72000} indent={2}/>
            <Row label="Internet & Telephone" cy={PL.expenses.internet} py={30000} indent={2}/>
            <Row label="Software & Subscriptions" cy={PL.expenses.software} py={96000} indent={2}/>
            <Row label="Advertising & Marketing" cy={PL.expenses.advertising} py={76000} indent={2}/>
            <Row label="Travelling & Conveyance" cy={PL.expenses.travel} py={42000} indent={2}/>
            <Row label="Professional & Legal Fees" cy={PL.expenses.professional} py={98000} indent={2}/>
            <Row label="Repairs & Maintenance" cy={PL.expenses.repairs} py={28000} indent={2}/>
            <Row label="Printing & Stationery" cy={PL.expenses.printing} py={15000} indent={2}/>
            <Row label="Insurance" cy={PL.expenses.insurance} py={30000} indent={2}/>
            <Row label="Total Other Expenses" cy={otherExpenses} py={907000} subtotal indent={1}/>

            <Row label="V. Total Expenses (IV)" cy={totalExpenses} py={4104600} bold total/>

            <Row label="VI. Profit Before Tax (III - V)" cy={pbt} py={132400} bold total/>

            <Row label="VII. Tax Expense" bold/>
            <Row label="Current Tax" cy={PL.tax.currentTax} py={28000} indent={1}/>
            <Row label="Deferred Tax" cy={PL.tax.deferredTax} py={12000} indent={1}/>
            <Row label="Total Tax Expense" cy={tax} py={40000} subtotal/>

            <Row label="VIII. Profit / (Loss) After Tax (VI - VII)" cy={pat} py={92400} bold total/>
            <Row label="Earnings Per Share (Face Value ₹10)" bold/>
            <Row label="Basic EPS (₹)" cy={(pat/100000).toFixed(2)} py={(92400/100000).toFixed(2)} indent={1}/>
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── Balance Sheet Tab ────────────────────────────────────────────────────────
function BalanceSheet() {
  return (
    <div>
      <div style={{ fontSize:'0.78rem', color:'var(--text-3)', marginBottom:16, padding:'10px 14px', background:'var(--surface-2)', borderRadius:'var(--r-md)', border:'1px solid var(--border)' }}>
        <Info size={13} style={{ display:'inline', marginRight:6, verticalAlign:'middle' }}/>
        Balance Sheet as at 31st March 2024 — As per Schedule III, Part I of Companies Act 2013 | Figures in ₹
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
        {/* EQUITY & LIABILITIES */}
        <div className="card" style={{ overflow:'auto' }}>
          <table style={{ width:'100%', borderCollapse:'collapse' }}>
            <TableHeader title="EQUITY & LIABILITIES" />
            <tbody>
              <Row label="I. Shareholders' Funds" bold/>
              <Row label="Share Capital" cy={BS.equity.shareCapital} py={1000000} indent={1}/>
              <Row label="Reserves & Surplus" bold indent={1}/>
              <Row label="General Reserve" cy={BS.equity.generalReserve} py={450000} indent={2}/>
              <Row label="Surplus (P&L Balance)" cy={BS.equity.plBalance} py={420000} indent={2}/>
              <Row label="Total Shareholders' Funds" cy={totalEquity} py={1870000} subtotal/>

              <Row label="II. Non-Current Liabilities" bold/>
              <Row label="Long-term Borrowings" bold indent={1}/>
              <Row label="Term Loan - HDFC Bank" cy={BS.nonCurrentLiab.termLoan} py={1000000} indent={2}/>
              <Row label="Vehicle Loan - Axis Bank" cy={BS.nonCurrentLiab.vehicleLoan} py={300000} indent={2}/>
              <Row label="Deferred Tax Liability (Net)" cy={BS.nonCurrentLiab.deferredTaxLiab} py={0} indent={1}/>
              <Row label="Total Non-Current Liabilities" cy={totalNCLiab} py={1300000} subtotal/>

              <Row label="III. Current Liabilities" bold/>
              <Row label="Trade Payables" bold indent={1}/>
              <Row label="Sundry Creditors" cy={BS.currentLiab.tradePayables} py={310000} indent={2}/>
              <Row label="Other Current Liabilities" bold indent={1}/>
              <Row label="Output GST Payable (CGST+SGST)" cy={BS.currentLiab.outputCGST+BS.currentLiab.outputSGST} py={120000} indent={2}/>
              <Row label="TDS Payable" cy={BS.currentLiab.tdsPayable} py={15000} indent={2}/>
              <Row label="PF & ESIC Payable" cy={BS.currentLiab.pfPayable+BS.currentLiab.esicPayable} py={28000} indent={2}/>
              <Row label="Salary Payable" cy={BS.currentLiab.salaryPayable} py={320000} indent={2}/>
              <Row label="Advance from Customers" cy={BS.currentLiab.advanceFromCustomers} py={35000} indent={2}/>
              <Row label="Total Current Liabilities" cy={totalCLiab} py={828000} subtotal/>

              <Row label="TOTAL EQUITY & LIABILITIES" cy={totalEqLiab} py={3998000} bold total/>
            </tbody>
          </table>
        </div>

        {/* ASSETS */}
        <div className="card" style={{ overflow:'auto' }}>
          <table style={{ width:'100%', borderCollapse:'collapse' }}>
            <TableHeader title="ASSETS" />
            <tbody>
              <Row label="I. Non-Current Assets" bold/>
              <Row label="Fixed Assets (Tangible)" bold indent={1}/>
              <Row label="Land & Building" cy={BS.nonCurrentAssets.landBuilding} py={1200000} indent={2}/>
              <Row label="Plant & Machinery" cy={BS.nonCurrentAssets.plantMachinery} py={650000} indent={2}/>
              <Row label="Furniture & Fixtures" cy={BS.nonCurrentAssets.furniture} py={95000} indent={2}/>
              <Row label="Computers & Peripherals" cy={BS.nonCurrentAssets.computers} py={120000} indent={2}/>
              <Row label="Vehicles" cy={BS.nonCurrentAssets.vehicles} py={380000} indent={2}/>
              <Row label="Less: Accumulated Depreciation" cy={BS.nonCurrentAssets.accDep} py={-222000} indent={2}/>
              <Row label="Net Fixed Assets" cy={fixedAssetsGross+BS.nonCurrentAssets.accDep} py={2223000} subtotal indent={1}/>
              <Row label="Non-current Investments" cy={BS.nonCurrentAssets.investments} py={250000} indent={1}/>
              <Row label="Long-term Loans & Advances" cy={BS.nonCurrentAssets.securityDeposits} py={120000} indent={1}/>
              <Row label="Total Non-Current Assets" cy={totalNCA} py={2593000} subtotal/>

              <Row label="II. Current Assets" bold/>
              <Row label="Inventories" bold indent={1}/>
              <Row label="Stock-in-Trade" cy={BS.currentAssets.stockInTrade} py={320000} indent={2}/>
              <Row label="Raw Materials" cy={BS.currentAssets.rawMaterials} py={120000} indent={2}/>
              <Row label="Work-in-Progress" cy={BS.currentAssets.wip} py={65000} indent={2}/>
              <Row label="Trade Receivables" bold indent={1}/>
              <Row label="Sundry Debtors" cy={BS.currentAssets.debtors} py={720000} indent={2}/>
              <Row label="Bills Receivable" cy={BS.currentAssets.billsReceivable} py={80000} indent={2}/>
              <Row label="Cash & Cash Equivalents" bold indent={1}/>
              <Row label="Cash in Hand" cy={BS.currentAssets.cashInHand} py={52000} indent={2}/>
              <Row label="HDFC Bank - Current A/c" cy={BS.currentAssets.hdfcBank} py={980000} indent={2}/>
              <Row label="SBI Bank - Savings A/c" cy={BS.currentAssets.sbiBank} py={290000} indent={2}/>
              <Row label="Other Current Assets" bold indent={1}/>
              <Row label="Input GST Receivable" cy={BS.currentAssets.inputCGST+BS.currentAssets.inputSGST} py={64000} indent={2}/>
              <Row label="TDS Receivable" cy={BS.currentAssets.tdsReceivable} py={18000} indent={2}/>
              <Row label="Prepaid Expenses" cy={BS.currentAssets.prepaid} py={28000} indent={2}/>
              <Row label="Advance to Suppliers" cy={BS.currentAssets.advanceToSuppliers} py={45000} indent={2}/>
              <Row label="Total Current Assets" cy={totalCA} py={2782000} subtotal/>

              <Row label="TOTAL ASSETS" cy={totalAssets} py={3998000-2000} bold total/>
            </tbody>
          </table>
        </div>
      </div>
      {Math.abs(totalEqLiab - totalAssets) < 10 && (
        <div className="alert-banner success" style={{ marginTop:16 }}>
          <span className="alert-msg">✓ Balance Sheet is balanced — Total Assets = Total Equity & Liabilities = ₹{fmt(totalEqLiab)}</span>
        </div>
      )}
    </div>
  )
}

// ─── Cash Flow Tab ────────────────────────────────────────────────────────────
function CashFlow() {
  const CfRow = ({ label, val, bold, indent, subtotal, total }) => {
    const color = val < 0 ? 'var(--danger)' : val > 0 ? 'var(--text)' : 'var(--text-4)'
    const bg = total ? 'var(--primary-l)' : subtotal ? 'var(--surface-2)' : 'transparent'
    return (
      <tr style={{ background:bg, borderBottom:'1px solid var(--border)' }}>
        <td style={{ padding:'7px 16px', paddingLeft:16+(indent||0)*16, fontSize:'0.83rem',
          fontWeight: bold||subtotal||total ? 700 : 400 }}>{label}</td>
        <td style={{ padding:'7px 16px', textAlign:'right', fontFamily:'var(--font-mono)',
          fontSize:'0.83rem', fontWeight: bold||subtotal||total ? 700 : 400, color }}>
          {val === undefined || val === null ? '' : val < 0 ? `(${fmt(Math.abs(val))})` : fmt(val)}
        </td>
        <td style={{ padding:'7px 16px', textAlign:'right', fontFamily:'var(--font-mono)', fontSize:'0.83rem', color:'var(--text-4)' }}>
          {val !== undefined && val !== null ? (val < 0 ? `(${fmt(Math.abs(Math.round(val*0.7)))})` : fmt(Math.round(val*0.7))) : ''}
        </td>
      </tr>
    )
  }

  return (
    <div>
      <div style={{ fontSize:'0.78rem', color:'var(--text-3)', marginBottom:16, padding:'10px 14px', background:'var(--surface-2)', borderRadius:'var(--r-md)', border:'1px solid var(--border)' }}>
        <Info size={13} style={{ display:'inline', marginRight:6, verticalAlign:'middle' }}/>
        Cash Flow Statement — Indirect Method as per AS-3 (Revised) / Ind AS-7 | Figures in ₹
      </div>
      <div className="card" style={{ overflow:'auto' }}>
        <table style={{ width:'100%', borderCollapse:'collapse' }}>
          <TableHeader title="Particulars"/>
          <tbody>
            <CfRow label="A. CASH FLOW FROM OPERATING ACTIVITIES" bold/>
            <CfRow label="Net Profit Before Tax" val={pbt} indent={1}/>
            <CfRow label="Adjustments for:" bold indent={1}/>
            <CfRow label="Add: Depreciation & Amortisation" val={CF.operating.adjustments.depreciation} indent={2}/>
            <CfRow label="Add: Interest Expense (Finance Costs)" val={CF.operating.adjustments.interestExpense} indent={2}/>
            <CfRow label="Less: Interest Income" val={CF.operating.adjustments.interestIncome} indent={2}/>
            <CfRow label="Less: Dividend Income" val={CF.operating.adjustments.dividendIncome} indent={2}/>
            <CfRow label="Operating Profit Before Working Capital Changes" val={pbt+cfOpsAdj} subtotal indent={1}/>
            <CfRow label="Changes in Working Capital:" bold indent={1}/>
            <CfRow label="(Increase) / Decrease in Trade Receivables" val={CF.operating.workingCapital.debtors} indent={2}/>
            <CfRow label="(Increase) / Decrease in Inventories" val={CF.operating.workingCapital.inventory} indent={2}/>
            <CfRow label="Increase / (Decrease) in Trade Payables" val={CF.operating.workingCapital.creditors} indent={2}/>
            <CfRow label="Increase / (Decrease) in Other Current Liabilities" val={CF.operating.workingCapital.otherCurrentLiab} indent={2}/>
            <CfRow label="(Increase) / Decrease in Other Current Assets" val={CF.operating.workingCapital.otherCurrentAssets} indent={2}/>
            <CfRow label="Cash Generated from Operations" val={pbt+cfOpsAdj+cfOpsWC} subtotal indent={1}/>
            <CfRow label="Less: Income Tax Paid (Net)" val={CF.operating.tax_paid} indent={1}/>
            <CfRow label="Net Cash from Operating Activities (A)" val={cfFromOps} bold total/>

            <CfRow label="B. CASH FLOW FROM INVESTING ACTIVITIES" bold/>
            <CfRow label="Purchase of Fixed Assets (incl. CWIP)" val={CF.investing.purchaseFA} indent={1}/>
            <CfRow label="Purchase of Investments" val={CF.investing.purchaseInvestments || null} indent={1}/>
            <CfRow label="Sale of Investments" val={CF.investing.saleInvestments || null} indent={1}/>
            <CfRow label="Interest Received" val={CF.investing.interestReceived} indent={1}/>
            <CfRow label="Dividend Received" val={CF.investing.dividendReceived} indent={1}/>
            <CfRow label="Net Cash from Investing Activities (B)" val={cfFromInvest} bold total/>

            <CfRow label="C. CASH FLOW FROM FINANCING ACTIVITIES" bold/>
            <CfRow label="Repayment of Long-term Borrowings" val={CF.financing.repaymentBorrowings} indent={1}/>
            <CfRow label="Proceeds from Borrowings" val={CF.financing.proceedsBorrowings || null} indent={1}/>
            <CfRow label="Interest Paid" val={CF.financing.interestPaid} indent={1}/>
            <CfRow label="Dividend Paid" val={CF.financing.dividendPaid || null} indent={1}/>
            <CfRow label="Net Cash from Financing Activities (C)" val={cfFromFin} bold total/>

            <CfRow label="Net Increase / (Decrease) in Cash (A+B+C)" val={netCashChange} bold total/>
            <CfRow label="Opening Cash & Cash Equivalents" val={CF.openingCash} subtotal/>
            <CfRow label="Closing Cash & Cash Equivalents" val={closingCash} bold total/>

            <tr style={{ background:'var(--surface-2)', borderTop:'2px solid var(--border)' }}>
              <td colSpan={3} style={{ padding:'10px 16px', fontSize:'0.75rem', color:'var(--text-3)', fontStyle:'italic' }}>
                Note: Cash & Cash Equivalents comprise Cash in Hand, HDFC Bank Current A/c and SBI Savings A/c. Figures in brackets indicate outflows.
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function Reports() {
  const { activeCompany } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const tab = searchParams.get('tab') || 'pl'

  const fin = computeFinancials(activeCompany?.id)
  const isSampleData = !fin.hasRealData

  const TABS = [
    { key:'pl',            label:'P & L Statement',  icon:TrendingUp },
    { key:'balance-sheet', label:'Balance Sheet',     icon:BarChart2 },
    { key:'cashflow',      label:'Cash Flow',         icon:ArrowLeftRight },
  ]

  const subtitles = {
    'pl':            'Statement of Profit & Loss — Schedule III, Part II',
    'balance-sheet': 'Balance Sheet as at 31st March 2024 — Schedule III, Part I',
    'cashflow':      'Cash Flow Statement (Indirect Method) — AS-3 / Ind AS-7',
  }

  return (
    <div className="page-enter">
      <div className="page-header">
        <div>
          <h1 className="page-title">Financial Reports</h1>
          <p className="page-subtitle">{subtitles[tab]} · Acme Corp Pvt Ltd · {CY}</p>
        </div>
        <div className="page-actions">
          <button className="btn btn-secondary"><Download size={15}/> Export PDF</button>
          <button className="btn btn-secondary"><Download size={15}/> Export Excel</button>
        </div>
      </div>

      {/* Sample data banner */}
      {isSampleData && (
        <div style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 14px', background:'#FFF7ED', border:'1px solid #FED7AA', borderRadius:10, marginBottom:16, fontSize:13 }}>
          <Info size={15} color="#D97706"/>
          <span style={{ color:'#92400E' }}><strong>Sample Data</strong> — No real vouchers posted yet. This report shows demo data. Post entries from the Dashboard to see your actual financials.</span>
        </div>
      )}

      {/* Tabs */}
      <div style={{ display:'flex', gap:2, marginBottom:20, background:'var(--surface-2)', padding:4, borderRadius:'var(--r-md)', width:'fit-content', border:'1px solid var(--border)' }}>
        {TABS.map(t => (
          <button key={t.key}
            onClick={() => setSearchParams({ tab: t.key })}
            className={tab===t.key ? 'btn btn-primary' : 'btn btn-secondary'}
            style={{ display:'flex', alignItems:'center', gap:7, padding:'7px 16px', fontSize:'0.83rem' }}>
            <t.icon size={14}/> {t.label}
          </button>
        ))}
      </div>

      {tab === 'pl'            && <ProfitLoss/>}
      {tab === 'balance-sheet' && <BalanceSheet/>}
      {tab === 'cashflow'      && <CashFlow/>}
    </div>
  )
}
