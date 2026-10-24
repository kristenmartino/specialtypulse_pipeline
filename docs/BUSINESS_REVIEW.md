# Specialty review: proposed business workflow

## Intended reviewer and decision

A specialty analyst prepares a review of payment patterns for a sales or operations
lead. The decision is which scenario needs further investigation and which
questions the receiving reviewer should check before a commercial recommendation.
This is an independent prototype.

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

Market Intelligence includes **Prepare a specialty review · sample handoff**.
One shared specialty selection connects the brief and Procedure Detail. The
analyst adds a procedure from the service-count ranking, then writes an
observation and its limits, an open question, a next reviewer and a requested
check. The Markdown download includes the procedure's specialty, HCPCS code,
year, payment and service count alongside those unverified analyst notes.
Each specialty keeps a separate draft across tab changes. Drafts last until
the page reloads; download to keep a copy. Missing fields remain marked.
The four-element completeness indicator checks presence, not accuracy or approval.
The facts come from the selected specialty's latest benchmark and active
synthetic deals; closed-won and closed-lost deals are excluded from active exposure.

The example begins with the highest score in the constructed scenario. That is
an example focus, not an approved account shortlist. The brief includes:

- Selected specialty and scenario year.
- Pressure score, average procedure-level payment change, active synthetic amount, deal count and share.
- Questions for the analyst, sales operations and the receiving lead.
- A requested next check and a status of source/account validation pending.

All records are synthetic. Earlier-year payment changes are generated comparison
scenarios. The pressure score has not been validated against sales outcomes.
Downloading a brief does not send it to a recipient or establish stakeholder review.

## Proposed handoff responsibilities

| Who reviews it next | Question | Requested next check |
|---|---|---|
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
