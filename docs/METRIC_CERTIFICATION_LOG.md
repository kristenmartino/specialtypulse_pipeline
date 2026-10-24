# Metric definitions and design rationale: SpecialtyPulse

**Owner:** Kristen Martino
**Status:** Portfolio implementation; no external certification or executive approval recorded.

The filename is retained for existing links. Earlier versions used example approval roles and dates without distinguishing them from actual sign-off. Those entries have been removed. The definitions below document implementation choices, not stakeholder interviews or approved business policy.

## 1. Average Medicare payment

At specialty × procedure × year grain:

`SUM(avg_medicare_payment × total_services) / SUM(total_services)`

Volume weighting gives each billed service equal weight. A simple provider average gives small and large providers equal weight; standardized payment answers a separate geographic-adjustment question. Neither is interchangeable with this measure. The bundled demo uses synthetic records following the CMS PUF schema, not a population estimate.

## 2. Payment-to-charge ratio

`avg_medicare_payment / avg_submitted_charge`, null when charge is zero.

This ratio uses actual Medicare payment, not the allowed amount. Specialty benchmarks average procedure-level ratios. A ratio of totals or a volume-weighted ratio could produce a different specialty result. Submitted charges do not measure operating costs, so the ratio is not a practice profit margin.

## 3. Year-over-year changes

`(current - prior) / prior` for service volume and average payment; null for a base year, missing consecutive year or zero denominator.

Specialty-level average procedure changes can reflect service mix and sampling. They should not be presented as a uniform reimbursement-rate cut.

## 4. Reimbursement Pressure Index

`0.30 × compression + 0.30 × trajectory + 0.25 × volume + 0.15 × market_size`

The component scores are bounded to 0–100:

- Compression: `(1 - avg_ptcr) × 100`.
- Trajectory: `50 + ((prior_ptcr - avg_ptcr) / prior_ptcr) × 500`; 50 when there is no prior benchmark.
- Volume: `50 + avg_yoy_volume_change × 500`; 50 when the change is absent.
- Market size: provider count relative to the maximum across benchmark rows.

The weights are project-defined assumptions. Equal weighting and compression-only ranking are plausible alternatives. No stakeholder-consensus claim or sales-outcome validation supports the chosen weights.

Score bands: **High pressure** ≥70; **Elevated pressure** ≥50; **Moderate pressure** ≥30; **Low pressure** <30. These describe the heuristic, not purchase probability or sales urgency.

## 5. Payment outlier

Flagged when a procedure's payment-to-charge ratio is more than two standard deviations below its specialty mean for that year. The reporting notebook uses sample standard deviation.

The displayed `payment_vs_specialty_pct` is a separate measure: `(procedure payment - blended specialty payment) / blended specialty payment`. Its sign determines above/below wording. A flagged ratio does not imply an above-average payment. The blended average is not a clinically comparable procedure benchmark.

## Additional comparison measures

| Measure | Definition | Limitation |
|---|---|---|
| Pressure-weighted pipeline | Deal amount × specialty pressure score ÷ 100 | Heuristic comparison, not a validated pipeline value or forecast. The legacy column name `market_validated_amount` is retained for Domo compatibility. |
| Next-year payment-to-charge estimate | Current ratio + mean historical annual ratio change | Linear extrapolation; the variability label is not a statistical confidence interval. |
| Adoption rate | Distinct users with a session in the displayed period ÷ configured users | Standalone usage is synthetic and does not establish product adoption. |

## Validation required for operational use

Reconcile complete source releases, compare aggregation alternatives, evaluate the score against outcomes and obtain actual metric-owner approval. Policy verification requires a configured Domo instance and tests as intended user accounts. The public dashboard presents example access rules and assignments, not passing check results or live security assurance.

## Reproducible calculation evidence

The [payment check](verification/payment-check.md) reconciles 57 raw rows and
3,777 services to the actual displayed $104.91 mart row. Independent Decimal
tests cover all 870 mart rows; CI re-executes the shared local Spark path.
2021–2022 are constructed scenarios. This execution does not establish
Databricks, Airflow, Domo enforcement or clinical/business outcome validity.
