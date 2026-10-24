# Specialty review: proposed business workflow

## Intended reviewer and decision

A specialty analyst prepares a payment-pattern review for a sales or operations
lead. The decision is which scenario needs further investigation and which
questions the receiving reviewer should check before a commercial recommendation.
This is an independent prototype design, not a workflow validated through
stakeholder interviews or observed operational use.

## Work product in the public demo

Market Intelligence includes **Prepare a specialty review · sample handoff**.
The analyst selects an example specialty, reviews the computed observations,
opens its procedures or compares pipeline exposure, and downloads a Markdown
brief. The facts come from the selected specialty's latest benchmark and active
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

| Receiving role | Question | Requested next check |
|---|---|---|
| Specialty analyst | Do source records, service mix and calculation explain the comparison? | Trace a procedure to inputs and record unresolved interpretation or data issues |
| Sales operations lead | Are opportunities current, and what account needs support further review? | Confirm deal stages and account context; specialty-level scores do not establish account need |
| Sales or operations lead | What evidence is needed before a commercial recommendation? | Confirm the next reviewer and evidence request; validation remains pending |

These are proposed responsibilities, not a recorded approval process.

## Proposed acceptance criteria

Ask an intended reviewer to prepare a specialty brief, then ask the receiving
reviewer to explain what follow-up is requested. Observe where coaching is needed.
Record interpretation errors, missing evidence, unanswered questions and recipient
feedback. No user-test results or business outcomes have been collected.

| Criterion | Observable behavior in a future evaluation |
|---|---|
| Explain the focus | Reviewer identifies the specialty, cites a payment comparison and pipeline exposure, and recognizes that the inputs are synthetic |
| Interpret the measures | Reviewer explains the payment denominator and distinguishes a scenario score from a sales recommendation |
| Make a usable handoff | Brief states an unresolved question, receiving role and next check; the recipient can identify the requested follow-up |

These criteria assess the proposed review workflow. They are not proof of adoption,
time savings, lead quality or sales improvement. Such claims would require actual
observation, a defined baseline and appropriate outcome validation.
