"""
tests/test_pdp_policy_builders.py

Lightweight tests for PDP policy construction logic.

These tests verify that the governance-as-code model produces
correct policies from the pdp_config.csv. They test the LOGIC
of policy construction, not the Domo API — no live connection needed.

Why this file exists:
  The PDP security model is a core governance artifact.
  Verifying that policies are built correctly from config is
  part of the BI analyst's responsibility — it's governance
  verification, not software engineering.
"""

import csv
import io
import pytest


# ─────────────────────────────────────────────────────────────────────────────
# Policy builder functions (extracted from pdp_setup.py for testability)
# In production, pdp_setup.py would import these from a shared module.
# ─────────────────────────────────────────────────────────────────────────────

VALID_ROLES = {"finance_admin", "executive", "specialty_analyst", "regional_sales"}

VALID_FILTER_DIMENSIONS = {"provider_specialty", "provider_state", "ALL_ROWS"}


def parse_pdp_config(csv_text: str) -> list[dict]:
    """Parse the PDP config CSV into a list of policy dictionaries."""
    reader = csv.DictReader(io.StringIO(csv_text))
    policies = []
    for row in reader:
        policies.append({
            "email": row["email"].strip(),
            "role": row["role"].strip(),
            "filter_dimension": row["filter_dimension"].strip(),
            "filter_values": [
                v.strip() for v in row["filter_values"].split(",") if v.strip()
            ] if row["filter_values"].strip() else [],
        })
    return policies


def build_all_rows_policy(email: str, role: str) -> dict:
    """Build an ALL_ROWS PDP policy (no filters — full access)."""
    return {
        "name": f"specialtypulse_{role}_{email.split('@')[0]}",
        "type": "open",
        "users": [email],
        "filters": [],
    }


def build_filtered_policy(email: str, role: str,
                           dimension: str, values: list[str]) -> dict:
    """Build a filtered PDP policy (row-level security)."""
    return {
        "name": f"specialtypulse_{role}_{email.split('@')[0]}",
        "type": "user",
        "users": [email],
        "filters": [{
            "column": dimension,
            "values": values,
            "operator": "EQUALS",
            "not": False,
        }],
    }


def build_policy_from_config(config_row: dict) -> dict:
    """Route a config row to the correct policy builder."""
    if config_row["filter_dimension"] == "ALL_ROWS":
        return build_all_rows_policy(
            config_row["email"], config_row["role"])
    else:
        return build_filtered_policy(
            config_row["email"], config_row["role"],
            config_row["filter_dimension"], config_row["filter_values"])


def validate_config(policies: list[dict]) -> list[str]:
    """Validate the parsed config. Returns list of error messages."""
    errors = []
    emails_seen = set()

    for i, p in enumerate(policies):
        # Duplicate email check
        if p["email"] in emails_seen:
            errors.append(f"Row {i+1}: duplicate email {p['email']}")
        emails_seen.add(p["email"])

        # Valid role check
        if p["role"] not in VALID_ROLES:
            errors.append(f"Row {i+1}: unknown role '{p['role']}'")

        # Valid filter dimension
        if p["filter_dimension"] not in VALID_FILTER_DIMENSIONS:
            errors.append(
                f"Row {i+1}: unknown filter_dimension '{p['filter_dimension']}'")

        # ALL_ROWS should have no filter values
        if p["filter_dimension"] == "ALL_ROWS" and p["filter_values"]:
            errors.append(
                f"Row {i+1}: ALL_ROWS should have no filter_values")

        # Filtered roles must have filter values
        if p["filter_dimension"] != "ALL_ROWS" and not p["filter_values"]:
            errors.append(
                f"Row {i+1}: {p['filter_dimension']} requires filter_values")

    return errors


# ─────────────────────────────────────────────────────────────────────────────
# Fixtures
# ─────────────────────────────────────────────────────────────────────────────

SAMPLE_CONFIG = """\
email,role,filter_dimension,filter_values,notes
kristen.martino@company.com,finance_admin,ALL_ROWS,,Full access
ceo@company.com,executive,ALL_ROWS,,C-suite
analyst.derm@company.com,specialty_analyst,provider_specialty,Dermatology,Derm team
analyst.gastro@company.com,specialty_analyst,provider_specialty,Gastroenterology,GI team
sales.northeast@company.com,regional_sales,provider_state,"CT,ME,MA,NH,NJ,NY,PA,RI,VT",NE region
"""


@pytest.fixture
def parsed_config():
    return parse_pdp_config(SAMPLE_CONFIG)


# ─────────────────────────────────────────────────────────────────────────────
# Tests
# ─────────────────────────────────────────────────────────────────────────────

class TestConfigParsing:
    """Verify the CSV config parses correctly."""

    def test_parses_correct_row_count(self, parsed_config):
        assert len(parsed_config) == 5

    def test_parses_email(self, parsed_config):
        assert parsed_config[0]["email"] == "kristen.martino@company.com"

    def test_parses_role(self, parsed_config):
        assert parsed_config[0]["role"] == "finance_admin"

    def test_parses_all_rows_dimension(self, parsed_config):
        assert parsed_config[0]["filter_dimension"] == "ALL_ROWS"
        assert parsed_config[0]["filter_values"] == []

    def test_parses_specialty_filter(self, parsed_config):
        assert parsed_config[2]["filter_dimension"] == "provider_specialty"
        assert parsed_config[2]["filter_values"] == ["Dermatology"]

    def test_parses_multi_value_filter(self, parsed_config):
        """Regional sales has comma-separated state list."""
        sales = parsed_config[4]
        assert sales["filter_dimension"] == "provider_state"
        assert len(sales["filter_values"]) == 9
        assert "CT" in sales["filter_values"]
        assert "VT" in sales["filter_values"]


class TestConfigValidation:
    """Verify the config validation catches errors."""

    def test_valid_config_has_no_errors(self, parsed_config):
        errors = validate_config(parsed_config)
        assert errors == []

    def test_catches_duplicate_email(self):
        dupe_config = SAMPLE_CONFIG + \
            "kristen.martino@company.com,executive,ALL_ROWS,,Dupe\n"
        parsed = parse_pdp_config(dupe_config)
        errors = validate_config(parsed)
        assert any("duplicate email" in e for e in errors)

    def test_catches_unknown_role(self):
        bad_config = SAMPLE_CONFIG.replace("finance_admin", "superadmin")
        parsed = parse_pdp_config(bad_config)
        errors = validate_config(parsed)
        assert any("unknown role" in e for e in errors)

    def test_catches_all_rows_with_values(self):
        bad = "email,role,filter_dimension,filter_values,notes\n" \
              "a@b.com,executive,ALL_ROWS,Dermatology,Bad\n"
        parsed = parse_pdp_config(bad)
        errors = validate_config(parsed)
        assert any("ALL_ROWS should have no filter_values" in e for e in errors)

    def test_catches_filtered_without_values(self):
        bad = "email,role,filter_dimension,filter_values,notes\n" \
              "a@b.com,specialty_analyst,provider_specialty,,Missing\n"
        parsed = parse_pdp_config(bad)
        errors = validate_config(parsed)
        assert any("requires filter_values" in e for e in errors)


class TestPolicyBuilders:
    """Verify correct Domo PDP policy structure from config."""

    def test_all_rows_policy_has_open_type(self):
        policy = build_all_rows_policy("ceo@company.com", "executive")
        assert policy["type"] == "open"
        assert policy["filters"] == []
        assert policy["users"] == ["ceo@company.com"]

    def test_all_rows_policy_name_format(self):
        policy = build_all_rows_policy("ceo@company.com", "executive")
        assert policy["name"] == "specialtypulse_executive_ceo"

    def test_filtered_policy_has_user_type(self):
        policy = build_filtered_policy(
            "analyst.derm@company.com", "specialty_analyst",
            "provider_specialty", ["Dermatology"])
        assert policy["type"] == "user"

    def test_filtered_policy_has_correct_filter(self):
        policy = build_filtered_policy(
            "analyst.derm@company.com", "specialty_analyst",
            "provider_specialty", ["Dermatology"])
        assert len(policy["filters"]) == 1
        f = policy["filters"][0]
        assert f["column"] == "provider_specialty"
        assert f["values"] == ["Dermatology"]
        assert f["operator"] == "EQUALS"
        assert f["not"] is False

    def test_regional_policy_has_multiple_values(self):
        states = ["CT", "ME", "MA", "NH", "NJ", "NY", "PA", "RI", "VT"]
        policy = build_filtered_policy(
            "sales.northeast@company.com", "regional_sales",
            "provider_state", states)
        assert len(policy["filters"][0]["values"]) == 9

    def test_build_from_config_routes_all_rows(self, parsed_config):
        policy = build_policy_from_config(parsed_config[0])
        assert policy["type"] == "open"

    def test_build_from_config_routes_filtered(self, parsed_config):
        policy = build_policy_from_config(parsed_config[2])
        assert policy["type"] == "user"
        assert policy["filters"][0]["column"] == "provider_specialty"

    def test_all_configs_produce_valid_policies(self, parsed_config):
        """Every row in the config should produce a policy with
        a name, type, users list, and filters list."""
        for row in parsed_config:
            policy = build_policy_from_config(row)
            assert "name" in policy
            assert "type" in policy
            assert "users" in policy
            assert "filters" in policy
            assert len(policy["users"]) == 1
            assert policy["users"][0] == row["email"]


class TestModMedSpecialtyAlignment:
    """Verify the config aligns to ModMed's specialty verticals."""

    MODMED_SPECIALTIES = {
        "Dermatology", "Gastroenterology", "Ophthalmology",
        "Orthopedic Surgery", "Otolaryngology",
    }

    def test_specialty_analysts_cover_modmed_verticals(self, parsed_config):
        """At least some ModMed specialties should be represented."""
        specialty_values = set()
        for row in parsed_config:
            if row["role"] == "specialty_analyst":
                specialty_values.update(row["filter_values"])
        # The sample config has Dermatology and Gastroenterology
        assert specialty_values & self.MODMED_SPECIALTIES

    def test_no_generic_specialties(self, parsed_config):
        """Cardiology and Neurology are NOT ModMed verticals."""
        all_values = set()
        for row in parsed_config:
            all_values.update(row["filter_values"])
        assert "Cardiology" not in all_values
        assert "Neurology" not in all_values
