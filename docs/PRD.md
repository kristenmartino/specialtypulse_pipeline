# Product Requirements Document: SpecialtyPulse

**Version:** 1.0
**Author:** Kristen Martino
**Last updated:** March 2026
**Status:** Active development

---

## 1. Overview

### 1.1 What is SpecialtyPulse?

SpecialtyPulse is a GTM market intelligence platform that transforms public CMS Medicare reimbursement data into actionable sales prioritization signals for a specialty healthcare SaaS company.

It answers the question every revenue leader asks on Monday morning: **where should my team focus this quarter, and why?**

The platform ingests raw CMS Physician & Other Practitioners Public Use Files, transforms them through a certified analytical pipeline, and delivers specialty-level intelligence through an interactive Domo dashboard — with prescriptive recommendations, row-level security, and automated governance verification.

### 1.2 Relationship to NorthStar (gtm-healthcare-intel)

SpecialtyPulse is the **production implementation** of the governance framework designed in the NorthStar application.

NorthStar was built as a React-based design prototype demonstrating four concepts:

| NorthStar concept | SpecialtyPulse implementation |
|---|---|
| Metric Registry with conflict resolution UI | `cms_schema.py` data contract + `METRIC_CERTIFICATION_LOG.md` with competing definitions resolved and enforced in code |
| Adoption Tracker with shadow spreadsheet monitoring | Domo dashboard engagement tracking page with synthetic usage data and active-vs-provisioned user metrics |
| Analytics Maturity Model (descriptive → prescriptive) | Four-pillar dashboard structure: descriptive trend cards, diagnostic compression drivers, predictive trend projections, prescriptive Reimbursement Pressure Index |
| Prescriptive Alerts with anomaly detection | Reimbursement Pressure Index scoring specialties by sales urgency with tier labels and recommended actions |

NorthStar showed how to think about GTM analytics governance. SpecialtyPulse shows how to build it — with real data, real infrastructure, and real BI tooling.

### 1.3 Why CMS data? Why these specialties?

ModMed serves nine medical specialties: dermatology, gastroenterology, ophthalmology, orthopedics, otolaryngology, pain management, plastic surgery, podiatry, and urology. Each of these specialties appears in the CMS Medicare Physician PUF — a public dataset containing reimbursement, service volume, and provider data at the procedure level.

Practices under reimbursement pressure are more likely to invest in revenue cycle optimization software. The CMS data reveals which specialties are experiencing compression, where that compression is geographically concentrated, and whether it's accelerating. This is exactly the market intelligence a GTM team needs to prioritize outreach.

In production, this external market intelligence would be joined with internal Salesforce pipeline data to create a complete targeting picture. This project implements the market intelligence layer and designs (but does not deploy with live data) the CRM integration.

---

## 2. Personas & Stakeholders

### 2.1 Primary personas

**RevOps VP (David Draddy archetype)**

- Presents pipeline and revenue analytics to the CRO and board
- Needs: numbers he can trust, governance he can point to, reporting that drives sales behavior
- Uses SpecialtyPulse for: specialty prioritization signals at QBRs, territory alignment decisions, metric certification oversight
- Key concern: "Are these numbers right, and will my team actually use this?"
- Default metric view: **volume-weighted averages** (matches board reporting methodology)

**GTM Analytics Director (Thomas Danh archetype)**

- Builds and maintains the analytical infrastructure
- Needs: standardized metrics, adoption tracking, prescriptive capabilities
- Uses SpecialtyPulse for: metric certification, maturity progression, diagnostic drill-downs, governance monitoring
- Key concern: "Can I standardize how everyone calculates these metrics and get them off their spreadsheets?"
- Default metric view: **all calculation methods visible** with certification labels

**Specialty Analyst**

- Owns analytics for a single ModMed vertical (e.g., Dermatology)
- Needs: deep procedural detail for their specialty, benchmarks against other specialties, geographic variation
- Uses SpecialtyPulse for: procedure-level compression analysis, outlier identification, competitive intelligence within their specialty
- Key concern: "Show me what's happening in my specialty and how it compares"
- Default metric view: **standardized averages** (for fair cross-geography comparison)
- PDP filter: sees only their assigned specialty

**Regional Sales Manager**

- Manages reps across a multi-state territory
- Needs: which specialties in their states are under the most pressure, Monday morning prospecting signals
- Uses SpecialtyPulse for: territory-level Pressure Index, practice prioritization, pipeline context
- Key concern: "Where should my reps focus this week?"
- Default metric view: **volume-weighted averages** (aligned with leadership reporting)
- PDP filter: sees only their assigned states

### 2.2 Stakeholder ownership

| Function | Owns | Approves changes to |
|---|---|---|
| BI Analyst (this role) | Mart definition, DataFlow, dashboard, PDP governance, metric certification process | Metric definitions, dashboard design, governance policies |
| Data Engineering | Pipeline infrastructure (notebooks 01-03), compute, scheduling | Raw and staging schemas, cluster configuration, pipeline SLAs |
| RevOps Leadership | Metric certification sign-off, business requirements | Which metrics are certified, who sees what |
| Specialty GMs | Business context, specialty-specific requirements | Nothing directly — requests go through BI Analyst via certification process |

---

## 3. Metric Disambiguation

### 3.1 The problem

The same metric name — "average Medicare payment" — can mean three different things depending on who calculated it and why. When a specialty analyst says average derm payment is $85 and Finance says it's $112, both are correct. They're using different formulas optimized for different purposes.

This is the #1 source of metric distrust in GTM organizations. It's not a data quality problem — it's a definition alignment problem.

### 3.2 Three definitions of "Average Medicare Payment"

**Simple Average**

```
Formula:  AVG(avg_medicare_payment) across providers
Example:  (80 + 90 + 150) / 3 = $106.67
Use case: Quick comparison, intuitive to explain
Weakness: A provider billing 10 services and a provider billing 10,000 services
          count equally. Overweights low-volume outliers.
Who uses: Product managers doing quick specialty comparisons
```

**Volume-Weighted Average (CERTIFIED)**

```
Formula:  SUM(avg_medicare_payment × total_services) / SUM(total_services)
Example:  (80×10 + 90×50 + 150×10000) / (10+50+10000) = $149.25
Use case: Accurate representation of actual payment flows
Weakness: Dominated by high-volume providers/procedures
Who uses: Finance, board reporting, revenue analysis
Status:   CERTIFIED — this is the metric of record
Why:      Matches CMS methodology. Reflects economic reality of payment flows.
          A dermatologist performing 10,000 Mohs surgeries has more market impact
          than one performing 10 consultations.
```

**Standardized Average**

```
Formula:  AVG(avg_medicare_standardized_amount) — CMS wage-index adjusted
Example:  Removes geographic cost variation so FL and NY are comparable
Use case: Fair cross-geography comparison, territory equity analysis
Weakness: Not what providers actually receive — it's an adjusted benchmark
Who uses: Market analysts, territory planning, competitive intelligence
```

### 3.3 How disambiguation appears in SpecialtyPulse

**In the certified mart:** All three values are present as separate columns (`avg_medicare_payment` for weighted, `avg_submitted_charge` as reference, `avg_medicare_standardized_amount` for standardized). The simple average is not stored — it's available as a Beast Mode for ad hoc analysis but is not a certified column.

**In the DataFlow:** The specialty benchmark uses volume-weighted average. A comment documents why.

**In the dashboard:**

- Default view shows the **certified (volume-weighted)** metric with a label: "Volume-Weighted Avg Payment (Certified)"
- A Beast Mode toggle card allows switching to the standardized view, labeled: "Standardized Avg Payment (Geo-Adjusted)"
- When the standardized view is active, a subtitle reads: "Adjusted for geographic wage variation — use for cross-state comparison"
- The simple average is available as a hover tooltip or secondary axis, labeled: "Simple Avg (uncertified — overweights low-volume providers)"

**In the Pressure Index:** Only the certified volume-weighted average feeds the scoring model. This is documented in the DataFlow SQL as a comment:

```sql
-- PRESSURE INDEX uses volume-weighted avg_medicare_payment (certified).
-- Do NOT substitute simple average or standardized amount.
-- Rationale: the index measures actual payment compression experienced
-- by practices, not adjusted benchmarks.
```

**In PDP-filtered views:**

- RevOps VP and Regional Sales Managers see volume-weighted by default (aligned with board reporting)
- Specialty Analysts see both weighted and standardized side by side (they need geographic comparison for their vertical)
- The metric label is always visible — no role ever sees a number without knowing which calculation produced it

### 3.4 Second disambiguation example: "YoY Change"

**Absolute change:**

```
Formula:  current_year_value - prior_year_value
Example:  $112 - $108 = +$4
Use case: "How many more dollars per service?"
```

**Percentage change (CERTIFIED):**

```
Formula:  (current - prior) / prior
Example:  ($112 - $108) / $108 = +3.7%
Use case: Normalized comparison across specialties with different payment levels
Status:   CERTIFIED for YoY reporting
Why:      A $4 increase means something different for a $50 procedure vs. a $500 procedure.
          Percentage change normalizes across payment levels.
```

**Indexed change (base year = 100):**

```
Formula:  (current / base_year_value) × 100
Example:  ($112 / $100) × 100 = 112
Use case: Multi-year trend visualization where the starting point matters
```

The dashboard trend cards use percentage change (certified) as the primary axis. The indexed view is available as a Beast Mode toggle for multi-year trend analysis. Absolute change appears in the Pressure Index detail view where a sales rep needs to know "derm payments dropped $4/service this year."

---

## 4. Analytics Maturity — Four Pillars

### 4.1 How the four pillars appear in the dashboard

Each dashboard page is tagged with which maturity pillar it serves. The dashboard itself is a demonstration of the analytics maturity ladder — not just a collection of charts.

**Pillar 1: Descriptive — "What happened?"**

Implemented through:
- Reimbursement trend by specialty (line chart, payment over years)
- Volume by specialty and year (bar chart)
- Provider count by specialty (bar chart)
- Territory heatmap (avg payment by state)

These are the foundation. Every other pillar builds on them.

**Pillar 2: Diagnostic — "Why did it happen?"**

Implemented through:
- Compression driver classification: when a specialty's payment-to-charge ratio declines, the DataFlow categorizes whether it's because payments fell, charges rose, or both. A dashboard card shows this breakdown by specialty.
- Outlier procedure drill-down: within a specialty, which specific HCPCS codes are pulling the compression ratio down? A table card filtered to `is_payment_outlier = true` answers this.
- Facility vs. office mix trend: the shift from office-based to facility-based care changes reimbursement patterns. A trend line card shows this shift.
- Payment vs. specialty benchmark: each procedure compared to its specialty average — which procedures are anomalous?

**Pillar 3: Predictive — "What will happen?"**

Implemented through:
- Trend projection: the DataFlow calculates a projected next-year value for key metrics based on the trailing YoY change rate. Columns: `projected_next_year_ptcr`, `projected_next_year_services`. A boolean `is_projected` flag distinguishes forecast from historical data.
- Domo forecast lines: enabled on trend charts to visually extend the trendline.
- Projection confidence: the DataFlow calculates the stability of the trend (variance of YoY changes). High variance = low confidence projection. A Beast Mode labels projections as "High Confidence" or "Directional Estimate."

This is intentionally a simple projection model, not ML. For a BI analyst role, a defensible trend-based forecast is appropriate. The design doc notes where a data science team would upgrade this to a statistical model.

**Pillar 4: Prescriptive — "What should we do?"**

Implemented through:
- **Reimbursement Pressure Index**: a composite score combining:
  - Current compression level (payment_to_charge_ratio — lower = more compressed)
  - Compression trajectory (is it getting worse? from the predictive layer)
  - Volume growth (is this a growing market despite compression?)
  - Provider count (is the addressable market large enough?)
- **Tier labels**: "Immediate Opportunity," "Emerging Opportunity," "Monitor," "Low Priority"
- **Ranked specialty table**: the anchor card on Page 1, showing ModMed's nine specialties ranked by Pressure Index with tier labels and key supporting metrics
- **Territory-level prescriptive view**: Pressure Index by state, filterable by specialty, so a regional sales manager sees where the urgency is in their geography
- **Pipeline × Market Intelligence**: when joined with Salesforce data, the Pressure Index enriches pipeline opportunities — a deal in a high-pressure specialty is more likely to close because the practice pain is real and growing

---

## 5. Functional Requirements

### 5.1 Data pipeline

| ID | Requirement | Priority |
|---|---|---|
| P-01 | Ingest CMS PUF CSV files into Delta raw layer with audit columns | Implemented |
| P-02 | Clean, type-cast, normalize specialty taxonomy across CMS 2023 reclassification | Implemented |
| P-03 | Enforce CMS suppression filter (services < 11 excluded) as data contract | Implemented |
| P-04 | Aggregate to specialty × hcpcs × year grain with volume-weighted payment averages | Implemented |
| P-05 | Calculate YoY changes with consecutive-year guard (prevent misleading multi-year deltas) | Implemented |
| P-06 | Calculate specialty benchmarks and outlier flags using window functions | Implemented |
| P-07 | Push certified mart to Domo via Dataset API with schema validation | Implemented |
| P-08 | Orchestrate all steps via Airflow DAG with retry logic and dependency management | Implemented |

### 5.2 Domo DataFlow & analytics layer

| ID | Requirement | Priority |
|---|---|---|
| D-01 | Aggregate mart to specialty × year grain for benchmark dashboard | Implemented (sql_dataflow.sql) |
| D-02 | Calculate compression driver classification (payment decline / charge inflation / both) | To build |
| D-03 | Calculate trend projection for next-year ptcr and services with confidence indicator | To build |
| D-04 | Calculate Reimbursement Pressure Index composite score | To build |
| D-05 | Join CMS market intelligence with Salesforce pipeline extract on specialty + state | To build |
| D-06 | Beast Modes: YoY label, compression category, outlier badge, benchmark label | Defined (sql_dataflow.sql comments) |
| D-07 | Beast Modes: compression driver label, pressure index tier, projection confidence, metric calculation toggle | To build |

### 5.3 Dashboard

| ID | Requirement | Priority |
|---|---|---|
| V-01 | Page 1 — Market Intelligence: Pressure Index ranking, compression trend with forecast, drivers, scatter plot, territory view | To build |
| V-02 | Page 2 — Procedure Detail: outlier table, benchmark comparison, facility mix trend | To build |
| V-03 | Page 3 — Pipeline Intelligence: pipeline by specialty with pressure overlay, market-validated pipeline, territory alignment | To build |
| V-04 | Page 4 — Adoption Tracking: WAU by role, most/least viewed cards, active vs. provisioned users | To build |
| V-05 | Page 5 — PDP Governance: embedded Domo App showing role distribution, verify checks, access matrix, AI summary | Domo App built, dashboard page to build |
| V-06 | All payment metric cards display certified calculation with label; toggle available for standardized view | To build |
| V-07 | Domo scheduled delivery: weekly Pressure Index to sales managers, monthly territory view to reps | To configure |

### 5.4 Governance

| ID | Requirement | Priority |
|---|---|---|
| G-01 | PDP policies on DataFlow OUTPUT dataset (not input — critical antipattern) | Implemented (pdp_setup.py) |
| G-02 | Config-driven PDP: pdp_config.csv → API → policies, version-controlled in Git | Implemented |
| G-03 | Automated PDP verification with results written to Domo dataset | Implemented (pdp_verify_writer.py) |
| G-04 | Nightly CI governance check via GitHub Actions | Implemented (ci.yml) |
| G-05 | Domo App displaying live governance state | Implemented (React app) |
| G-06 | Metric certification log with competing definitions and resolution rationale | To write |
| G-07 | Stakeholder ownership map with handoff points and conflict resolution process | To write |

### 5.5 CRM integration (designed, not deployed with live data)

| ID | Requirement | Priority |
|---|---|---|
| C-01 | Synthetic Salesforce pipeline extract with realistic schema | To generate |
| C-02 | DataFlow join: CMS market intelligence × pipeline on specialty + state | To build |
| C-03 | Market-validated pipeline metric: opportunity value weighted by Pressure Index | To build |
| C-04 | Dashboard cards showing pipeline-market alignment | To build |
| C-05 | Commented "future join" section in DataFlow for live Salesforce connector | To write |

---

## 6. Non-Functional Requirements

### 6.1 Data quality

- All certified metric definitions enforced in code, not just documentation
- Validation assertions at every pipeline stage (null checks, uniqueness, range checks)
- CMS suppression filter applied as a contract requirement
- `is_projected` flag on all forecast values — no user should see a projected number without knowing it's a projection
- Metric labels always visible — no card displays a number without identifying which calculation produced it

### 6.2 Security

- Row-level filtering via Domo PDP, applied to DataFlow output (not input)
- Role-based metric presentation (different default views per persona)
- PDP policies programmatically created, verified, and monitored
- API credentials stored in Databricks Secrets (production) or environment variables (development)
- No credentials in code — placeholder fallbacks raise errors, not silent failures

### 6.3 Maintainability

- Single source of truth for metric definitions (`cms_schema.py`)
- Change-control process documented in Stakeholder Map
- Metric Certification Log records all definition decisions with rationale
- Pipeline handles CMS schema changes across years (taxonomy crosswalk, mergeSchema)
- Dashboard spec documents every card with its data source, question answered, and pillar served

---

## 7. Success Metrics

How would we know SpecialtyPulse is working in production?

| Metric | Target | Measurement |
|---|---|---|
| Dashboard weekly active users | >80% of provisioned users | Domo activity log / Adoption Tracking page |
| Ad hoc data requests to BI team | 30% reduction within 90 days | Jira ticket volume |
| Time to answer "which specialty should we prioritize?" | <5 minutes (was: multi-day ad hoc analysis) | Stakeholder survey |
| Metric definition disputes escalated to leadership | Zero after certification process established | Escalation log |
| PDP governance checks | 100% passing, checked nightly | CI badge / Governance App |
| Board-ready reporting turnaround | Same-day (was: 2-3 day manual pull) | RevOps team tracking |

---

## 8. Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| CMS changes specialty taxonomy again | Medium | High — breaks staging logic | Taxonomy crosswalk in `02_staging.py` handles pre/post 2023. Designed for extensibility. New mappings added to crosswalk table, not hardcoded. |
| Stakeholders resist standardized metrics | High | High — adoption failure | Metric Certification Log documents rationale. Stakeholder Map defines conflict resolution. Adoption tracking makes resistance visible. |
| PDP applied to wrong dataset (DataFlow input vs. output) | Low (documented) | Critical — false sense of security | `PDP_DESIGN.md` documents the antipattern. `pdp_verify.py` checks for it explicitly. CI runs nightly. |
| Projection model is too simplistic for decision-making | Medium | Medium | Clearly labeled as "Directional Estimate" vs. "High Confidence." Design doc notes where a data science team would upgrade to statistical model. |
| Salesforce data quality issues when CRM integration goes live | High | Medium | CRM integration designed but not deployed with live data. Join logic includes null handling and fallback values. Schema documented for DE team. |

---

## 9. Roadmap

### Phase 1 — Current: Market Intelligence (this project)

External CMS data → certified pipeline → prescriptive dashboard → governance

### Phase 2 — Future: CRM Integration

Live Salesforce connector → pipeline-market join → enriched opportunity scoring → rep-level prospecting views

### Phase 3 — Future: Decision Intelligence

Statistical forecasting models (upgrade from linear projection) → automated alerts when a specialty crosses a pressure threshold → integration with Salesforce workflow (auto-create tasks for high-priority accounts) → closed-loop tracking (did the prescriptive signal lead to a deal?)

---

## 10. Appendices

- **A:** Dashboard Specification (`docs/DASHBOARD_SPEC.md`)
- **B:** Technical Design Document (`docs/TECHNICAL_DESIGN.md`)
- **C:** Stakeholder Map (`docs/STAKEHOLDER_MAP.md`)
- **D:** Metric Certification Log (`docs/METRIC_CERTIFICATION_LOG.md`)
- **E:** PDP Security Design (`domo/pdp/PDP_DESIGN.md`)
- **F:** Setup Guide (`docs/SETUP.md`)
