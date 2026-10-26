# Specialty review: proposed business workflow

## Intended reviewer and decision

A specialty analyst prepares a review of payment patterns for a sales or operations
lead. The decision is which scenario needs further investigation and which
questions the receiving reviewer should check before a commercial recommendation.
This is an independent prototype.

Assumed business setting: the analyst supports a healthcare-software vendor selling
electronic health record (EHR), practice management (PM) and revenue cycle
management (RCM) subscriptions to specialty practices. The sales or operations
lead decides which questions warrant analyst verification or account discovery
before discussing a software recommendation. Reimbursement signals concern the
practice; opportunity amounts concern the hypothetical vendor's software contracts.
Account conversations must establish needs before a recommendation or outreach
priority. This setting is a design assumption, not recorded customer discovery.

## Problem hypothesis to validate

Assumed current workflow: an analyst compares payment tables, checks pipeline
context in a separate report and copies findings into a brief. Moving between
sources may leave evidence or follow-up requests out of the handoff.

The product hypothesis is that building the brief during investigation could
reduce preparation time and clarification work while preserving evidence.
Before a pilot, ask intended analysts and recipients to walk through a recent
review. Confirm frequency, tools, time spent, missing evidence and the decision
that follows. These are assumptions, not research findings. If reviews are
infrequent or existing reports meet the need, reconsider the product scope.

## Work product in the public demo

Market Intelligence includes **Specialty review**, opened with **Start review**.
One shared specialty selection connects the brief and Procedure Detail. The
analyst compares the same specialty and HCPCS code across consecutive years,
adds the comparison (or a procedure from the service-count ranking), then writes an
observation and its limits, an open question, a next reviewer and a requested
check. The Markdown download includes the procedure's specialty, HCPCS code,
both years' payments and service counts, absolute and percentage changes, and
those unverified analyst notes. Percentages use the previous year as the
denominator; payment differences use mart values rounded to cents. Missing
inputs or zero denominators leave percentages unavailable.
Each specialty keeps a separate draft across tab changes. Drafts last until
the page reloads; download to keep a copy. Missing fields remain marked.
The four-element completeness indicator checks presence, not accuracy or approval.
The facts come from the selected specialty's latest benchmark and active
synthetic deals; closed-won and closed-lost deals are excluded from active exposure.
For this demo, amount is assumed annual contract value (ACV) in USD. These are
unweighted opportunity amounts; closed-won ACV is not recognized revenue or a
forecast. The invented scenario snapshot is August 31, 2026. The source capture
date was not recorded. Stages are shown as supplied; all 500 rows are included
without a period filter. Created dates span September 2, 2025–February 24, 2026;
close dates span October 11, 2025–August 14, 2026.

At that snapshot, all **472 open opportunities / $40,178,200 assumed USD ACV**
have close dates before August 31: **100% of open deals, 17–324 days overdue**.
The open-stage total includes this backlog. Overdue means an open opportunity's
valid close date is strictly before the scenario date; closed stages are excluded,
and missing/invalid dates are reported separately. The dashboard and downloaded
brief calculate these facts from the fixture, including specialty-specific totals.
First sales follow-up: reconcile stages and close dates with sales operations
before planning. Record confirmed changes; overdue dates alone do not close or
remove opportunities. No actual CRM updates or sales review are claimed.


The example begins with the highest score in the constructed scenario. That is
an example focus, not an approved account shortlist. The brief includes:

- Selected specialty and scenario year.
- Pressure score, average procedure-level payment change, active synthetic amount, deal count and share.
- Questions for the analyst, sales operations and the receiving lead.
- A requested next check and a status of source/account validation pending.

All records are synthetic. Earlier-year payment changes are generated comparison
scenarios. The pressure score has not been validated against sales outcomes.
Downloading a brief does not send it to a recipient or establish stakeholder review.

## Portable verification

Each selected comparison includes a link that reopens the exact specialty, HCPCS
code and comparison year. Exported evidence links pin the reporting mart, raw
input files, run receipt and reproduction guide to the app build's repository
revision. The mart/input SHA-256 values and recorded execution time identify the
snapshot. The live link uses the current demo; pinned files preserve the original
evidence if the public data changes.

Every exported brief also links to the synthetic sales CSV and sales metric
definitions at the build's repository revision. Reproduction instructions state
the selected account_specialty, open-stage exclusions, overdue-date filter and
all-specialty denominator for pipeline share. The sales reference is included
even when the draft has no procedure evidence.

The raw filter uses provider_type, hcpcs_cd and tot_srvcs >= 11. The existing
payment_verification.json raw-row trace covers only Dermatology / 99213 / 2023;
it is included only when that year and procedure are in the comparison.

## Completed illustrative handoff

This example demonstrates the output; it records no stakeholder use or assignment.
Open Dermatology / HCPCS 99213 / CY2023 and choose **Add comparison to brief**.

- Evidence: generated 2022 scenario $108.05 / 3,626 services; synthetic 2023 base $104.91 / 3,777 services. Payment −$3.14 (−2.9%); services +151 (+4.2%).
- Observation and limits: payment per service falls while service count rises in the constructed comparison. Generated prior-year inputs cannot establish a historical payment trend, its cause or account need.
- Open question: Which source rows and service mix explain this constructed change?
- Next reviewers: Sales operations lead for stage/date review; specialty analyst for calculation review.
- Requested check: first reconcile the 53 Dermatology open opportunities and their past-due close dates with sales operations, then match Dermatology / 99213 in the pinned 2022/2023 inputs and mart; reproduce weighted payments and service counts, then record unresolved data or interpretation issues for the sales or operations lead.
- Context: scenario score 66.6; 53 synthetic open deals worth $4,579,800 assumed USD ACV (11.4% of open-stage pipeline). All 53 are overdue at the scenario snapshot. These remain in the open-stage total pending review; the amount is separate from the procedure comparison and score.
- Status: illustrative draft; source/account validation remains pending. Downloading sends or assigns nothing.

## Proposed handoff responsibilities

| Who reviews it next | Question | Requested next check |
|---|---|---|
| Sales operations lead — first sales follow-up | Which stages and close dates need correction before planning? | Reconcile open opportunities and record confirmed stage/date changes; keep overdue deals in the supplied total until reviewed |
| Specialty analyst | Do source records, service mix and calculation explain the comparison? | Trace a procedure to inputs and record unresolved interpretation or data issues |
| Sales operations lead | Are deal stages current, and what do account notes say about the customer’s needs? | Confirm deal stages and account context; specialty-level scores do not establish account need |
| Sales or operations lead | What evidence is needed before a commercial recommendation? | Confirm the next reviewer and evidence request; validation remains pending |

These are proposed responsibilities, not a recorded approval process.

## Proposed usefulness study

This workflow and its evaluation criteria are proposed. No stakeholder validation, user evaluation or business outcomes have been recorded.

Recruit five analyst–reviewer pairs for an exploratory comparison. Each analyst
prepares two briefs from matched data: one with their usual report or spreadsheet
and one with SpecialtyPulse. Alternate method order and scenario assignment.
Confirm the usual workflow and comparable task difficulty before testing.

Measure preparation time from opening the data to submitting a brief. Recipients
review briefs without the method identified. Record missing evidence,
interpretation errors and clarification requests before they can state the
next action.

| Measure | Proposed threshold for proceeding to a larger pilot |
|---|---|
| Completeness | At least four of five SpecialtyPulse briefs include procedure evidence, an observation with limits, an open question, and a next reviewer with a requested check; completeness is at least as high as the comparison method |
| Interpretation | No critical errors in SpecialtyPulse briefs or recipient explanations |
| Preparation time | Median paired time reduction of at least 20% against the comparison method, without reducing completeness |
| Clarification | At least four of five recipients explain the next action without clarification, with no more requests overall than for comparison briefs |

Critical errors include treating synthetic data as observed history, a score as
account need, or a blended average as a procedure-specific expected rate.
A complete form is not enough: an evaluator must judge evidence relevance,
interpretation and whether the observation states its limits.

These thresholds are proposed, not achieved results. Five pairs can guide an
iteration, not establish population-level impact. If accuracy or completeness
fails, revise the workflow before testing speed again. Sessions and page views
describe activity; they do not demonstrate usefulness. The public Adoption
Tracking page presents illustrative activity separately from this study.
