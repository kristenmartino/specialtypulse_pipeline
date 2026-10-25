"""Validate a Databricks export, then atomically select it for the React build."""
import hashlib
import json
import os
import re
import tempfile
from pathlib import Path

from deployment.contracts import assert_matches


def publish_export(data_root, csv_content, receipt):
    data_root = Path(data_root)
    run_key = str(receipt.get("run_key", ""))
    if receipt.get("status") != "verified" or not re.fullmatch(r"[0-9]+", run_key):
        raise ValueError("No verified Databricks run receipt")
    if hashlib.sha256(csv_content.encode()).hexdigest() != receipt.get("export_sha256"):
        raise ValueError("Export bytes do not match the Databricks receipt")
    checked = assert_matches(csv_content, (data_root / "sample_mart_reimbursement_trends.csv").read_text())
    if checked["rows"] != receipt.get("mart_rows") or checked["business_sha256"] != receipt.get("mart_business_sha256"):
        raise ValueError("Export business values do not match the Databricks receipt")
    relative = Path("releases") / f"databricks-{run_key}"
    target = data_root / relative
    target.mkdir(parents=True, exist_ok=True)
    files = {"mart.csv": csv_content, "receipt.json": json.dumps(receipt, indent=2) + "\n"}
    for name, content in files.items():
        path = target / name
        if path.exists() and path.read_text() != content:
            raise ValueError("Refusing to change an existing run's release artifact")
        path.write_text(content)
    release = {"engine": "Databricks Spark / Unity Catalog Delta", "run_id": run_key,
               "mart": str(relative / "mart.csv"), "receipt": str(relative / "receipt.json"),
               "executed_at": receipt["executed_at"], "source_revision": receipt["source_revision"],
               "export_sha256": receipt["export_sha256"], "rows": checked["rows"],
               "publication": "Selected for the next React build; website publication requires a release deployment"}
    with tempfile.NamedTemporaryFile(mode="w", dir=data_root, delete=False) as output:
        json.dump(release, output, indent=2)
        output.write("\n")
        temporary = output.name
    os.replace(temporary, data_root / "dashboard_release.json")
    return release
