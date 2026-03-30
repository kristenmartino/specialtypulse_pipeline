# Dashboard Specification: SpecialtyPulse

**Companion to:** `docs/PRD.md`
**Builder:** Kristen Martino
**Domo instance:** [your-instance].domo.com
**Last updated:** March 2026

---

## Data Sources

### Input DataSets

| Alias | Name | Source | Grain | Rows (est.) |
|---|---|---|---|---|
| mart | specialtypulse_mart_reimbursement_trends | Pipeline notebook 04 → Domo API push | specialty × hcpcs × year | ~50k-200k |
| pipeline | specialtypulse_sfdc_pipeline | CSV upload (`data/sample_sfdc_pipeline.csv`) | opportunity | ~500 |
| engagement | specialtypulse_dashboard_engagement | CSV upload (`data/sample_dashboard_engagement.csv`) | user × page × date | ~200 |
| pdp_config | specialtypulse_pdp_config | CSV upload (`domo/pdp/pdp_config.csv`) | user | 13 |
| verify | specialtypulse_pdp_verify_results | `pdp_verify_writer.py` output | check | 6 |

### DataFlows

| Name | Input(s) | Output | Purpose |
|---|---|---|---|
| specialtypulse_specialty_benchmarks | mart | specialtypulse_specialty_benchmarks | Aggregates to specialty × year, adds diagnostics, projections, Pressure Index |
| specialtypulse_pipeline_intelligence | mart output + pipeline | specialtypulse_pipeline_market_joined | Joins market intelligence to SFDC pipeline |

---

## DataFlow 1: Specialty Benchmarks (Revised)

Source SQL: `domo/sql_dataflow.sql`

This DataFlow produces the primary analytical dataset powering Pages 1 and 2 of the dashboard. It implements all four maturity pillars.

### Output columns

**Descriptive (carried from mart aggregation):**

| Column | Type | Definition |
|---|---|---|
| provider_specialty | STRING | ModMed specialty name |
| year | LONG | Service year |
| total_services | LONG | Sum of Medicare-allowed services |
| total_beneficiaries | LONG | Sum of unique beneficiaries |
| total_providers | LONG | Count of distinct NPIs |
| distinct_procedures | LONG | Count of distinct HCPCS codes |
| specialty_avg_payment | DECIMAL | Volume-weighted avg Medicare payment (CERTIFIED) |
| specialty_avg_charge | DECIMAL | Volume-weighted avg submitted charge |
| avg_ptcr | DECIMAL | Avg payment-to-charge ratio |
| avg_pct_facility | DECIMAL | Avg % of services in facility setting |

**Diagnostic (new):**

| Column | Type | Definition |
|---|---|---|
| prior_year_avg_payment | DECIMAL | Previous year's volume-weighted payment |
| prior_year_avg_charge | DECIMAL | Previous year's volume-weighted charge |
| payment_yoy_change | DECIMAL | Current - prior year payment |
| charge_yoy_change | DECIMAL | Current - prior year charge |
| compression_driver | STRING | "Payment Decline" / "Charge Inflation" / "Both" / "Improving" / "Stable" |
| outlier_procedure_count | LONG | Count of procedures flagged as payment outliers |
| min_ptcr | DECIMAL | Lowest payment-to-charge ratio in specialty |
| max_ptcr | DECIMAL | Highest payment-to-charge ratio in specialty |

**Predictive (new):**

| Column | Type | Definition |
|---|---|---|
| avg_yoy_ptcr_change | DECIMAL | Average annual change in ptcr over available years |
| ptcr_trend_variance | DECIMAL | Variance of annual ptcr changes (trend stability) |
| projected_next_year_ptcr | DECIMAL | Current ptcr + avg_yoy_ptcr_change |
| projected_next_year_services | LONG | Current services × (1 + avg_yoy_volume_change) |
| projection_confidence | STRING | "High" (variance < 0.001) / "Directional" (otherwise) |
| is_projected | BOOLEAN | Always false in this row — used when projected rows are appended |

**Prescriptive (new):**

| Column | Type | Definition |
|---|---|---|
| compression_score | DECIMAL | Normalized 0-100 score from ptcr (lower ptcr = higher score) |
| trajectory_score | DECIMAL | Normalized 0-100 score from ptcr trend (worsening = higher) |
| volume_score | DECIMAL | Normalized 0-100 score from volume growth rate |
| market_size_score | DECIMAL | Normalized 0-100 score from provider count |
| pressure_index | DECIMAL | Weighted composite: 0.30 × compression + 0.30 × trajectory + 0.25 × volume + 0.15 × market_size |
| pressure_tier | STRING | "Immediate Opportunity" (≥70) / "Emerging" (50-69) / "Monitor" (30-49) / "Low Priority" (<30) |

---

## DataFlow 2: Pipeline Intelligence

Joins market intelligence to the synthetic Salesforce extract.

### Join logic

```
LEFT JOIN specialtypulse_sfdc_pipeline p
ON benchmarks.provider_specialty = p.account_specialty
AND benchmarks.year = (SELECT MAX(year) FROM benchmarks)
```

Only the most recent year's market data joins to pipeline — we're enriching current opportunities with current market signals.

### Output columns (in addition to pipeline fields)

| Column | Type | Definition |
|---|---|---|
| pressure_index | DECIMAL | From benchmarks — market pressure for this opportunity's specialty |
| pressure_tier | STRING | Tier label |
| market_validated_amount | DECIMAL | opportunity amount × (pressure_index / 100) — weights deal value by market urgency |
| specialty_avg_payment | DECIMAL | Market context for the deal's specialty |
| compression_driver | STRING | What's driving compression in this specialty |

---

## Beast Modes

### Existing (defined in sql_dataflow.sql)

| Name | Purpose |
|---|---|
| yoy_volume_label | Formats YoY % with ▲/▼/→ indicator |
| compression_category | Buckets ptcr into Low/Moderate/High/Severe |
| outlier_badge | Shows "⚠ Outlier" when flagged |
| vs_benchmark_label | Formats payment vs specialty avg as "+X% vs avg" |

### New

| Name | Formula logic | Purpose |
|---|---|---|
| compression_driver_label | Displays compression_driver with icon: 📉 Payment Decline, 📈 Charge Inflation, ⚠ Both, ✅ Improving | Visual diagnostic indicator |
| pressure_tier_label | Displays pressure_tier with color context: 🔴 Immediate, 🟡 Emerging, 🔵 Monitor, ⚪ Low Priority | Prescriptive tier visualization |
| projection_label | "Projected (High Confidence)" or "Projected (Directional Estimate)" based on projection_confidence | Ensures forecast values are always labeled |
| metric_calc_label | "Volume-Weighted (Certified)" / "Standardized (Geo-Adjusted)" / "Simple Avg (Reference)" based on which column is displayed | Metric disambiguation — always visible |
| pipeline_priority_label | CASE on market_validated_amount tiers: "High Priority Deal", "Standard", "Below Threshold" | Prescriptive deal-level signal |

---

## Dashboard Pages

### Page 1: Market Intelligence

**Audience:** David Draddy, Regional Sales Managers, Thomas Danh
**Purpose:** Where should we focus? Answers the Monday morning question.
**Maturity pillars:** All four — this page IS the maturity ladder in action.

#### Card 1.1 — Reimbursement Pressure Index (ANCHOR CARD)

| Attribute | Value |
|---|---|
| Chart type | Table with conditional formatting |
| DataSet | specialtypulse_specialty_benchmarks |
| Filter | Most recent year, ModMed specialties only |
| Columns displayed | provider_specialty, pressure_tier (color-coded), pressure_index, specialty_avg_payment (labeled "Certified: Vol-Weighted"), avg_ptcr, compression_driver, projected_next_year_ptcr, total_providers |
| Sort | pressure_index descending |
| Pillar | **Prescriptive** |
| Question answered | Which specialties should the sales team prioritize this quarter? |

This is the first thing David sees. A ranked list of ModMed's specialties with a clear tier label and the supporting evidence. No chart interpretation needed — the table says "Dermatology: Immediate Opportunity" and provides the why.

#### Card 1.2 — Compression Trend with Forecast

| Attribute | Value |
|---|---|
| Chart type | Line chart |
| DataSet | specialtypulse_specialty_benchmarks |
| X axis | year |
| Y axis | avg_ptcr |
| Series | Top 5 ModMed specialties by pressure_index |
| Forecast | Domo forecast line enabled (1 year ahead) |
| Additional | DataFlow projected values shown as dashed line extension with `projection_label` Beast Mode in tooltip |
| Pillar | **Descriptive** + **Predictive** |
| Question answered | Is compression getting worse, and where is it heading? |

#### Card 1.3 — Compression Drivers by Specialty

| Attribute | Value |
|---|---|
| Chart type | Stacked horizontal bar |
| DataSet | specialtypulse_specialty_benchmarks |
| Y axis | provider_specialty (sorted by pressure_index) |
| X axis | Segmented by compression_driver |
| Color | Payment Decline = red, Charge Inflation = amber, Both = dark red, Improving = green, Stable = gray |
| Pillar | **Diagnostic** |
| Question answered | WHY is compression happening? Is it payment cuts or charge increases? |

#### Card 1.4 — Volume Growth vs. Compression Change

| Attribute | Value |
|---|---|
| Chart type | Scatter plot |
| DataSet | specialtypulse_specialty_benchmarks |
| X axis | avg_yoy_volume_change (volume growth) |
| Y axis | avg_yoy_ptcr_change (compression change, inverted — down = worsening) |
| Bubble size | total_providers (market size) |
| Labels | provider_specialty |
| Quadrant labels | Top-right: "Growing & Improving" / Bottom-right: "Growing & Compressing — PRIORITY TARGET" / Top-left: "Shrinking & Improving" / Bottom-left: "Shrinking & Compressing" |
| Pillar | **Diagnostic** + **Prescriptive** |
| Question answered | Which specialties are growing but getting squeezed? (Most likely to invest in RCM) |

The bottom-right quadrant is where a specialty has increasing patient volume but declining reimbursement per service. These practices are working harder for less money — exactly the profile that needs better revenue cycle management software.

#### Card 1.5 — Territory Pressure Map

| Attribute | Value |
|---|---|
| Chart type | US state map (choropleth) |
| DataSet | mart (state-level data, or benchmarks joined back to mart for state grain) |
| Color | pressure_index gradient (green → yellow → red) |
| Filter | Specialty selector (filter to single ModMed specialty) |
| Interaction | Click state → filter Page 2 to that state's procedures |
| Pillar | **Descriptive** + **Prescriptive** |
| Question answered | Where is the pressure concentrated geographically? |

For a regional sales manager filtered by PDP to their states, this shows exactly where in their territory the urgency is highest.

---

### Page 2: Procedure Detail

**Audience:** Specialty Analysts, Thomas Danh
**Purpose:** Diagnostic deep-dive within a specialty.
**Maturity pillars:** Diagnostic primarily, with descriptive foundation.

#### Card 2.1 — Outlier Procedures

| Attribute | Value |
|---|---|
| Chart type | Table |
| DataSet | mart (procedure-level) |
| Filter | is_payment_outlier = true, filtered by specialty via Page filter |
| Columns | hcpcs_code, hcpcs_description, avg_medicare_payment (with metric_calc_label), payment_to_charge_ratio, payment_vs_specialty_pct, total_services |
| Sort | payment_vs_specialty_pct ascending (most compressed first) |
| Pillar | **Diagnostic** |
| Question answered | Which specific procedures are dragging this specialty's reimbursement down? |

#### Card 2.2 — Payment vs. Specialty Benchmark

| Attribute | Value |
|---|---|
| Chart type | Horizontal bar with reference line |
| DataSet | mart |
| Y axis | hcpcs_code (top 20 by volume in selected specialty) |
| X axis | avg_medicare_payment |
| Reference line | specialty_avg_payment |
| Color | Below benchmark = red, above = teal |
| Beast Mode | vs_benchmark_label shown in tooltip |
| Pillar | **Diagnostic** |
| Question answered | How does each procedure compare to the specialty average? |

#### Card 2.3 — Facility vs. Office Mix Trend

| Attribute | Value |
|---|---|
| Chart type | Area chart |
| DataSet | specialtypulse_specialty_benchmarks |
| X axis | year |
| Y axis | avg_pct_facility |
| Filter | Selected specialty |
| Pillar | **Diagnostic** |
| Question answered | Is care shifting from office to facility settings? (This affects reimbursement) |

#### Card 2.4 — Metric Comparison (Disambiguation Card)

| Attribute | Value |
|---|---|
| Chart type | Multi-line chart or grouped bar |
| DataSet | specialtypulse_specialty_benchmarks |
| Series | specialty_avg_payment (Vol-Weighted, Certified), specialty_avg_standardized (Standardized), simple_avg (Beast Mode) |
| Labels | Each series labeled with metric_calc_label Beast Mode |
| Subtitle | "Comparing calculation methods — see Metric Certification Log for rationale" |
| Pillar | **Diagnostic** |
| Question answered | How do the different calculation methods compare, and why do my numbers differ from another team's? |

This card is the living version of the metric disambiguation from the PRD. When a specialty analyst says "my number doesn't match Finance's," they can open this card and immediately see why.

---

### Page 3: Pipeline Intelligence

**Audience:** David Draddy, Regional Sales Managers
**Purpose:** Where market intelligence meets pipeline execution.
**Maturity pillars:** Prescriptive.

#### Card 3.1 — Pipeline by Specialty with Pressure Overlay

| Attribute | Value |
|---|---|
| Chart type | Combo chart (bar + line) |
| DataSet | specialtypulse_pipeline_market_joined |
| X axis | account_specialty |
| Bar (Y1) | SUM(amount) — open pipeline value |
| Line (Y2) | pressure_index |
| Sort | pressure_index descending |
| Pillar | **Prescriptive** |
| Question answered | Do we have pipeline where the market pressure is highest? |

If Dermatology has the highest pressure index but minimal pipeline, that's a gap. If Orthopedics has heavy pipeline but low pressure, those deals may be harder to close.

#### Card 3.2 — Market-Validated Pipeline

| Attribute | Value |
|---|---|
| Chart type | KPI card (single number with trend) |
| DataSet | specialtypulse_pipeline_market_joined |
| Metric | SUM(market_validated_amount) |
| Comparison | vs. SUM(amount) — raw pipeline |
| Subtitle | "Pipeline value weighted by market urgency — deals in high-pressure specialties count more" |
| Pillar | **Prescriptive** |
| Question answered | How much of our pipeline is in specialties where the market conditions favor buying? |

#### Card 3.3 — Territory Pipeline Alignment

| Attribute | Value |
|---|---|
| Chart type | Table |
| DataSet | specialtypulse_pipeline_market_joined |
| Columns | account_state, account_specialty, SUM(amount), pressure_index, pressure_tier, COUNT(opportunities), AVG(days_in_stage) |
| Group by | account_state, account_specialty |
| Sort | pressure_index descending |
| PDP filter | Regional sales sees their states only |
| Pillar | **Prescriptive** |
| Question answered | In my territory, where is the best intersection of open pipeline and market pressure? |

---

### Page 4: Adoption Tracking

**Audience:** Thomas Danh, David Draddy
**Purpose:** Is anyone actually using this dashboard?
**Maturity pillars:** Meta — this page tracks the adoption of the other pages.

#### Card 4.1 — Weekly Active Users by Role

| Attribute | Value |
|---|---|
| Chart type | Line chart |
| DataSet | specialtypulse_dashboard_engagement |
| X axis | view_date (weekly) |
| Series | role (from PDP config join) |
| Y axis | COUNT(DISTINCT user_email) |
| Pillar | Adoption tracking |
| Question answered | Which role groups are engaging with SpecialtyPulse consistently? |

If specialty analysts show steady weekly usage but regional sales drops off after week 2, that's a signal to investigate the rep experience or scheduled delivery cadence.

#### Card 4.2 — Most / Least Viewed Cards

| Attribute | Value |
|---|---|
| Chart type | Horizontal bar |
| DataSet | specialtypulse_dashboard_engagement |
| Y axis | page_viewed |
| X axis | COUNT(views) |
| Color | Green gradient for most viewed, red for least |
| Pillar | Adoption tracking |
| Question answered | Which parts of the dashboard are getting traction and which need redesign or promotion? |

#### Card 4.3 — Active vs. Provisioned Users

| Attribute | Value |
|---|---|
| Chart type | KPI card |
| Metric | COUNT(DISTINCT active users last 30 days) / COUNT(pdp_config users) |
| Target | >80% |
| Subtitle | "Users who viewed any SpecialtyPulse page in the last 30 days vs. total with PDP access" |
| Pillar | Adoption tracking |
| Question answered | Are we reaching the people we provisioned access for? |

---

### Page 5: PDP Governance

**Audience:** Thomas Danh (primary), David Draddy (quarterly review)
**Purpose:** Security state and compliance.
**Implementation:** Embedded Domo App (domo/app)

Content is defined in `domo/app/src/App.jsx`:
- Role distribution cards (count of users per role)
- Verify check status (6 checks, pass/fail with messages)
- Access policy matrix (full table of every user's filter scope)
- AI governance summary (Claude-generated plain-English security state)

---

## Filters & Interactivity

### Page-level filters

| Filter | Pages affected | Options |
|---|---|---|
| Specialty selector | Pages 1, 2, 3 | ModMed's 9 specialties + "All" |
| Year selector | Pages 1, 2 | Available years in data |
| Metric calculation toggle | Pages 1, 2 | "Volume-Weighted (Certified)" / "Standardized" |

### PDP auto-filters (invisible to user)

| Role | Filter applied |
|---|---|
| finance_admin | None (All Rows) |
| executive | None (All Rows) |
| specialty_analyst | provider_specialty = assigned specialty |
| regional_sales | provider_state IN assigned states |

### Card-to-card interaction

- Clicking a specialty in Card 1.1 (Pressure Index table) filters Page 2 to that specialty
- Clicking a state in Card 1.5 (Territory Map) filters Cards 2.1-2.3 to that state
- Page 3 filters cascade from specialty selector to all pipeline cards

---

## Scheduled Delivery

| Deliverable | Recipient | Cadence | Content |
|---|---|---|---|
| Pressure Index summary | Regional Sales Managers | Weekly (Monday AM) | Card 1.1 filtered to their territory (via PDP) |
| Specialty deep-dive | Specialty Analysts | Monthly | Page 2 filtered to their specialty |
| Adoption report | Thomas Danh | Weekly | Page 4 summary |
| Full dashboard link | David Draddy | Quarterly (pre-QBR) | All pages, unfiltered |

---

## Visual Design

Consistent with existing Domo App design tokens:

| Element | Value |
|---|---|
| Background | #0D2137 (navy) or Domo default white — match instance theme |
| Accent | #0A7E8C (teal) |
| Alert/highlight | #F4A830 (gold) |
| Typography | System default in Domo |
| Pressure Index colors | Red (#DC3C3C) = Immediate, Amber (#F4A830) = Emerging, Blue (#0A7E8C) = Monitor, Gray (#7A92A3) = Low Priority |

---

## Build Checklist

After reading this spec, the Domo build order is:

1. ☐ Upload `data/sample_2023_puf_10k.csv` as mart DataSet (or push via notebook 04)
2. ☐ Upload `data/sample_sfdc_pipeline.csv` as pipeline DataSet
3. ☐ Upload `data/sample_dashboard_engagement.csv` as engagement DataSet
4. ☐ Upload `domo/pdp/pdp_config.csv` as config DataSet
5. ☐ Create DataFlow 1 (specialty benchmarks) from revised `sql_dataflow.sql`
6. ☐ Create DataFlow 2 (pipeline intelligence) from join SQL
7. ☐ Add all Beast Modes (existing 4 + new 5)
8. ☐ Build Page 1 cards (5 cards)
9. ☐ Build Page 2 cards (4 cards)
10. ☐ Build Page 3 cards (3 cards)
11. ☐ Build Page 4 cards (3 cards)
12. ☐ Configure Page 5 (embed Domo App or build from verify DataSet)
13. ☐ Run `pdp_setup.py` to create policies
14. ☐ Run `pdp_verify_writer.py` to populate verify results
15. ☐ Configure scheduled delivery (4 schedules)
16. ☐ Take screenshots for README and GTM memo
