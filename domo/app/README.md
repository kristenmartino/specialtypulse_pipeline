# SpecialtyPulse React dashboard

Five views support specialty payment review, procedure comparisons, synthetic
sales context, sample usage and illustrative access assignments. The historical
`domo/app` directory remains the Vercel project root; **Domo is not a dependency**.

```sh
npm ci
npm test
npm run build:web
npm start
```

Both build commands write the standalone site to `dist/`. There are no model
calls, AI endpoints or external BI runtime calls. Browser calculations use the
validated mart in `src/data/sourceData.json`.

`generate:data` verifies the recorded local Spark inputs/code/output and, when
`data/dashboard_release.json` is present, its selected Databricks export and run
receipt. All business values must match the reconciled synthetic baseline.
Airflow selects versioned exports; publishing the website requires a release
build and deployment. [Deployment details](../../deployment/README.md).

The Markdown brief includes the selected export/receipt, versioned input sources,
sales CSV, metric definitions and comparison route. Drafts last until reload;
downloading saves a copy without sending or assigning it. The five-pair human
comparison remains pending.

Access examples are proposed rules with synthetic assignments. This public site
does not authenticate users or enforce those rules. Usage is synthetic. Regional
access remains a design example requiring state-level outputs and access tests.
