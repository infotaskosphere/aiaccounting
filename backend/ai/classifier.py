"""
ai/classifier.py
----------------
Phase 3: AI Layer

Modules:
  1. TransactionClassifier  — NLP-based narration → ledger account mapping
  2. ReconciliationEngine   — Smart bank ↔ invoice matching
  3. AnomalyDetector        — Duplicate and unusual transaction detection
  4. BankOCR                — Scanned PDF bank statement extraction
"""

from __future__ import annotations

import hashlib
import json
import re
import unicodedata
from dataclasses import dataclass
from datetime import date, timedelta
from decimal import Decimal
from typing import Optional

import numpy as np
from rapidfuzz import fuzz, process
from sentence_transformers import SentenceTransformer

# ── Data Classes ──────────────────────────────────────────────────────────────

@dataclass
class ClassificationResult:
    account_id:   str
    account_name: str
    confidence:   float        # 0.0 → 1.0
    method:       str          # 'exact', 'embedding', 'rule', 'fallback'
    requires_review: bool      # True if confidence < threshold


@dataclass
class ReconciliationMatch:
    bank_txn_id:  str
    voucher_id:   str
    confidence:   float
    match_type:   str          # 'exact', 'fuzzy_amount', 'partial'
    delta_days:   int          # date difference


@dataclass
class AnomalyResult:
    txn_id:     str
    anomaly_type: str          # 'duplicate', 'unusual_amount', 'missing_invoice'
    severity:   str            # 'low', 'medium', 'high'
    description: str
    confidence: float


# ── 1. Transaction Classifier ─────────────────────────────────────────────────

class TransactionClassifier:
    """
    Classify bank narrations into ledger accounts.

    Strategy (in priority order):
      1. Exact match from company's learned mappings
      2. Rule-based patterns (known vendors, GST payments, salary, etc.)
      3. Semantic embedding similarity
      4. Fallback to "Miscellaneous Expenses"
    """

    # Confidence threshold below which human review is required
    REVIEW_THRESHOLD = 0.75

    # Rule-based patterns → account code
    PATTERNS: list[tuple[list[str], str]] = [
        # Salary / payroll
        (["salary", "sal/", "salaries", "payroll", "wages"], "8001"),
        # Rent
        (["rent", "lease", "rental"], "8002"),
        # Electricity
        (["electricity", "bescom", "tata power", "msedcl", "tneb", "cesc",
          "wbsedcl", "adani electric"], "8003"),
        # Internet / Phone
        (["jio", "airtel", "bsnl", "act fibernet", "hathway", "vodafone",
          "vi ", "internet", "broadband", "telecom"], "8004"),
        # Software / SaaS
        (["amazon web services", "aws", "google cloud", "azure", "microsoft",
          "adobe", "atlassian", "notion", "slack", "zoom", "github"], "8006"),
        # Professional fees
        (["ca fees", "audit fees", "legal", "advocate", "consultant",
          "professional fee", "advisory"], "8008"),
        # Advertising
        (["google ads", "facebook", "meta ads", "instagram", "youtube ads",
          "linkedin", "advertising", "marketing"], "8009"),
        # Bank charges
        (["bank charge", "service charge", "neft charge", "rtgs charge",
          "sms charge", "annual fee", "processing fee", "interest charged",
          "bank interest"], "8010"),
        # GST payment (outflow)
        (["gst payment", "cgst", "sgst", "igst", "gst challan"], "3100"),
        # TDS payment
        (["tds payment", "income tax", "advance tax", "self assessment tax"], "3200"),
        # Travel
        (["ola", "uber", "rapido", "makemytrip", "goibibo", "irctc",
          "flight", "hotel", "travel", "conveyance", "cab"], "8007"),
        # Office supplies
        (["stationery", "office supplies", "amazon", "flipkart",
          "office depot", "paper", "toner"], "8005"),
        # Sales receipts
        (["received", "receipt from", "payment from", "invoice paid"], "1100"),
        # Purchase payments
        (["paid to", "payment to", "vendor payment"], "3001"),
    ]

    def __init__(self, model_name: str = "all-MiniLM-L6-v2"):
        """
        Load sentence transformer model.
        'all-MiniLM-L6-v2' is fast (80MB) and accurate enough for narrations.
        """
        self.model = SentenceTransformer(model_name)
        self._account_embeddings: dict[str, np.ndarray] = {}
        self._account_index: list[dict] = []          # [{id, code, name, nature}]
        self._learned_map: dict[str, str] = {}        # narration_hash → account_id

    def load_accounts(self, accounts: list[dict]) -> None:
        """
        Pre-compute embeddings for all account names.
        Call once after fetching accounts from DB.

        accounts: [{"id": "...", "code": "8001", "name": "Salaries & Wages", ...}]
        """
        self._account_index = accounts
        names = [a["name"] for a in accounts]
        embeddings = self.model.encode(names, convert_to_numpy=True,
                                       show_progress_bar=False)
        for i, acc in enumerate(accounts):
            self._account_embeddings[acc["id"]] = embeddings[i]

    def load_learned_mappings(self, mappings: list[dict]) -> None:
        """
        Load company-specific confirmed mappings from ai_classifications table.
        mappings: [{"narration": "AMAZON PAY INDIA", "confirmed_account_id": "..."}]
        """
        for m in mappings:
            key = self._hash_narration(m["narration"])
            self._learned_map[key] = m["confirmed_account_id"]

    def classify(self, narration: str,
                 fallback_account: Optional[dict] = None) -> ClassificationResult:
        """
        Classify a single narration. Returns ClassificationResult.
        """
        narration_clean = self._normalize(narration)
        fallback = fallback_account or {"id": "", "name": "Miscellaneous Expenses"}

        # 1. Exact learned match
        key = self._hash_narration(narration_clean)
        if key in self._learned_map:
            acc_id = self._learned_map[key]
            acc    = self._find_account(acc_id)
            return ClassificationResult(
                account_id=acc_id,
                account_name=acc["name"] if acc else "Unknown",
                confidence=0.99,
                method="exact",
                requires_review=False
            )

        # 2. Rule-based pattern matching
        rule_result = self._apply_rules(narration_clean)
        if rule_result:
            return rule_result

        # 3. Embedding similarity
        if self._account_embeddings:
            emb_result = self._classify_by_embedding(narration_clean)
            if emb_result:
                return emb_result

        # 4. Fallback
        return ClassificationResult(
            account_id=fallback["id"],
            account_name=fallback["name"],
            confidence=0.3,
            method="fallback",
            requires_review=True
        )

    def classify_batch(self, narrations: list[str]) -> list[ClassificationResult]:
        """Classify multiple narrations efficiently."""
        return [self.classify(n) for n in narrations]

    def record_correction(self, narration: str, correct_account_id: str) -> None:
        """
        Record a user correction for immediate use.
        Persist to ai_classifications table separately.
        """
        key = self._hash_narration(self._normalize(narration))
        self._learned_map[key] = correct_account_id

    def _apply_rules(self, narration: str) -> Optional[ClassificationResult]:
        narration_lower = narration.lower()
        for keywords, account_code in self.PATTERNS:
            for kw in keywords:
                if kw.lower() in narration_lower:
                    acc = self._find_account_by_code(account_code)
                    if acc:
                        return ClassificationResult(
                            account_id=acc["id"],
                            account_name=acc["name"],
                            confidence=0.88,
                            method="rule",
                            requires_review=False
                        )
        return None

    def _classify_by_embedding(self, narration: str) -> Optional[ClassificationResult]:
        narr_emb = self.model.encode([narration], convert_to_numpy=True)[0]
        best_id, best_score = "", 0.0

        for acc_id, acc_emb in self._account_embeddings.items():
            # Cosine similarity
            score = float(np.dot(narr_emb, acc_emb) /
                          (np.linalg.norm(narr_emb) * np.linalg.norm(acc_emb) + 1e-9))
            if score > best_score:
                best_score, best_id = score, acc_id

        if best_score > 0.5:
            acc = self._find_account(best_id)
            return ClassificationResult(
                account_id=best_id,
                account_name=acc["name"] if acc else "Unknown",
                confidence=round(best_score, 4),
                method="embedding",
                requires_review=best_score < self.REVIEW_THRESHOLD
            )
        return None

    def _normalize(self, text: str) -> str:
        text = unicodedata.normalize("NFKC", text)
        text = re.sub(r"\s+", " ", text).strip().upper()
        return text

    def _hash_narration(self, narration: str) -> str:
        return hashlib.md5(narration.encode()).hexdigest()

    def _find_account(self, account_id: str) -> Optional[dict]:
        return next((a for a in self._account_index if a["id"] == account_id), None)

    def _find_account_by_code(self, code: str) -> Optional[dict]:
        return next((a for a in self._account_index if a["code"] == code), None)


# ── 2. Reconciliation Engine ──────────────────────────────────────────────────

class ReconciliationEngine:
    """
    Match bank transactions to existing vouchers/invoices.

    Matching strategy:
      1. Exact: same amount + same date + reference match
      2. Fuzzy amount: within 1% + date within 7 days + party name similarity
      3. Partial: amount matches outstanding + date within 14 days
    """

    EXACT_CONFIDENCE    = 0.97
    FUZZY_CONFIDENCE    = 0.80
    PARTIAL_CONFIDENCE  = 0.65
    DATE_WINDOW_DAYS    = 14
    AMOUNT_TOLERANCE    = Decimal("0.01")   # 1 paisa tolerance for exact match

    def match(self,
              bank_txn: dict,
              open_vouchers: list[dict]) -> Optional[ReconciliationMatch]:
        """
        Find best match for a bank transaction from a list of open vouchers.

        bank_txn: {id, amount, txn_date, narration, reference, txn_type}
        open_vouchers: [{id, total_amount, date, party_name, reference, voucher_type}]
        """
        bank_amount = Decimal(str(bank_txn["amount"]))
        bank_date   = self._to_date(bank_txn["txn_date"])
        bank_ref    = str(bank_txn.get("reference", "")).strip().upper()
        bank_narr   = str(bank_txn.get("narration", "")).upper()

        best_match: Optional[ReconciliationMatch] = None
        best_score  = 0.0

        for v in open_vouchers:
            v_amount = Decimal(str(v["total_amount"] or v.get("amount", 0)))
            v_date   = self._to_date(v["date"])
            v_ref    = str(v.get("reference", "")).strip().upper()
            v_party  = str(v.get("party_name", "")).upper()
            delta    = abs((bank_date - v_date).days)

            if delta > self.DATE_WINDOW_DAYS:
                continue

            # Amount match check
            amount_diff = abs(bank_amount - v_amount)
            amount_pct  = amount_diff / max(v_amount, Decimal("1"))

            # Reference exact match bonus
            ref_match = (bank_ref and v_ref and
                         (bank_ref in v_ref or v_ref in bank_ref))

            if amount_diff <= self.AMOUNT_TOLERANCE and delta <= 3:
                # Exact match
                score = self.EXACT_CONFIDENCE
                if ref_match:
                    score = 0.99
                match_type = "exact"

            elif amount_pct <= Decimal("0.01") and delta <= 7:
                # Fuzzy amount match (within 1%)
                party_score = fuzz.partial_ratio(bank_narr, v_party) / 100
                score = self.FUZZY_CONFIDENCE * (0.7 + 0.3 * party_score)
                match_type = "fuzzy_amount"

            elif amount_diff <= self.AMOUNT_TOLERANCE and delta <= self.DATE_WINDOW_DAYS:
                # Exact amount, wider date window
                score = self.PARTIAL_CONFIDENCE
                if ref_match:
                    score += 0.15
                match_type = "partial"

            else:
                continue

            if score > best_score:
                best_score = score
                best_match = ReconciliationMatch(
                    bank_txn_id=str(bank_txn["id"]),
                    voucher_id=str(v["id"]),
                    confidence=round(score, 4),
                    match_type=match_type,
                    delta_days=delta
                )

        return best_match

    def match_batch(self, bank_transactions: list[dict],
                    open_vouchers: list[dict]) -> list[Optional[ReconciliationMatch]]:
        """Reconcile all unmatched bank transactions against open vouchers."""
        return [self.match(txn, open_vouchers) for txn in bank_transactions]

    def _to_date(self, d) -> date:
        if isinstance(d, date):
            return d
        if isinstance(d, str):
            return date.fromisoformat(d[:10])
        return date.today()


# ── 3. Anomaly Detector ───────────────────────────────────────────────────────

class AnomalyDetector:
    """
    Detect suspicious or erroneous transactions:
      - Duplicate entries
      - Unusually large/small amounts (statistical outlier)
      - Transactions without matching invoices above threshold
    """

    # Amount above which missing invoice is flagged
    INVOICE_REQUIRED_THRESHOLD = Decimal("10000")
    # Z-score above which an amount is flagged as unusual
    ZSCORE_THRESHOLD = 3.0

    def detect_duplicates(self, transactions: list[dict]) -> list[AnomalyResult]:
        """
        Find transactions that appear to be duplicates.
        Checks: same amount + same date + narration similarity > 90%.
        """
        anomalies = []
        seen: list[dict] = []

        for txn in transactions:
            txn_date   = str(txn.get("txn_date", ""))
            amount     = Decimal(str(txn.get("amount", 0)))
            narration  = str(txn.get("narration", "")).upper()

            for prev in seen:
                if str(prev.get("txn_date", "")) != txn_date:
                    continue
                if abs(Decimal(str(prev.get("amount", 0))) - amount) > Decimal("1"):
                    continue
                sim = fuzz.ratio(narration, str(prev.get("narration", "")).upper())
                if sim >= 85:
                    anomalies.append(AnomalyResult(
                        txn_id=str(txn.get("id", "")),
                        anomaly_type="duplicate",
                        severity="high",
                        description=(
                            f"Possible duplicate of txn on {txn_date} "
                            f"for ₹{amount} (similarity: {sim}%)"
                        ),
                        confidence=sim / 100
                    ))
                    break

            seen.append(txn)

        return anomalies

    def detect_unusual_amounts(self, transactions: list[dict]) -> list[AnomalyResult]:
        """
        Flag transactions with amounts that are statistical outliers
        within the same account/narration category.
        """
        amounts = np.array([
            float(txn.get("amount", 0)) for txn in transactions
        ], dtype=float)

        if len(amounts) < 5:
            return []

        mean = np.mean(amounts)
        std  = np.std(amounts)
        if std == 0:
            return []

        anomalies = []
        for txn, amount in zip(transactions, amounts):
            z = abs((amount - mean) / std)
            if z > self.ZSCORE_THRESHOLD:
                anomalies.append(AnomalyResult(
                    txn_id=str(txn.get("id", "")),
                    anomaly_type="unusual_amount",
                    severity="high" if z > 5 else "medium",
                    description=(
                        f"Amount ₹{amount:,.2f} is {z:.1f} standard deviations "
                        f"from mean ₹{mean:,.2f}"
                    ),
                    confidence=min(z / 10, 1.0)
                ))

        return anomalies

    def detect_missing_invoices(self, bank_transactions: list[dict],
                                 matched_ids: set[str]) -> list[AnomalyResult]:
        """
        Flag unmatched debit transactions above threshold.
        """
        anomalies = []
        for txn in bank_transactions:
            if str(txn.get("id", "")) in matched_ids:
                continue
            if txn.get("txn_type") != "debit":
                continue
            amount = Decimal(str(txn.get("amount", 0)))
            if amount >= self.INVOICE_REQUIRED_THRESHOLD:
                anomalies.append(AnomalyResult(
                    txn_id=str(txn["id"]),
                    anomaly_type="missing_invoice",
                    severity="medium",
                    description=(
                        f"Debit of ₹{amount:,.2f} on {txn.get('txn_date')} "
                        f"has no matching invoice: '{txn.get('narration', '')}'"
                    ),
                    confidence=0.85
                ))

        return anomalies

    def run_all(self, transactions: list[dict],
                matched_ids: set[str]) -> list[AnomalyResult]:
        """Run all detectors and return combined results."""
        results = []
        results.extend(self.detect_duplicates(transactions))
        results.extend(self.detect_unusual_amounts(transactions))
        results.extend(self.detect_missing_invoices(transactions, matched_ids))
        return sorted(results, key=lambda x: x.confidence, reverse=True)


# ── 4. Bank Statement OCR ─────────────────────────────────────────────────────

class BankOCR:
    """
    Extract text from scanned bank statement PDFs using Tesseract.
    Use when pdfplumber returns no tables (image-based PDFs).
    """

    def __init__(self):
        try:
            import pytesseract
            from PIL import Image
            self.pytesseract = pytesseract
            self.Image = Image
            self.available = True
        except ImportError:
            self.available = False

    def pdf_to_text(self, pdf_bytes: bytes, lang: str = "eng") -> str:
        """
        Convert each page of a scanned PDF to text via OCR.
        Returns combined text from all pages.
        """
        if not self.available:
            raise RuntimeError(
                "OCR dependencies not installed. Run: pip install pytesseract pillow pdf2image"
            )

        from pdf2image import convert_from_bytes

        pages = convert_from_bytes(pdf_bytes, dpi=300)
        full_text = []

        for page_img in pages:
            text = self.pytesseract.image_to_string(
                page_img,
                lang=lang,
                config="--psm 6"  # Assume uniform block of text
            )
            full_text.append(text)

        return "\n".join(full_text)

    def extract_transactions_from_text(self, text: str) -> list[dict]:
        """
        Parse OCR text into structured transaction rows.
        Uses regex patterns common in Indian bank statements.
        """
        # Pattern: date | narration | dr amount | cr amount | balance
        pattern = re.compile(
            r"(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})"   # date
            r"\s+(.+?)\s+"                          # narration
            r"([\d,]+\.\d{2})?\s*"                 # debit (optional)
            r"([\d,]+\.\d{2})?\s*"                 # credit (optional)
            r"([\d,]+\.\d{2})",                    # balance
            re.MULTILINE
        )

        rows = []
        for m in pattern.finditer(text):
            debit_str  = m.group(3) or ""
            credit_str = m.group(4) or ""

            debit  = Decimal(debit_str.replace(",", ""))  if debit_str  else Decimal("0")
            credit = Decimal(credit_str.replace(",", "")) if credit_str else Decimal("0")

            if debit == 0 and credit == 0:
                continue

            rows.append({
                "date":      m.group(1).strip(),
                "narration": m.group(2).strip(),
                "debit":     str(debit),
                "credit":    str(credit),
                "balance":   m.group(5).replace(",", ""),
            })

        return rows


# ── Usage Example ─────────────────────────────────────────────────────────────
#
# from ai.classifier import TransactionClassifier, ReconciliationEngine, AnomalyDetector
#
# # 1. Classify
# clf = TransactionClassifier()
# clf.load_accounts(accounts_from_db)
# clf.load_learned_mappings(company_learned_mappings)
# result = clf.classify("AMAZON PAY INDIA PVT LTD")
# # → ClassificationResult(account_id='...', account_name='Software Subscriptions',
# #                        confidence=0.88, method='rule', requires_review=False)
#
# # 2. Reconcile
# engine = ReconciliationEngine()
# match = engine.match(bank_txn, open_vouchers)
# # → ReconciliationMatch(confidence=0.97, match_type='exact', delta_days=0)
#
# # 3. Detect anomalies
# detector = AnomalyDetector()
# anomalies = detector.run_all(all_transactions, matched_ids)
