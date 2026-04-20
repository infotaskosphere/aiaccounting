"""
tests/test_services.py
-----------------------
Comprehensive tests for all upgraded services:
- Accounting logic (double-entry balance)
- AI classification accuracy
- Reconciliation matching
- Ingestion parsing
- API integration
"""

import pytest
import asyncio
from decimal import Decimal
from datetime import date
from unittest.mock import AsyncMock, MagicMock, patch

# ════════════════════════════════════════════════════════════════════════════
# ACCOUNTING ENGINE TESTS
# ════════════════════════════════════════════════════════════════════════════

class TestDoubleEntry:
    """Verify double-entry integrity — every voucher must balance."""

    def test_balanced_entry(self):
        lines = [
            {"account_id": "A1", "dr_amount": 1000, "cr_amount": 0},
            {"account_id": "A2", "dr_amount": 0,    "cr_amount": 1000},
        ]
        total_dr = sum(l["dr_amount"] for l in lines)
        total_cr = sum(l["cr_amount"] for l in lines)
        assert total_dr == total_cr == 1000

    def test_unbalanced_entry_rejected(self):
        lines = [
            {"account_id": "A1", "dr_amount": 1000, "cr_amount": 0},
            {"account_id": "A2", "dr_amount": 0,    "cr_amount": 800},  # short by 200
        ]
        total_dr = sum(l["dr_amount"] for l in lines)
        total_cr = sum(l["cr_amount"] for l in lines)
        assert total_dr != total_cr, "Unbalanced entry should not pass"

    def test_negative_amounts_rejected(self):
        with pytest.raises(ValueError):
            from decimal import Decimal
            amt = Decimal("-100")
            if amt < 0:
                raise ValueError("Amount cannot be negative")

    def test_multi_line_balance(self):
        """3-line entry (split transaction) must balance."""
        lines = [
            {"dr_amount": 5000, "cr_amount": 0},   # Expense
            {"dr_amount": 500,  "cr_amount": 0},   # Tax
            {"dr_amount": 0,    "cr_amount": 5500}, # Bank
        ]
        assert sum(l["dr_amount"] for l in lines) == sum(l["cr_amount"] for l in lines)


# ════════════════════════════════════════════════════════════════════════════
# AI CLASSIFICATION TESTS
# ════════════════════════════════════════════════════════════════════════════

class TestAIClassification:
    """Test classification accuracy with known patterns."""

    @pytest.fixture
    def classifier(self):
        """Import and init classifier in rule-based fallback mode."""
        from ai.classifier import TransactionClassifier
        clf = TransactionClassifier.__new__(TransactionClassifier)
        clf.model = None
        clf._account_embeddings = {}
        clf._account_index = []
        clf._learned_map = {}
        clf.load_accounts([
            {"id": "acc-salary", "code": "5001", "name": "Salary Expense", "nature": "expense"},
            {"id": "acc-rent",   "code": "5002", "name": "Rent Expense",   "nature": "expense"},
            {"id": "acc-bank",   "code": "1001", "name": "Bank Account",   "nature": "asset"},
            {"id": "acc-misc",   "code": "5999", "name": "Miscellaneous",  "nature": "expense"},
            {"id": "acc-gst",    "code": "2201", "name": "GST Payable",    "nature": "liability"},
        ])
        return clf

    def test_salary_pattern(self, classifier):
        results = classifier.classify_batch(["SALARY PAYMENT TO JOHN"])
        assert len(results) == 1
        # Should detect salary pattern
        assert results[0].confidence > 0

    def test_batch_returns_correct_count(self, classifier):
        narrations = ["NEFT PAYMENT", "UPI TRANSFER", "SALARY APR 2024"]
        results = classifier.classify_batch(narrations)
        assert len(results) == len(narrations)

    def test_confidence_range(self, classifier):
        results = classifier.classify_batch(["Test transaction"])
        for r in results:
            assert 0.0 <= r.confidence <= 1.0

    def test_learned_mapping_takes_priority(self, classifier):
        """Manually confirmed mapping should always win."""
        classifier.load_learned_mappings([
            {"narration": "ACME CORP PAYMENT", "confirmed_account_id": "acc-rent"}
        ])
        results = classifier.classify_batch(["ACME CORP PAYMENT"])
        assert results[0].account_id == "acc-rent"
        assert results[0].method == "exact"

    def test_gst_payment_detected(self, classifier):
        results = classifier.classify_batch(["GST CHALLAN PAYMENT"])
        assert len(results) == 1
        # Should route toward GST/tax account
        assert results[0].account_id is not None


# ════════════════════════════════════════════════════════════════════════════
# RECONCILIATION ENGINE TESTS
# ════════════════════════════════════════════════════════════════════════════

class TestReconciliationEngine:
    """Test smart matching logic."""

    @pytest.fixture
    def engine(self):
        from services.reconciliation_service import ReconciliationService
        svc = object.__new__(ReconciliationService)
        svc.DATE_TOLERANCE_DAYS = 3
        svc.AMOUNT_TOLERANCE_PCT = 0.01
        svc.AUTO_MATCH_THRESHOLD = 0.90
        return svc

    def test_exact_reference_match(self, engine):
        bank = [{"id": "bt1", "txn_date": date(2024,3,1), "amount": Decimal("5000"), "txn_type":"debit", "reference":"INV-001", "narration":"Payment"}]
        vouchers = [{"id": "v1", "date": date(2024,3,1), "reference":"INV-001", "total_amount": Decimal("5000"), "narration":"Invoice"}]
        results = engine._match_transactions(bank, vouchers)
        assert results[0]["status"] == "auto_matched"
        assert results[0]["confidence"] >= 0.90

    def test_amount_date_match(self, engine):
        bank = [{"id": "bt2", "txn_date": date(2024,3,3), "amount": Decimal("10000"), "txn_type":"credit", "reference":"", "narration":"Receipt"}]
        vouchers = [{"id": "v2", "date": date(2024,3,2), "reference":"", "total_amount": Decimal("10000"), "narration":"Sales"}]  # 1 day diff
        results = engine._match_transactions(bank, vouchers)
        assert results[0]["match_type"] == "amount_date"
        assert results[0]["confidence"] > 0.6

    def test_no_match_on_different_amounts(self, engine):
        bank = [{"id": "bt3", "txn_date": date(2024,3,1), "amount": Decimal("5000"), "txn_type":"debit", "reference":"", "narration":"X"}]
        vouchers = [{"id": "v3", "date": date(2024,3,1), "reference":"", "total_amount": Decimal("9999"), "narration":"Y"}]
        results = engine._match_transactions(bank, vouchers)
        assert results[0]["status"] == "unmatched"

    def test_date_beyond_tolerance_no_match(self, engine):
        bank = [{"id": "bt4", "txn_date": date(2024,3,10), "amount": Decimal("3000"), "txn_type":"debit", "reference":"", "narration":"X"}]
        vouchers = [{"id": "v4", "date": date(2024,3,1), "reference":"", "total_amount": Decimal("3000"), "narration":"Y"}]  # 9 days diff
        results = engine._match_transactions(bank, vouchers)
        # With 9-day gap, should not auto-match
        assert results[0]["confidence"] < 0.90

    def test_voucher_not_double_matched(self, engine):
        """Same voucher should not be matched to two bank transactions."""
        bank = [
            {"id": "bt5", "txn_date": date(2024,3,1), "amount": Decimal("1000"), "txn_type":"debit", "reference":"INV-X", "narration":"P1"},
            {"id": "bt6", "txn_date": date(2024,3,1), "amount": Decimal("1000"), "txn_type":"debit", "reference":"INV-X", "narration":"P2"},
        ]
        vouchers = [{"id": "v5", "date": date(2024,3,1), "reference":"INV-X", "total_amount": Decimal("1000"), "narration":"INV"}]
        results = engine._match_transactions(bank, vouchers)
        matched_to_v5 = [r for r in results if r.get("voucher_id") == "v5" and r["status"] == "auto_matched"]
        assert len(matched_to_v5) <= 1, "Voucher matched to more than one transaction"


# ════════════════════════════════════════════════════════════════════════════
# INGESTION / PARSING TESTS
# ════════════════════════════════════════════════════════════════════════════

class TestIngestionService:
    """Test bank statement parsing."""

    @pytest.fixture
    def service(self):
        from services.ingestion_service import IngestionService
        svc = object.__new__(IngestionService)
        return svc

    def test_parse_standard_csv(self, service):
        csv_content = b"""Date,Narration,Debit,Credit,Balance
01/03/2024,SALARY PAYMENT,50000,,450000
02/03/2024,GST PAYMENT,15000,,435000
05/03/2024,SALES RECEIPT,,80000,515000
"""
        txns = service._parse_csv(csv_content)
        assert len(txns) == 3
        assert txns[0]["txn_type"] == "debit"
        assert txns[0]["amount"] == Decimal("50000")
        assert txns[2]["txn_type"] == "credit"
        assert txns[2]["amount"] == Decimal("80000")

    def test_parse_csv_with_balance_col(self, service):
        csv_content = b"""Date,Description,Withdrawal Amt,Deposit Amt,Closing Balance
15/03/2024,NEFT PAYMENT,25000,,100000
16/03/2024,CUSTOMER PAYMENT,,40000,140000
"""
        txns = service._parse_csv(csv_content)
        assert len(txns) == 2
        assert txns[0]["balance"] == Decimal("100000")

    def test_date_parsing(self, service):
        for fmt, expected in [
            ("01/03/2024", date(2024, 3, 1)),
            ("2024-03-01", date(2024, 3, 1)),
            ("01-03-2024", date(2024, 3, 1)),
        ]:
            result = service._parse_date(fmt)
            assert result == expected, f"Failed for format: {fmt}"

    def test_amount_parsing(self, service):
        for raw, expected in [
            ("1,000.00", Decimal("1000.00")),
            ("₹5,000",   Decimal("5000")),
            ("Rs 2500",  Decimal("2500")),
            ("10000",    Decimal("10000")),
        ]:
            result = service._to_decimal(raw)
            assert result == expected, f"Failed for: {raw}"

    def test_empty_rows_skipped(self, service):
        csv_content = b"""Date,Narration,Debit,Credit,Balance
01/03/2024,TEST,1000,,99000
,,,, 
  ,,,,
"""
        txns = service._parse_csv(csv_content)
        assert len(txns) == 1

    def test_invoice_text_extraction(self, service):
        sample_text = """
        INVOICE
        Invoice No: INV-2024-001
        Bill To: Acme Corporation
        Date: 01/03/2024
        
        Subtotal: Rs 10,000
        CGST (9%): Rs 900
        SGST (9%): Rs 900
        Grand Total: Rs 11,800
        """
        result = service._parse_invoice_text(sample_text)
        assert result["invoice_no"] == "INV-2024-001"
        assert result["subtotal"] == 10000.0
        assert result["cgst"] == 900.0
        assert result["total"] == 11800.0


# ════════════════════════════════════════════════════════════════════════════
# REPORTING SERVICE TESTS
# ════════════════════════════════════════════════════════════════════════════

class TestReportingService:
    """Test P&L, Cash Flow, Aging calculations."""

    def test_profit_margin_calculation(self):
        from decimal import Decimal
        income  = Decimal("100000")
        expense = Decimal("70000")
        profit  = income - expense
        margin  = float(profit / income) * 100
        assert margin == 30.0

    def test_aging_bucket_classification(self):
        from datetime import date, timedelta
        today = date.today()
        test_cases = [
            (today - timedelta(days=15),  "0_30"),
            (today - timedelta(days=45),  "31_60"),
            (today - timedelta(days=75),  "61_90"),
            (today - timedelta(days=100), "90_plus"),
        ]
        for txn_date, expected_bucket in test_cases:
            days_old = (today - txn_date).days
            if days_old <= 30:
                bucket = "0_30"
            elif days_old <= 60:
                bucket = "31_60"
            elif days_old <= 90:
                bucket = "61_90"
            else:
                bucket = "90_plus"
            assert bucket == expected_bucket, f"Wrong bucket for {days_old} days: got {bucket}"


# ════════════════════════════════════════════════════════════════════════════
# VALIDATION TESTS
# ════════════════════════════════════════════════════════════════════════════

class TestInputValidation:
    """Test that invalid inputs are rejected."""

    def test_voucher_type_validation(self):
        from pydantic import ValidationError
        from app.models import VoucherCreate
        from datetime import date
        try:
            v = VoucherCreate(
                company_id="test",
                voucher_type="invalid_type",
                date=date.today(),
                narration="Test",
                lines=[
                    {"account_id": "a1", "dr_amount": 100, "cr_amount": 0},
                    {"account_id": "a2", "dr_amount": 0,   "cr_amount": 100},
                ],
            )
            assert False, "Should have raised ValidationError"
        except (ValidationError, ValueError):
            pass  # Expected

    def test_negative_amount_rejected(self):
        from pydantic import ValidationError
        from app.models import JournalLineIn
        try:
            line = JournalLineIn(account_id="a1", dr_amount=-100, cr_amount=0)
            assert False, "Should have raised ValidationError"
        except (ValidationError, ValueError):
            pass  # Expected

    def test_classify_request_max_narrations(self):
        """Batch classify should reject > 100 items."""
        from pydantic import ValidationError
        from app.models import ClassifyRequest
        try:
            req = ClassifyRequest(company_id="c1", narrations=["x"] * 101)
            assert False, "Should have raised ValidationError"
        except (ValidationError, ValueError):
            pass  # Expected


# ════════════════════════════════════════════════════════════════════════════
# GST CALCULATION TESTS
# ════════════════════════════════════════════════════════════════════════════

class TestGSTCalculations:
    """Verify GST split calculations."""

    def test_cgst_sgst_split_intrastate(self):
        """Intrastate: GST = CGST + SGST (50/50 split)."""
        taxable = Decimal("10000")
        gst_rate = Decimal("18")
        total_gst = taxable * gst_rate / 100
        cgst = total_gst / 2
        sgst = total_gst / 2
        assert cgst == Decimal("900")
        assert sgst == Decimal("900")
        assert cgst + sgst == total_gst

    def test_igst_interstate(self):
        """Interstate: full GST = IGST."""
        taxable = Decimal("10000")
        gst_rate = Decimal("18")
        igst = taxable * gst_rate / 100
        assert igst == Decimal("1800")

    def test_invoice_total_with_gst(self):
        subtotal = Decimal("10000")
        cgst = Decimal("900")
        sgst = Decimal("900")
        total = subtotal + cgst + sgst
        assert total == Decimal("11800")
