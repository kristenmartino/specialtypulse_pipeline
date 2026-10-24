"""Exercise the real setup function offline; never import its credential bootstrap."""
import pytest
from domo.pdp.pdp_setup import setup_pdp


class FakeDomo:
    def __init__(self, columns):
        self.columns = columns
        self.events = []

    def get_dataset_columns(self, dataset_id):
        self.events.append("schema")
        return self.columns

    def get_pdp_policies(self, dataset_id):
        self.events.append("policies")
        return [{"id": 123}]

    def delete_pdp_policy(self, dataset_id, policy_id):
        self.events.append("delete")

    def create_pdp_policy(self, dataset_id, policy):
        self.events.append(policy)
        return {"id": 456}


def row(dimension, values=""):
    return {"email": "test@example.com", "role": "regional_sales" if dimension == "provider_state" else "specialty_analyst",
            "filter_dimension": dimension, "filter_values": values}


def test_regional_config_is_rejected_before_any_policy_changes():
    domo = FakeDomo({"provider_specialty", "year"})
    # Even an unresolved user must not hide an incompatible configured filter.
    with pytest.raises(ValueError, match="provider_state"):
        setup_pdp("output", [row("provider_state", "NY")], {}, domo)
    assert domo.events == ["schema"]


def test_specialty_config_can_proceed_on_benchmark_output():
    domo = FakeDomo({"provider_specialty", "year"})
    setup_pdp("output", [row("provider_specialty", "Dermatology")], {"test@example.com": 42}, domo)
    assert domo.events[:3] == ["schema", "policies", "delete"]
    assert domo.events[3]["filters"][0]["column"] == "provider_specialty"


def test_regional_config_needs_state_in_target_output():
    domo = FakeDomo({"provider_specialty", "provider_state", "year"})
    setup_pdp("output", [row("provider_state", "NY,NJ")], {"test@example.com": 42}, domo)
    assert domo.events[3]["filters"][0]["column"] == "provider_state"
    assert domo.events[3]["filters"][0]["values"] == ["NY", "NJ"]
