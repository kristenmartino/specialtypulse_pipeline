# Stakeholder Map: SpecialtyPulse

**Companion to:** `docs/PRD.md`
**Author:** Kristen Martino
**Last updated:** March 2026

---

## 1. Ownership Matrix

| Component | Owner | Approver for changes | Consulted |
|---|---|---|---|
| Raw ingestion (01_ingest) | Data Engineering | DE Lead | BI Analyst (schema expectations) |
| Staging transforms (02_staging) | Data Engineering | DE Lead | BI Analyst (taxonomy mappings, business rules) |
| Mart definition (03_marts) | BI Analyst | RevOps VP (metric sign-off), DE Lead (implementation review) | Specialty GMs (business context) |
| Domo push (04_push_to_domo) | Data Engineering | DE Lead | BI Analyst (schema, refresh cadence) |
| Data contract (cms_schema.py) | BI Analyst | RevOps VP | DE Lead, Specialty GMs |
| SQL DataFlow | BI Analyst | GTM Analytics Director | DE Lead (performance review) |
| Beast Modes | BI Analyst | GTM Analytics Director | Specialty Analysts (usability) |
| Dashboard design & cards | BI Analyst | GTM Analytics Director, RevOps VP | Regional Sales Managers (rep usability) |
| PDP policies | BI Analyst | RevOps VP (who sees what), GTM Analytics Director | Security/Compliance |
| PDP verification & CI | BI Analyst | GTM Analytics Director | DE Lead |
| Domo App (governance viewer) | BI Analyst | GTM Analytics Director | RevOps VP (quarterly review) |
| Airflow infrastructure | Data Engineering | DE Lead | BI Analyst (scheduling requirements) |
| Databricks compute | Data Engineering | DE Lead | BI Analyst (performance needs) |

### The key boundary

The BI Analyst owns **what** gets calculated and **who** sees it.
Data Engineering owns **how** it gets computed and **where** it runs.

The data contract (`cms_schema.py`) is the interface between these two domains. Changes to the contract require review from both sides.

---

## 2. Handoff Points

### 2.1 New data source onboarding

When a new data source needs to enter the pipeline (e.g., adding Salesforce live data):

```
BI Analyst                          Data Engineering
────────────                        ─────────────────
1. Identifies business need
2. Defines schema requirements
   (columns, types, grain, refresh)
3. Documents in data contract
                          ──────►   4. Reviews feasibility
                                    5. Builds ingestion
                                    6. Deploys to staging
                          ◄──────   7. Notifies BI: "staging ready"
8. Validates data quality
9. Builds mart logic / DataFlow
10. Updates dashboard
```

### 2.2 Metric definition change

When a certified metric needs to change (e.g., changing from volume-weighted to standardized average):

```
Requestor (any stakeholder)         BI Analyst                          RevOps VP
──────────────────────────          ────────────                        ─────────
1. Submits request with
   business justification
                          ──────►   2. Evaluates impact
                                    3. Documents competing
                                       definitions in
                                       Certification Log
                                    4. Tests new definition
                                       against historical data
                                    5. Prepares comparison
                                       showing both calculations
                                    6. Presents to RevOps VP
                                                              ──────►  7. Reviews, approves
                                                                          or rejects
                                                              ◄──────  8. Decision
                                    9. Updates cms_schema.py
                                    10. Updates DataFlow + Beast Modes
                                    11. Updates Certification Log
                                    12. Notifies all dashboard users
                                        of change + effective date
```

### 2.3 New dashboard card request

```
Requestor                           BI Analyst                          GTM Analytics Director
─────────                           ────────────                        ──────────────────────
1. Describes business question
   they need answered
                          ──────►   2. Checks if existing cards
                                       answer the question
                                    3. If new card needed:
                                       - Identifies data source
                                       - Drafts card spec
                                       - Estimates effort
                                    4. Presents spec
                                                              ──────►  5. Prioritizes against
                                                                          other requests
                                                              ◄──────  6. Approved with priority
                                    7. Builds card
                                    8. Reviews with requestor
                                    9. Publishes to dashboard

Turnaround: 3-5 business days for a standard card using existing data.
            1-2 weeks if new DataFlow logic is required.
            Longer if a new data source is needed (involves DE handoff).
```

---

## 3. Conflict Resolution

### 3.1 Metric definition conflicts

**Scenario:** Sales says "our average derm payment is $85." Finance says "it's $112." Both are correct — Sales is using a simple average, Finance is using the volume-weighted average.

**Resolution process:**

1. **Document both definitions** in the Metric Certification Log with the formula, example values, and the business rationale for each.

2. **Identify the impact** of choosing one over the other. In this case: the simple average overweights low-volume providers, producing a number that doesn't reflect actual payment flows. The volume-weighted average matches CMS methodology and reflects economic reality.

3. **Present both calculations side by side** to the metric owner (RevOps VP) with a recommendation. Include a dashboard card showing both values so the difference is visible, not abstract.

4. **Certify one definition** as the metric of record. Document the decision, the rationale, and the date.

5. **Keep the other definition accessible** but clearly labeled. In SpecialtyPulse, the non-certified calculation is available as a Beast Mode toggle with a label explaining what it is and how it differs.

6. **Never delete the losing definition silently.** Stakeholders who used it need to understand what changed and why. The Certification Log is the historical record.

### 3.2 Dashboard access conflicts

**Scenario:** A specialty analyst wants to see data for a specialty they don't own, to do competitive benchmarking.

**Resolution process:**

1. **Evaluate against the PDP security model.** The design is intentional — analysts see only their specialty to prevent data leakage across product teams.

2. **If the request is legitimate** (e.g., the Dermatology GM wants to benchmark against Ophthalmology because both are high-volume office-based specialties), the BI Analyst can create a specific benchmarking card that shows aggregate metrics for comparison specialties without exposing provider-level detail. This is a dashboard design solution, not a PDP change.

3. **If the request requires a PDP exception**, it goes to the RevOps VP for approval. PDP changes are never made by the BI Analyst alone — they require documented sign-off.

4. **Document the decision** regardless of outcome. The PDP config in Git is the audit trail.

### 3.3 Priority conflicts

**Scenario:** Three specialty GMs each want dashboard changes, and all say theirs is urgent.

**Resolution process:**

1. **All requests go to the GTM Analytics Director** (Thomas), not directly to the BI Analyst. This prevents the BI Analyst from being the one saying "no" to a GM.

2. **Thomas prioritizes** based on business impact, alignment with quarterly goals, and effort level. The BI Analyst provides effort estimates.

3. **The BI Analyst publishes a simple request queue** (even a Domo card showing request status) so stakeholders can see where their request is without asking.

4. **Quick wins (< 1 day effort) can be fast-tracked** without formal prioritization. The BI Analyst uses judgment and keeps Thomas informed.

---

## 4. Communication Cadence

| Meeting | Participants | Frequency | Purpose |
|---|---|---|---|
| Dashboard review | BI Analyst + Thomas | Weekly | Review adoption metrics, triage requests, plan sprint |
| Metric governance | BI Analyst + Thomas + David | Monthly | Review certification log, approve pending definitions, address conflicts |
| Stakeholder update | BI Analyst + Specialty GMs | Quarterly | Present new capabilities, gather feedback, surface unmet needs |
| PDP audit | BI Analyst + Thomas | Quarterly | Review access policies, verify no drift, adjust for org changes |
| DE sync | BI Analyst + DE Lead | Biweekly | Pipeline health, upcoming schema changes, data quality issues |

---

## 5. Escalation Path

```
Issue arises
    │
    ├── Data quality issue ──────────► BI Analyst triages
    │                                      │
    │                                      ├── Pipeline bug ──► DE team fixes
    │                                      └── Source data issue ──► Document, exclude, notify
    │
    ├── Metric dispute ──────────────► BI Analyst documents both sides
    │                                      │
    │                                      └── Presents to RevOps VP ──► Decision + Certification Log
    │
    ├── Access request ──────────────► BI Analyst evaluates against PDP model
    │                                      │
    │                                      ├── Dashboard design solution ──► BI Analyst implements
    │                                      └── PDP change needed ──► RevOps VP approves
    │
    └── Priority conflict ───────────► GTM Analytics Director prioritizes
                                           │
                                           └── Unresolvable ──► RevOps VP decides
```
