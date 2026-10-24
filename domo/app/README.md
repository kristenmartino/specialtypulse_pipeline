# SpecialtyPulse dashboard

A five-page React app for reimbursement comparisons, procedure detail, synthetic pipeline comparisons, synthetic usage and example Domo access policies.

## Data and verification boundaries

The standalone build computes reimbursement benchmarks from a bundled pipeline sample (CY2021–2023). Sales and usage data are synthetic. Governance assignments and pass results are illustrative; page load does not run policy checks or create a verification timestamp. In a configured Domo runtime, the data bridge reads DataSets and displays recorded check results. Those results still require review of their timestamp and intended-user access testing.

## Summaries and AI

Chart callouts and the collapsible dashboard summary are computed. All active-pipeline totals and specialty shares are available in the summary. Its optional AI selector receives these facts and chooses a review task from a fixed catalog. Invalid task IDs, evidence IDs, extra prose or truncated responses are rejected. Only catalog text and computed evidence are displayed. The policy summary is deterministic and makes no model call.

Pressure-weighted pipeline is deal amount × pressure score ÷ 100, not a forecast or validated deal value. The legacy field `market_validated_amount` remains for Domo compatibility. Score bands describe pressure rather than commercial opportunity. Metric definitions and limitations are in `../../docs/METRIC_CERTIFICATION_LOG.md`.

## Local development

```bash
cd domo/app

# Install dependencies
npm install

# Start local dev server (uses mock data — no Domo connection needed)
npm start
# Opens http://localhost:3000
```

The app runs in mock mode locally — the `domoFetch()` function returns
computed sample benchmarks and static governance/usage examples when `window.domo` is not
present. Configure real DataSet bindings in the Domo manifest to use a Domo deployment.

---

## Standalone web deployment (Vercel)

The app is dual-mode by design: when `window.domo` is absent, `domoFetch()`
serves representative data from `mockData.js`, so the full five-page dashboard
runs anywhere static files can be hosted.

```bash
# Build for the web (outputs to dist/ — the Domo build artifacts at the
# app root are untouched)
npm run build:web
```

Deploying on Vercel: set the project root to `domo/app` — `vercel.json`
points the build at `npm run build:web` and serves `dist/`. The optional AI focus-selection
feature routes through `api/anthropic/v1/messages.js` (an Edge function that
keeps the key server-side and restricts model, token count and prompt prefix; this is not authentication);
set `ANTHROPIC_API_KEY` in the Vercel project to enable it. Without the key,
the button degrades to a clear "not configured" message.

A footer note on the standalone build discloses that it runs on
representative data and that the Domo integration requires a configured runtime.

---

## Running inside Domo (ryuu)

```bash
# Install Domo CLI
npm install -g ryuu

# Login to your Domo instance
domo login
# Enter your Domo instance URL (e.g. yourcompany.domo.com)
# Authenticate via browser

# Update manifest.json with your real DataSet IDs
# Replace REPLACE_WITH_PDP_CONFIG_DATASET_ID with the DataSet ID
# from uploading pdp_config.csv to Domo
# Replace REPLACE_WITH_VERIFY_RESULTS_DATASET_ID with the ID
# printed by pdp_verify_writer.py on first run

# Start local dev with live Domo DataSet connection
domo dev
# Opens proxy connecting to your real Domo DataSets

# Build for production
npm run build

# Publish to Domo
domo publish
```

After publishing, find the app in Domo App Store > My Apps.
Add it to a Page like any other card.

---

## DataSets required

Two DataSets must exist in your Domo instance before the app works:

**1. pdp_config**
Created by: uploading `domo/pdp/pdp_config.csv` as a Domo DataSet
Columns: `email`, `role`, `filter_dimension`, `filter_values`, `notes`

**2. pdp_verify_results**
Created by: running `python domo/pdp/pdp_verify_writer.py`
(Creates the DataSet automatically on first run and prints the ID)
Columns: `check_name`, `passed`, `message`, `run_at`

Once both exist, update their IDs in `manifest.json` and run `domo dev`.

---

## Optional AI focus selection

The dashboard summary offers **Suggest a review focus** when the deployment reports AI availability. The non-streaming request uses Claude with a 200-token response budget. The key remains in the Vercel Edge function or configured Domo App Proxy.

The model returns a task ID and evidence IDs. The client accepts only an available task with its exact supporting IDs. It displays catalog text and computed observations, never model-authored prose. The policy summary does not use AI.

## Verification flow

`pdp_setup.py` configures policies. `pdp_verify_writer.py` records API check results in a Domo DataSet. A configured Domo app reads those recorded results; the public app uses examples instead. CI invokes the live writer only when Domo credentials are available and otherwise performs syntax checks. Neither a sample pass nor a syntax check establishes live row-level access.

## Checks

```bash
npm test
npm run build
npm run build:web
node scripts/verify-index.js
```
