# Metric Certification Log: SpecialtyPulse

**Companion to:** `docs/PRD.md` Section 3 (Metric Disambiguation)
**Owner:** Kristen Martino (BI Analyst)
**Approver:** RevOps VP
**Last updated:** March 2026

---

## Purpose

This log records every metric certification decision — including competing definitions that were considered and the rationale for the chosen definition. It serves three purposes:

1. **Prevent relitigating settled decisions.** When someone asks "why don't we use the simple average?" the answer is documented here with the reasoning and the approver.
2. **Provide transparency.** Any stakeholder can see how their preferred calculation was evaluated and why a different one was certified.
3. **Support audit and change control.** Every change to a certified metric requires a new entry in this log.

---

## Log Format

Each entry documents:
- **Metric name** — as it appears in the data contract (`cms_schema.py`)
- **Certified definition** — the formula used in the mart and dashboard
- **Competing definitions** — alternative calculations that were considered
- **Resolution rationale** — why the certified version was chosen
- **Impact of choosing wrong** — what goes wrong if the other definition is used
- **Availability of alternatives** — how non-certified calculations are still accessible
- **Certified date** — when the decision was made
- **Approved by** — who signed off

---

## Certified Metrics

### 1. avg_medicare_payment

| Field | Value |
|---|---|
| **Certified definition** | Volume-weighted average: `SUM(avg_medicare_payment × total_services) / SUM(total_services)` at specialty × hcpcs × year grain |
| **Data contract column** | `avg_medicare_payment` in mart |
| **Certified date** | 2024-01-15 |
| **Approved by** | RevOps VP |

**Competing definitions considered:**

| Alternative | Formula | Proposed by | Evaluation |
|---|---|---|---|
| Simple average | `AVG(avg_medicare_payment)` across providers | Product team | Gives equal weight to a provider billing 10 services and one billing 10,000. A single low-volume provider with an unusual payment rate skews the entire specialty average. Example: for Dermatology, simple avg = $85, weighted avg = $112. The $27 gap is entirely driven by low-volume outliers. |
| Standardized average | `AVG(avg_medicare_standardized_amount)` — CMS wage-index adjusted | Market analysis team | Removes geographic variation, which is useful for cross-state comparison but doesn't represent what providers actually receive. A Florida practice doesn't experience the "standardized" payment — they experience the actual payment. |
| Median payment | `MEDIAN(avg_medicare_payment)` across providers | Finance (for board reporting) | Resistant to outliers, but loses information about the distribution shape. Also not directly computable in Domo SQL DataFlows without workarounds. |

**Resolution rationale:** The volume-weighted average reflects actual economic flows — a high-volume provider contributes proportionally more to the specialty's total payment picture. This matches CMS's own methodology for reporting aggregate payment statistics. When the RevOps VP presents to the board, the numbers should match what CMS publishes, not a different calculation that requires explanation.

**Impact of choosing wrong:** If the simple average is used for the Pressure Index, low-volume specialties with a few high-payment outlier providers would appear less compressed than they actually are. Sales teams would deprioritize specialties where the majority of providers are experiencing significant compression — leading to missed opportunities.

**Availability of alternatives:** The simple average is available as a Beast Mode (`simple_avg_payment`) on the Metric Comparison card (Page 2, Card 2.4), labeled "Simple Avg (Reference — not certified)." The standardized amount is available on the same card, labeled "Standardized (Geo-Adjusted)." Both are clearly distinguished from the certified metric.

---

### 2. payment_to_charge_ratio

| Field | Value |
|---|---|
| **Certified definition** | `avg_medicare_payment / avg_submitted_charge` at aggregate grain (specialty × hcpcs × year), null when charge = 0 |
| **Data contract column** | `payment_to_charge_ratio` in mart |
| **Certified date** | 2024-01-15 |
| **Approved by** | RevOps VP |

**Competing definitions considered:**

| Alternative | Formula | Proposed by | Evaluation |
|---|---|---|---|
| Provider-grain ratio then averaged | `AVG(provider_payment / provider_charge)` across providers | Specialty analysts | Produces a different result because averaging ratios is not the same as the ratio of averages. A provider with a $10 payment / $20 charge (ratio 0.50) and a provider with $1000 payment / $1500 charge (ratio 0.67) would average to 0.585. But the aggregate ratio is $1010 / $1520 = 0.664. The provider-grain approach overweights the low-volume provider's ratio. |
| Allowed amount ratio | `avg_medicare_allowed_amount / avg_submitted_charge` | Finance | Uses allowed amount instead of payment. The difference is that payment = what CMS actually paid, while allowed = what CMS approved (before deductible and coinsurance). For market analysis, payment is more relevant because it reflects what the provider's revenue cycle actually collects from Medicare. |

**Resolution rationale:** The aggregate-grain ratio is mathematically consistent with how CMS reports compression statistics. It also directly measures the question we're trying to answer: "for every dollar a practice charges, how many cents does Medicare pay?" The provider-grain approach answers a different question ("what's the average provider's experience?") which is useful but not what drives the Pressure Index.

**Impact of choosing wrong:** Using the provider-grain ratio masks procedure-level compression patterns. A specialty could appear to have moderate compression on average while a small number of high-volume procedures are severely compressed — and those procedures are the ones that matter most to the practice's revenue.

**Availability of alternatives:** Provider-grain ratio is not pre-computed in the mart (it would require a different aggregation). If a specialty analyst needs it for research, they can request it as an ad hoc query. The allowed-amount ratio is not separately surfaced but the underlying column (`avg_medicare_allowed_amount`) is in the mart.

---

### 3. yoy_volume_change_pct / yoy_payment_change_pct

| Field | Value |
|---|---|
| **Certified definition** | `(current - prior) / prior` — percentage change, null for base year (2021) and non-consecutive years |
| **Data contract column** | `yoy_volume_change_pct`, `yoy_payment_change_pct` in mart |
| **Certified date** | 2024-01-15 |
| **Approved by** | RevOps VP |

**Competing definitions considered:**

| Alternative | Formula | Proposed by | Evaluation |
|---|---|---|---|
| Absolute change | `current - prior` | Sales team | Intuitive but not normalizable. A $4 increase on a $50 procedure is very different from $4 on a $500 procedure. Sales reps prefer this because it's easy to explain to prospects ("your derm payments dropped $4 per service"). |
| Indexed change (base year = 100) | `(current / base_year_value) × 100` | Market analysis team | Useful for multi-year trend visualization where the starting point matters. But requires choosing a base year, which introduces bias (a year with an anomalous value distorts all subsequent years). |
| CAGR | `(end / start)^(1/n) - 1` | Finance | Smooths out year-to-year volatility. Useful for long-term planning but hides important year-to-year shifts. A specialty that dropped 10% then recovered 8% shows a small CAGR decline, masking the dramatic mid-period drop. |

**Resolution rationale:** Percentage change is the standard for normalized year-over-year comparison across specialties with different payment levels. The consecutive-year guard is critical — without it, a missing year (e.g., 2022 data not yet available) would cause the 2023 calculation to compare against 2021, producing a misleading 2-year delta labeled as 1-year.

**Impact of choosing wrong:** Using absolute change makes specialties with high payment levels (e.g., Orthopedic Surgery) always look like they have the largest changes, drowning out significant percentage shifts in lower-payment specialties like Podiatry. The Pressure Index would be biased toward surgical specialties regardless of actual compression dynamics.

**Availability of alternatives:** Absolute change is surfaced in the Pressure Index detail view (where a rep needs the dollar figure for a prospect conversation). Indexed change is available as a Beast Mode toggle on the trend chart (Page 1, Card 1.2). CAGR is not pre-computed — available on request for multi-year board presentations.

---

### 4. Reimbursement Pressure Index

| Field | Value |
|---|---|
| **Certified definition** | Composite: `0.30 × compression_score + 0.30 × trajectory_score + 0.25 × volume_score + 0.15 × market_size_score`, normalized 0-100 |
| **Data contract column** | `pressure_index` in specialty_benchmarks DataFlow output |
| **Certified date** | 2024-03-01 |
| **Approved by** | RevOps VP |

**Competing definitions considered:**

| Alternative | Formula | Proposed by | Evaluation |
|---|---|---|---|
| Compression only | Rank specialties by ptcr alone | Initial design | Ignores trajectory (is it getting worse?), volume (does the market size justify focus?), and provider count (can we actually sell to enough practices?). A specialty could be severely compressed but shrinking — not where you want to send reps. |
| Equal weights | 0.25 each across all four components | Thomas Danh (simplicity) | Mathematically simpler but doesn't reflect business reality. Compression level and trajectory are more important than raw market size — a shrinking but highly compressed specialty is still a better target than a large but stable one. |
| ML-based score | Logistic regression on historical deal outcomes | Data Science (future) | Better but requires labeled outcome data (which deals closed, in which specialties, with what market conditions). Not available in this project. The current formula is designed to be replaced by an ML model in Phase 3 (see PRD roadmap). |

**Resolution rationale:** The 0.30/0.30/0.25/0.15 weighting reflects three conversations with GTM stakeholders:
1. Compression level and trajectory are equally important — both current pain and worsening trends drive purchasing urgency
2. Volume growth matters almost as much — a growing specialty means more practices entering the market who need software
3. Market size is a qualifier, not a driver — provider count needs to be "big enough" but beyond that threshold, compression and trajectory matter more

The weights are configurable and should be reviewed quarterly. The DataFlow SQL includes comments marking each weight for easy adjustment.

**Impact of choosing wrong:** Over-weighting market size would always prioritize the largest specialties (Internal Medicine, Family Practice) which are not ModMed's core verticals. Under-weighting trajectory would miss emerging opportunities — a specialty just beginning to experience compression might be easier to sell to than one that's been compressed for years (where practices have already adapted or consolidated).

**Availability of alternatives:** The component scores are all visible in the Pressure Index detail view. A user can see that Dermatology ranks #1 overall but ranks #3 on market size — the ranking is driven by compression and trajectory, not size.

---

### 5. is_payment_outlier

| Field | Value |
|---|---|
| **Certified definition** | `True` when `payment_to_charge_ratio` is > 2 standard deviations below the specialty mean for that year |
| **Data contract column** | `is_payment_outlier` in mart |
| **Certified date** | 2024-01-15 |
| **Approved by** | RevOps VP |

**Competing definitions considered:**

| Alternative | Formula | Proposed by | Evaluation |
|---|---|---|---|
| Fixed threshold | `payment_to_charge_ratio < 0.40` | Specialty analysts | Simple but doesn't account for specialty-specific norms. A ptcr of 0.40 is anomalous for Dermatology (where the average is ~0.65) but normal for certain surgical specialties. |
| IQR method | Below Q1 − 1.5 × IQR | Data Science | More robust to skewed distributions than z-score. However, Domo SQL DataFlows don't natively support percentile calculations, making this impractical without a workaround. |
| Year-over-year drop | Procedure where ptcr dropped > 10% YoY | Thomas Danh | Captures deteriorating procedures, not just currently-low ones. Useful but different question — "what's getting worse" vs. "what's already anomalous." |

**Resolution rationale:** The 2-stddev threshold is a standard statistical approach, specialty-relative (so it respects different baselines), and computable in Domo SQL DataFlows using window functions. It identifies procedures that are genuinely unusual within their specialty context.

**Impact of choosing wrong:** A fixed threshold would flag dozens of procedures in surgical specialties that have legitimately low ptcr due to facility fee structures — creating noise that causes analysts to ignore the outlier flag entirely.

**Availability of alternatives:** The YoY drop metric is not a separate flag but could be added as a Beast Mode: "Deteriorating Procedure" when `yoy_payment_change_pct < -0.10`. This would complement (not replace) the outlier flag.

---

## Pending Certification Requests

| Metric | Requested by | Status | Notes |
|---|---|---|---|
| market_validated_pipeline | BI Analyst | Pending RevOps review | Weights pipeline amount by Pressure Index. Requires Salesforce data integration. |
| projected_next_year_ptcr | BI Analyst | Pending — labeled "Directional" until validated | Linear projection. Will be upgraded to statistical model in Phase 3. |

---

## Change History

| Date | Metric | Change | Rationale | Approved by |
|---|---|---|---|---|
| 2024-01-15 | All initial metrics | Initial certification | Baseline establishment | RevOps VP |
| 2024-03-01 | pressure_index | Added to certified metrics | GTM prioritization capability | RevOps VP |
| — | projected_next_year_ptcr | Pending | Awaiting validation period | — |
