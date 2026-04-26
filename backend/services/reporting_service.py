"""
services/reporting_service.py  — v2.1 PRODUCTION
Financial Reporting Engine:
  - Profit & Loss Statement
  - Balance Sheet (Schedule III — Companies Act, 2013)
  - Trial Balance
  - Cash Flow Statement
  - Receivables / Payables Aging
  - Expense Breakdown
  - AI-powered plain-language summaries
"""

from __future__ import annotations

import os
from datetime import date, timedelta
from decimal import Decimal
from typing import Optional

import asyncpg
import structlog

log = structlog.get_logger()


class ReportingService:

    def __init__(self, db: asyncpg.Pool):
        self.db = db
        self._anthropic_key = os.getenv("ANTHROPIC_API_KEY", "")

    # ── Trial Balance ──────────────────────────────────────────────────────

    async def get_trial_balance(self, company_id: str, as_of: Optional[str] = None) -> dict:
        """Full trial balance with opening, movement, and closing balances."""
        async with self.db.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT
                    a.code, a.name, a.nature, a.account_type, a.schedule_iii_head,
                    a.opening_balance, a.opening_dr_cr,
                    COALESCE(SUM(jl.dr_amount), 0) AS period_dr,
                    COALESCE(SUM(jl.cr_amount), 0) AS period_cr,
                    CASE
                        WHEN a.opening_dr_cr='dr'
                        THEN a.opening_balance + COALESCE(SUM(jl.dr_amount),0) - COALESCE(SUM(jl.cr_amount),0)
                        ELSE a.opening_balance + COALESCE(SUM(jl.cr_amount),0) - COALESCE(SUM(jl.dr_amount),0)
                    END AS closing_balance,
                    CASE WHEN a.nature IN ('asset','expense') THEN 'dr' ELSE 'cr' END AS normal_side
                FROM accounts a
                LEFT JOIN journal_lines jl ON jl.account_id = a.id
                LEFT JOIN vouchers v       ON v.id = jl.voucher_id AND v.status = 'posted'
                WHERE a.company_id = $1::uuid AND a.is_active = TRUE
                GROUP BY a.id
                HAVING a.opening_balance <> 0
                    OR COALESCE(SUM(jl.dr_amount), 0) <> 0
                    OR COALESCE(SUM(jl.cr_amount), 0) <> 0
                ORDER BY a.nature, a.code
                """,
                company_id
            )

        items = []
        total_dr = Decimal("0")
        total_cr = Decimal("0")

        for row in rows:
            closing = Decimal(str(row["closing_balance"] or 0))
            normal  = row["normal_side"]
            closing_dr = closing if (normal == "dr" and closing > 0) else Decimal("0")
            closing_cr = closing if (normal == "cr" and closing > 0) else Decimal("0")
            if normal == "dr" and closing < 0:
                closing_cr = abs(closing)
            if normal == "cr" and closing < 0:
                closing_dr = abs(closing)
            total_dr += closing_dr
            total_cr += closing_cr
            items.append({
                "code":              row["code"],
                "name":              row["name"],
                "nature":            row["nature"],
                "account_type":      row["account_type"],
                "schedule_iii_head": row["schedule_iii_head"],
                "opening_balance":   float(row["opening_balance"] or 0),
                "opening_dr_cr":     row["opening_dr_cr"],
                "period_dr":         float(row["period_dr"] or 0),
                "period_cr":         float(row["period_cr"] or 0),
                "closing_dr":        float(closing_dr),
                "closing_cr":        float(closing_cr),
            })

        return {
            "as_of":    as_of or str(date.today()),
            "items":    items,
            "totals":   {"dr": float(total_dr), "cr": float(total_cr)},
            "balanced": abs(total_dr - total_cr) < Decimal("0.01"),
        }

    # ── Profit & Loss ──────────────────────────────────────────────────────

    async def get_profit_and_loss(
        self,
        company_id: str,
        from_date:  Optional[date] = None,
        to_date:    Optional[date] = None,
    ) -> dict:
        if not from_date:
            today     = date.today()
            from_date = date(today.year, 4, 1)  # Indian FY starts April 1
        if not to_date:
            to_date = date.today()

        async with self.db.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT a.name, a.nature, a.account_type, a.schedule_iii_head,
                       SUM(jl.cr_amount - jl.dr_amount) AS net_amount
                FROM journal_lines jl
                JOIN accounts a ON a.id = jl.account_id
                JOIN vouchers v ON v.id = jl.voucher_id
                WHERE v.company_id=$1::uuid AND v.date BETWEEN $2 AND $3
                  AND v.status='posted'
                  AND a.nature IN ('income','expense')
                GROUP BY a.id
                ORDER BY a.nature, a.schedule_iii_head, a.name
                """,
                company_id, from_date, to_date
            )

        income_groups:  dict[str, list] = {}
        expense_groups: dict[str, list] = {}
        total_income  = Decimal("0")
        total_expense = Decimal("0")

        for row in rows:
            amount = abs(Decimal(str(row["net_amount"] or 0)))
            group  = row["schedule_iii_head"] or ("Revenue from Operations" if row["nature"] == "income" else "Other Expenses")
            item   = {"name": row["name"], "amount": float(amount)}

            if row["nature"] == "income":
                income_groups.setdefault(group, []).append(item)
                total_income += amount
            else:
                expense_groups.setdefault(group, []).append(item)
                total_expense += amount

        gross_profit = Decimal("0")
        # Compute gross profit (revenue - COGS)
        cogs_keys = {"Cost of Goods Sold", "Direct Expenses (COGS)"}
        cogs_total = sum(
            sum(i["amount"] for i in items)
            for k, items in expense_groups.items() if k in cogs_keys
        )
        gross_profit = total_income - Decimal(str(cogs_total))
        net_profit   = total_income - total_expense

        return {
            "period":       {"from": str(from_date), "to": str(to_date)},
            "revenue":      {k: sorted(v, key=lambda x: -x["amount"]) for k, v in income_groups.items()},
            "expenses":     {k: sorted(v, key=lambda x: -x["amount"]) for k, v in expense_groups.items()},
            "totals": {
                "total_revenue":  float(total_income),
                "total_expenses": float(total_expense),
                "gross_profit":   float(gross_profit),
                "net_profit":     float(net_profit),
                "profit_margin":  round(float(net_profit / max(total_income, Decimal("1"))) * 100, 2),
            },
        }

    # ── Balance Sheet (Schedule III) ──────────────────────────────────────

    async def get_balance_sheet_schedule_iii(
        self,
        company_id: str,
        as_of:      Optional[str] = None,
    ) -> dict:
        """
        Balance Sheet in Schedule III format per Companies Act, 2013.
        Structure:
          EQUITY AND LIABILITIES:
            I.  Shareholders' Funds
            II. Non-Current Liabilities
            III.Current Liabilities
          ASSETS:
            I.  Non-Current Assets
            II. Current Assets
        """
        async with self.db.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT a.nature, a.account_type, a.schedule_iii_head, a.name,
                       CASE
                           WHEN a.opening_dr_cr='dr'
                           THEN a.opening_balance + COALESCE(SUM(jl.dr_amount),0) - COALESCE(SUM(jl.cr_amount),0)
                           ELSE a.opening_balance + COALESCE(SUM(jl.cr_amount),0) - COALESCE(SUM(jl.dr_amount),0)
                       END AS balance
                FROM accounts a
                LEFT JOIN journal_lines jl ON jl.account_id = a.id
                LEFT JOIN vouchers v       ON v.id = jl.voucher_id AND v.status = 'posted'
                WHERE a.company_id = $1::uuid AND a.is_active = TRUE
                GROUP BY a.id
                ORDER BY a.nature, a.schedule_iii_head, a.name
                """,
                company_id
            )

        # Organise by Schedule III heads
        schedule3: dict[str, dict[str, list]] = {
            "equity_and_liabilities": {
                "Shareholders' Funds": [],
                "Non-Current Liabilities": [],
                "Current Liabilities": [],
            },
            "assets": {
                "Non-Current Assets": [],
                "Current Assets": [],
            }
        }

        nature_to_side = {
            "equity":    "equity_and_liabilities",
            "liability": "equity_and_liabilities",
            "asset":     "assets",
        }
        # Income / Expense → accumulate into retained earnings for BS
        net_profit = Decimal("0")
        retained   = None

        for row in rows:
            balance = Decimal(str(row["balance"] or 0))
            if row["nature"] == "income":
                net_profit += balance
                continue
            if row["nature"] == "expense":
                net_profit -= balance
                continue

            side  = nature_to_side.get(row["nature"])
            head  = row["schedule_iii_head"] or self._infer_head(row["nature"], row["account_type"])
            if not side or head not in schedule3.get(side, {}):
                continue

            schedule3[side][head].append({
                "name":    row["name"],
                "balance": float(abs(balance)),
            })

        # Add net profit to Shareholders' Funds
        schedule3["equity_and_liabilities"]["Shareholders' Funds"].append({
            "name":    "Surplus / (Deficit) in P&L",
            "balance": float(net_profit),
        })

        # Compute totals
        def _total(section_items: dict) -> float:
            return sum(sum(i["balance"] for i in items) for items in section_items.values())

        total_eq_liab = _total(schedule3["equity_and_liabilities"])
        total_assets  = _total(schedule3["assets"])

        return {
            "as_of":                as_of or str(date.today()),
            "equity_and_liabilities": {
                k: {
                    "items": v,
                    "subtotal": sum(i["balance"] for i in v),
                }
                for k, v in schedule3["equity_and_liabilities"].items()
            },
            "assets": {
                k: {
                    "items": v,
                    "subtotal": sum(i["balance"] for i in v),
                }
                for k, v in schedule3["assets"].items()
            },
            "totals": {
                "total_equity_and_liabilities": total_eq_liab,
                "total_assets":                 total_assets,
                "balanced":                     abs(total_eq_liab - total_assets) < 0.01,
            },
        }

    # ── Cash Flow ──────────────────────────────────────────────────────────

    async def get_cash_flow(
        self,
        company_id: str,
        from_date: Optional[date] = None,
        to_date:   Optional[date] = None,
    ) -> dict:
        if not from_date: from_date = date(date.today().year, 4, 1)
        if not to_date:   to_date   = date.today()

        async with self.db.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT a.account_type, a.nature,
                       SUM(jl.dr_amount - jl.cr_amount) AS net_movement
                FROM journal_lines jl
                JOIN accounts a ON a.id = jl.account_id
                JOIN vouchers v ON v.id = jl.voucher_id
                WHERE v.company_id=$1::uuid AND v.date BETWEEN $2 AND $3
                  AND v.status='posted'
                GROUP BY a.account_type, a.nature
                """,
                company_id, from_date, to_date
            )

        operating = Decimal("0")
        investing  = Decimal("0")
        financing  = Decimal("0")

        for row in rows:
            movement = Decimal(str(row["net_movement"] or 0))
            atype    = row["account_type"]
            nature   = row["nature"]

            if atype in ("bank", "cash"):
                continue  # This IS cash flow
            elif nature in ("income", "expense"):
                operating += movement
            elif atype in ("fixed_asset", "investment"):
                investing += -movement
            elif atype in ("loan", "capital"):
                financing += -movement
            else:
                operating += movement

        # Get net cash change from bank/cash accounts
        cash_change_row = await self.db.fetchval(
            """
            SELECT SUM(jl.cr_amount - jl.dr_amount)
            FROM journal_lines jl
            JOIN accounts a ON a.id = jl.account_id
            JOIN vouchers v ON v.id = jl.voucher_id
            WHERE v.company_id=$1::uuid AND v.date BETWEEN $2 AND $3
              AND v.status='posted' AND a.account_type IN ('bank','cash')
            """,
            company_id, from_date, to_date
        ) or Decimal("0")

        return {
            "period":            {"from": str(from_date), "to": str(to_date)},
            "operating_activities": float(operating),
            "investing_activities": float(investing),
            "financing_activities": float(financing),
            "net_cash_change":      float(Decimal(str(cash_change_row))),
        }

    # ── Dashboard Summary ─────────────────────────────────────────────────

    async def get_dashboard_summary(self, company_id: str) -> dict:
        today     = date.today()
        month_start = date(today.year, today.month, 1)

        async with self.db.acquire() as conn:
            # Monthly revenue
            revenue = await conn.fetchval(
                """SELECT COALESCE(SUM(jl.cr_amount - jl.dr_amount),0)
                   FROM journal_lines jl JOIN accounts a ON a.id=jl.account_id
                   JOIN vouchers v ON v.id=jl.voucher_id
                   WHERE v.company_id=$1::uuid AND v.status='posted'
                     AND a.nature='income' AND v.date>=$2""",
                company_id, month_start
            )
            # Monthly expense
            expense = await conn.fetchval(
                """SELECT COALESCE(SUM(jl.dr_amount - jl.cr_amount),0)
                   FROM journal_lines jl JOIN accounts a ON a.id=jl.account_id
                   JOIN vouchers v ON v.id=jl.voucher_id
                   WHERE v.company_id=$1::uuid AND v.status='posted'
                     AND a.nature='expense' AND v.date>=$2""",
                company_id, month_start
            )
            # Cash balance
            cash = await conn.fetchval(
                """SELECT COALESCE(SUM(
                       CASE WHEN a.opening_dr_cr='dr'
                            THEN a.opening_balance + SUM(jl.dr_amount) - SUM(jl.cr_amount)
                            ELSE a.opening_balance + SUM(jl.cr_amount) - SUM(jl.dr_amount)
                       END
                   ),0)
                   FROM accounts a
                   LEFT JOIN journal_lines jl ON jl.account_id=a.id
                   LEFT JOIN vouchers v ON v.id=jl.voucher_id AND v.status='posted'
                   WHERE a.company_id=$1::uuid AND a.account_type IN ('bank','cash')
                   GROUP BY a.company_id""",
                company_id
            ) or 0
            # Pending vouchers
            pending = await conn.fetchval(
                "SELECT COUNT(*) FROM vouchers WHERE company_id=$1::uuid AND approval_status='pending'",
                company_id
            ) or 0
            # Unmatched transactions
            unmatched = await conn.fetchval(
                """SELECT COUNT(*) FROM bank_transactions bt
                   WHERE bt.company_id=$1::uuid AND bt.status='unmatched'""",
                company_id
            ) or 0
            # Recent vouchers
            recent = await conn.fetch(
                """SELECT id::text, voucher_no, voucher_type, date, narration,
                          ai_confidence, status
                   FROM vouchers WHERE company_id=$1::uuid AND status='posted'
                   ORDER BY created_at DESC LIMIT 10""",
                company_id
            )

        return {
            "month_revenue":       float(revenue or 0),
            "month_expense":       float(expense or 0),
            "net_profit_month":    float((revenue or 0) - (expense or 0)),
            "cash_balance":        float(cash or 0),
            "pending_approval":    int(pending),
            "unmatched_bank_txns": int(unmatched),
            "recent_vouchers":     [dict(r) for r in recent],
        }

    # ── Aging Reports ─────────────────────────────────────────────────────

    async def get_aging_report(self, company_id: str, report_type: str) -> dict:
        account_type = "debtor" if report_type == "receivable" else "creditor"
        today        = date.today()

        async with self.db.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT a.name, a.gstin,
                       COALESCE(SUM(jl.dr_amount - jl.cr_amount), 0) AS balance,
                       MIN(v.date) AS oldest_voucher_date
                FROM accounts a
                JOIN journal_lines jl ON jl.account_id = a.id
                JOIN vouchers v       ON v.id = jl.voucher_id AND v.status = 'posted'
                WHERE a.company_id=$1::uuid AND a.account_type=$2
                GROUP BY a.id
                HAVING ABS(SUM(jl.dr_amount - jl.cr_amount)) > 0.01
                ORDER BY balance DESC
                """,
                company_id, account_type
            )

        buckets = {"current": [], "30_days": [], "60_days": [], "90_days": [], "over_90": []}
        totals  = {k: Decimal("0") for k in buckets}

        for row in rows:
            balance = Decimal(str(row["balance"] or 0))
            if report_type == "payable":
                balance = -balance  # Creditors have credit balances
            oldest  = row["oldest_voucher_date"]
            delta   = (today - oldest).days if oldest else 0

            item = {
                "party":   row["name"],
                "gstin":   row["gstin"],
                "balance": float(balance),
                "days":    delta,
            }

            if delta <= 30:
                bucket = "current"
            elif delta <= 60:
                bucket = "30_days"
            elif delta <= 90:
                bucket = "60_days"
            elif delta <= 120:
                bucket = "90_days"
            else:
                bucket = "over_90"

            buckets[bucket].append(item)
            totals[bucket] += balance

        return {
            "type":    report_type,
            "as_of":   str(today),
            "buckets": {k: {"items": v, "total": float(totals[k])} for k, v in buckets.items()},
            "grand_total": float(sum(totals.values())),
        }

    # ── Expense Breakdown ─────────────────────────────────────────────────

    async def get_expense_breakdown(
        self,
        company_id: str,
        from_date: Optional[date] = None,
        to_date:   Optional[date] = None,
    ) -> dict:
        if not from_date: from_date = date(date.today().year, 4, 1)
        if not to_date:   to_date   = date.today()

        async with self.db.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT a.name, a.schedule_iii_head,
                       SUM(jl.dr_amount - jl.cr_amount) AS amount
                FROM journal_lines jl
                JOIN accounts a ON a.id = jl.account_id
                JOIN vouchers v ON v.id = jl.voucher_id
                WHERE v.company_id=$1::uuid AND v.date BETWEEN $2 AND $3
                  AND v.status='posted' AND a.nature='expense'
                GROUP BY a.id
                ORDER BY amount DESC
                LIMIT 20
                """,
                company_id, from_date, to_date
            )

        items = [
            {
                "name":    row["name"],
                "group":   row["schedule_iii_head"] or "Other",
                "amount":  float(row["amount"] or 0),
            }
            for row in rows
            if (row["amount"] or 0) > 0
        ]
        total = sum(i["amount"] for i in items)

        for item in items:
            item["percentage"] = round(item["amount"] / max(total, 0.01) * 100, 1)

        return {
            "period": {"from": str(from_date), "to": str(to_date)},
            "items":  items,
            "total":  total,
        }

    # ── AI Summary ────────────────────────────────────────────────────────

    async def generate_ai_summary(
        self,
        company_id: str,
        report_data: dict,
        report_type: str,
        lang: str = "simple",
    ) -> str:
        if not self._anthropic_key:
            return self._rule_based_summary(report_data, report_type)

        try:
            import anthropic
            client = anthropic.Anthropic(api_key=self._anthropic_key)
            prompt = (
                f"You are a CA (Chartered Accountant) explaining this {report_type} report "
                f"to a {'layman' if lang == 'simple' else 'business owner'}. "
                f"Keep it concise (3-4 sentences). Use Indian business context. "
                f"Data: {report_data.get('totals', {})}"
            )
            resp = client.messages.create(
                model="claude-3-haiku-20240307",
                max_tokens=200,
                messages=[{"role": "user", "content": prompt}],
            )
            return resp.content[0].text
        except Exception as e:
            log.warning("ai_summary_failed", error=str(e))
            return self._rule_based_summary(report_data, report_type)

    def _rule_based_summary(self, data: dict, report_type: str) -> str:
        if report_type == "pnl":
            totals = data.get("totals", {})
            revenue = totals.get("total_revenue", 0)
            expense = totals.get("total_expenses", 0)
            profit  = totals.get("net_profit", 0)
            margin  = totals.get("profit_margin", 0)
            status  = "profitable" if profit > 0 else "at a loss"
            return (
                f"Your business is {status} this period. "
                f"Revenue: ₹{revenue:,.2f} | Expenses: ₹{expense:,.2f} | "
                f"Net Profit: ₹{profit:,.2f} ({margin}% margin)."
            )
        return "Report generated successfully."

    # ── Helpers ───────────────────────────────────────────────────────────

    def _infer_head(self, nature: str, account_type: str) -> str:
        mapping = {
            ("asset",     "bank"):         "Current Assets",
            ("asset",     "cash"):         "Current Assets",
            ("asset",     "debtor"):       "Current Assets",
            ("asset",     "fixed_asset"):  "Non-Current Assets",
            ("asset",     "investment"):   "Non-Current Assets",
            ("asset",     "other"):        "Current Assets",
            ("liability", "creditor"):     "Current Liabilities",
            ("liability", "tax"):          "Current Liabilities",
            ("liability", "loan"):         "Non-Current Liabilities",
            ("equity",    "capital"):      "Shareholders' Funds",
        }
        return mapping.get((nature, account_type), "Current Assets" if nature == "asset" else "Current Liabilities")
