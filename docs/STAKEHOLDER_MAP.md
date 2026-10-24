# SpecialtyPulse responsibilities and review plan

**Updated:** October 24, 2026

## Actual project ownership

Kristen Martino owns this portfolio's data model, notebook/DAG source,
metric definitions, integration code, React dashboard and case study.
No stakeholder interviews, executive approval or customer deployment are recorded.
The current public build and offline checks are distinct from external-runtime
execution; see [implementation status](PRD.md).

## Proposed operational responsibilities

These are a design proposal for a future team, not people who participated in
the portfolio build or signed off on its metrics.

| Function | Proposed responsibility | Review evidence needed |
|---|---|---|
| Analytics / BI | Define grains, metrics, dashboard questions and access requirements | Formula alternatives, reconciliation examples and acceptance criteria |
| Data engineering | Operate ingestion, scheduling, storage and recovery | Successful execution receipts, freshness checks and failure/recovery tests |
| RevOps / business owner | Confirm intended decisions and evaluate usefulness | Observed workflow, agreed baselines and outcome validation |
| Security / Domo administration | Approve access scope and operate policies | Target-schema checks and intended-user access tests on each output |
| Specialty analyst | Evaluate procedure comparisons and interpretation | Clinically appropriate comparison definitions and reviewed examples |

## Proposed change process

Record the question and affected grain; document alternative definitions;
reconcile sample records; review expected changes to charts and access; then
collect the actual owner's approval before operational use. Version the chosen
definition and retain the evidence. The repository's metric log records project
choices, not completed stakeholder approval.

## Current limitations

Public usage is synthetic. The project has no observed adoption, ticket-reduction
or sales-impact measurement. Regional access requires a state-level output.
Neither offline passing tests nor a public deployment establishes live Domo
security enforcement.
