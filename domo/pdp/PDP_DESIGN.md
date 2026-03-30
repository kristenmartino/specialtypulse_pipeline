# PDP Security Design — SpecialtyPulse

Personalized Data Permissions (PDP) is Domo's row-level security system.
It filters DataSet rows per user or group at query time — users see the same
dashboard but only the data their role permits.

This document defines the security model for SpecialtyPulse. It is the
governance contract for who sees what, and why.

---

## Why PDP matters here

The SpecialtyPulse mart contains Medicare reimbursement data across every
specialty and state. In a healthcare SaaS company like ModMed, not every
team should see every specialty's data:

- A **product manager for Dermatology** should see dermatology data, not
  orthopedics competitor benchmarks
- A **regional sales rep** should see data for their territory states, not
  the whole country
- A **Finance analyst** should see all data for cost modeling
- An **executive** should see aggregate views, not provider-level detail

Without PDP, everyone with dashboard access sees everything. That's the
default Domo state and the most common governance failure in enterprise Domo
instances.

---

## The critical technical gotcha

**PDP cannot be applied to DataFlow inputs — only to outputs.**

This is the #1 PDP mistake in Domo implementations. If you apply PDP to
`specialtypulse_mart_reimbursement_trends` (the input DataSet) and then
run a SQL DataFlow on top of it, the DataFlow strips the PDP policies and
outputs an unfiltered DataSet.

The correct pattern:
1. No PDP on the input DataSet
2. DataFlow runs on the full unfiltered input
3. PDP policies applied to the OUTPUT DataSet
4. Dashboard cards built on the output DataSet — PDP enforced at card render time

This is documented in `pdp_setup.py` and enforced via the Domo API.

---

## Security model

Four roles, two filter dimensions:

| Role | Specialty filter | State filter | Notes |
|---|---|---|---|
| `specialty_analyst` | Own specialty only | All states | Product/clinical team |
| `regional_sales` | All specialties | Own region states | Sales team |
| `finance_admin` | All specialties | All states | Finance, no filter |
| `executive` | All specialties | All states | C-suite, no filter |

**Filter dimensions:**
- `provider_specialty` — filters mart rows to the user's assigned specialty
- `provider_state` — filters mart rows to states in the user's region

**All Rows policy** — finance_admin and executive get the All Rows policy,
meaning no filtering. This is Domo's built-in mechanism for admin access.

---

## State → region mapping

Used by regional_sales to define which states each rep covers.

```
Northeast:  CT, ME, MA, NH, NJ, NY, PA, RI, VT
Southeast:  AL, AR, FL, GA, KY, LA, MS, NC, SC, TN, VA, WV
Midwest:    IL, IN, IA, KS, MI, MN, MO, NE, ND, OH, SD, WI
Southwest:  AZ, NM, OK, TX
West:       AK, CA, CO, HI, ID, MT, NV, OR, UT, WA, WY
```

---

## Implementation files

```
domo/pdp/
├── PDP_DESIGN.md           ← This file
├── pdp_setup.py            ← Python script: creates PDP policies via Domo API
├── pdp_config.csv          ← Configuration file: user → role → filter values
├── pdp_verify.py           ← Verification script: confirms policies applied correctly
└── pdp_verify_writer.py    ← Extended verify: checks + writes results to Domo DataSet
```

---

## Running the PDP setup

```bash
# 1. Edit pdp_config.csv with your actual Domo user emails

# 2. Set environment variables (or use Databricks Secrets)
export DOMO_CLIENT_ID="your-client-id"
export DOMO_CLIENT_SECRET="your-client-secret"
export DOMO_DATASET_ID="your-output-dataset-id"

# 3. Run setup
python domo/pdp/pdp_setup.py

# 4. Verify
python domo/pdp/pdp_verify.py

# 5. Write results to Domo (for the governance app)
python domo/pdp/pdp_verify_writer.py
```

---

## Testing PDP is working

After running pdp_setup.py:

1. Log in to Domo as a specialty_analyst user
2. Open the SpecialtyPulse dashboard
3. Confirm you only see rows for your assigned specialty
4. Log in as finance_admin
5. Confirm you see all specialties

If a specialty_analyst sees all rows, PDP is applied to the wrong DataSet
(the input instead of the output). Move PDP to the DataFlow output DataSet.

---

## The governance argument for this in the interview

In a typical Domo instance without this setup:
- Every person with dashboard access sees all specialties and all states
- A sales rep sees competitor specialty data they shouldn't
- A product manager can see unrelated specialty performance data
- There's no audit trail of who accessed what

With this setup:
- Row-level filtering enforced automatically at render time
- Adding a new user is a CSV update + script run, not manual policy management
- The configuration file is version-controlled in Git — governance as code
- The verify script can be run in CI to confirm policies haven't drifted

This is exactly the kind of governance work that matters in a company
managing healthcare data at scale.
