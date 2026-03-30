# SpecialtyPulse PDP Governance — Domo App

A native Domo App that displays the PDP security state for SpecialtyPulse.
Lives inside your Domo instance. Reads live DataSets via `domo.js`.

---

## What it shows

**Role distribution** — count of users per role (finance admin, executive,
specialty analyst, regional sales) with color-coded cards.

**Verify check status** — live results from `pdp_verify_writer.py` showing
all 6 governance checks with pass/fail indicators and messages.

**Access policy matrix** — full table of every user, their role, filter
dimension, and exact access scope (all rows / specialty filter / state chips).

**AI governance summary** — click to generate a plain-English summary of
the current security state using Claude, streamed in real time.

---

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
sample data from `MOCK_DATA` in `App.jsx` when `window.domo` is not
present. Swap to real data by updating `MOCK_DATA` to match your actual
DataSet structure.

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
# from pdp_setup.py, and REPLACE_WITH_VERIFY_RESULTS_DATASET_ID
# with the ID printed by pdp_verify_writer.py

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

## The AI explain feature

The "Explain current policy state" button calls the Anthropic API via a
server-side proxy using streaming. The response appears word-by-word.

The API key is never exposed in the client bundle:
- **In Domo**: requests route through `/domo/proxy/v1/messages` (Domo's
  built-in server-side proxy)
- **Local dev**: requests route through webpack devServer proxy at
  `/api/anthropic/v1/messages`, which injects the key from the
  `ANTHROPIC_API_KEY` environment variable

```bash
# To enable AI explain locally:
export ANTHROPIC_API_KEY="your-key"
npm start
```

The prompt is built from live DataSet state — it summarizes role counts,
specialties covered, regions covered, and verify check status into a
governance summary suitable for a VP of Data Engineering.

---

## Architecture note

```
pdp_config.csv (version controlled in Git)
    ↓
pdp_setup.py → creates Domo PDP policies via API
    ↓
pdp_verify_writer.py → checks policies, writes results to Domo DataSet
    ↓
Domo App reads both DataSets via domo.js → displays live state
    ↓
GitHub Actions runs pdp_verify_writer.py nightly → badge stays green
```
