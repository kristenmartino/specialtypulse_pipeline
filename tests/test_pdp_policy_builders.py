"""Regression tests import the deployed builders and real config; no copied logic."""
import importlib
from pathlib import Path

import pytest

from domo.pdp import pdp_setup

CONFIG = Path(__file__).parents[1] / "domo/pdp/pdp_config.csv"


def test_all_rows_builder_uses_numeric_ids_and_open_policy():
    assert pdp_setup.build_all_rows_policy("executives", [12, 13]) == {
        "name": "executives", "type": "open", "users": [12, 13], "filters": [],
    }


def test_specialty_builder_emits_the_deployed_filter_contract():
    assert pdp_setup.build_specialty_policy("derm", "Dermatology", [42]) == {
        "name": "derm", "type": "user", "users": [42],
        "filters": [{"column": "provider_specialty", "values": ["Dermatology"],
                     "operator": "EQUALS", "not": False}],
    }


def test_regional_builder_keeps_multiple_states_in_one_filter():
    assert pdp_setup.build_regional_policy("northeast", ["NY", "NJ"], [51, 52]) == {
        "name": "northeast", "type": "user", "users": [51, 52],
        "filters": [{"column": "provider_state", "values": ["NY", "NJ"],
                     "operator": "EQUALS", "not": False}],
    }


def test_real_config_is_grouped_and_assigned_by_the_deployed_setup():
    config = pdp_setup.load_config(str(CONFIG))
    ids = {row["email"].lower(): index for index, row in enumerate(config, 1)}

    class FakeDomo:
        def __init__(self):
            self.created = []

        def get_dataset_columns(self, dataset_id):
            return {"provider_specialty", "provider_state"}

        def get_pdp_policies(self, dataset_id):
            return []

        def create_pdp_policy(self, dataset_id, policy):
            self.created.append(policy)
            return {"id": len(self.created)}

    domo = FakeDomo()
    pdp_setup.setup_pdp("test-output", config, ids, domo)
    assert len(config) == 13
    assert len(domo.created) == 12
    assigned = [user for policy in domo.created for user in policy["users"]]
    assert sorted(assigned) == sorted(ids.values())
    assert len(assigned) == len(set(assigned))
    policies = {policy["name"]: policy for policy in domo.created}
    executives = [ids[row["email"].lower()] for row in config if row["role"] == "executive"]
    assert policies["all_rows_executive"] == pdp_setup.build_all_rows_policy("all_rows_executive", executives)
    derm = next(row for row in config if row["filter_values"] == "Dermatology")
    assert policies["specialty_dermatology"] == pdp_setup.build_specialty_policy("specialty_dermatology", "Dermatology", [ids[derm["email"].lower()]])
    assert len([policy for policy in domo.created if policy["type"] == "open"]) == 2
    assert len([policy for policy in domo.created if policy["filters"] and policy["filters"][0]["column"] == "provider_state"]) == 5


def test_import_needs_no_credentials_and_makes_no_api_calls(monkeypatch):
    for name in ("DOMO_CLIENT_ID", "DOMO_CLIENT_SECRET", "DOMO_DATASET_ID"):
        monkeypatch.delenv(name, raising=False)

    def unexpected(*args, **kwargs):
        pytest.fail("Import attempted an HTTP request")

    monkeypatch.setattr(pdp_setup.requests, "get", unexpected)
    monkeypatch.setattr(pdp_setup.requests, "post", unexpected)
    importlib.reload(pdp_setup)
