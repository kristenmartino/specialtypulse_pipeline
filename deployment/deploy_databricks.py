"""Plan by default; --apply uploads pinned fixtures and creates a serverless job."""
import argparse
import base64
import hashlib
import io
import json
import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
JOB_NAME = "specialtypulse_synthetic_pipeline"


def plan(catalog, prefix, workspace_root):
    for identifier in (catalog, prefix):
        if not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", identifier):
            raise ValueError("Catalog and schema prefix must be simple identifiers")
    if not workspace_root.startswith("/Workspace/Users/") or ".." in workspace_root:
        raise ValueError("Use a dedicated /Workspace/Users/... workspace path")
    revision = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip()
    receipt = json.loads((ROOT / "data/pipeline_run.json").read_text())
    files = [f"data/sample_{year}_puf_10k.csv" for year in (2021, 2022, 2023)] + [
        "data/sample_mart_reimbursement_trends.csv", "databricks/notebooks/pipeline_transforms.py",
        "databricks/notebooks/05_cloud_pipeline.py", "deployment/contracts.py", "deployment/__init__.py",
    ]
    manifest = {
        "source_revision": revision,
        "file_sha256": {name: hashlib.sha256((ROOT / name).read_bytes()).hexdigest() for name in files},
        "expected_raw_rows": receipt["raw_rows"], "expected_staging_rows": receipt["staging_rows"],
        "expected_mart_rows": receipt["mart_rows"],
        "data_scope": "Synthetic 2023 base and generated 2021–22 comparison scenarios",
    }
    for name, expected in receipt["source_sha256"].items():
        if manifest["file_sha256"][name] != expected:
            raise ValueError("Fixture inputs differ from the reconciled local run")
    if manifest["file_sha256"]["databricks/notebooks/pipeline_transforms.py"] != receipt["code_sha256"]["databricks/notebooks/pipeline_transforms.py"]:
        raise ValueError("Shared transformations differ from the reconciled run")
    task = {"task_key": "build_and_verify_delta", "timeout_seconds": 1800, "max_retries": 0,
            "notebook_task": {"notebook_path": workspace_root + "/databricks/notebooks/05_cloud_pipeline",
                              "source": "WORKSPACE", "base_parameters": {
                                  "catalog": catalog, "schema_prefix": prefix, "workspace_root": workspace_root,
                                  "source_revision": revision, "run_key": "{{job.run_id}}",
                              }}}
    job = {"name": JOB_NAME, "max_concurrent_runs": 1, "timeout_seconds": 1800,
           "tags": {"project": "specialtypulse", "data": "synthetic", "managed_by": "specialtypulse_deploy"},
           "tasks": [task]}
    return {"catalog": catalog, "schema_prefix": prefix, "workspace_root": workspace_root,
            "volume_path": f"/Volumes/{catalog}/{prefix}_raw/fixtures", "manifest": manifest, "job": job}


def apply(client, prepared, state_path):
    from databricks.sdk.errors import NotFound, ResourceAlreadyExists
    from databricks.sdk.service.catalog import VolumeType
    from databricks.sdk.service.jobs import JobSettings
    from databricks.sdk.service.workspace import ImportFormat, Language

    client.catalogs.get(prepared["catalog"])
    for suffix in ("raw", "staging", "marts"):
        name = prepared["schema_prefix"] + "_" + suffix
        try:
            client.schemas.get(f"{prepared['catalog']}.{name}")
        except NotFound:
            client.schemas.create(name=name, catalog_name=prepared["catalog"], comment="Synthetic SpecialtyPulse portfolio data")
    try:
        client.volumes.read(f"{prepared['catalog']}.{prepared['schema_prefix']}_raw.fixtures")
    except NotFound:
        try:
            client.volumes.create(prepared["catalog"], prepared["schema_prefix"] + "_raw", "fixtures", VolumeType.MANAGED)
        except ResourceAlreadyExists:
            pass
    for relative in prepared["manifest"]["file_sha256"]:
        path = ROOT / relative
        if relative.endswith(".csv"):
            client.files.upload(prepared["volume_path"] + "/" + path.name, io.BytesIO(path.read_bytes()), overwrite=True)
        else:
            target = prepared["workspace_root"] + "/" + relative
            is_notebook = path.name == "05_cloud_pipeline.py"
            client.workspace.mkdirs(str(Path(target).parent))
            if is_notebook:
                target = target[:-3]
            client.workspace.import_(target, content=base64.b64encode(path.read_bytes()).decode(),
                                     format=ImportFormat.SOURCE if is_notebook else ImportFormat.RAW,
                                     language=Language.PYTHON if is_notebook else None, overwrite=True)
    client.files.upload(prepared["volume_path"] + "/deployment-manifest.json",
                        io.BytesIO((json.dumps(prepared["manifest"], indent=2) + "\n").encode()), overwrite=True)
    settings = JobSettings.from_dict(prepared["job"])
    if state_path.exists():
        state = json.loads(state_path.read_text())
        if state["host"] != client.config.host or state["workspace_root"] != prepared["workspace_root"]:
            raise ValueError("Saved deployment state belongs to another target")
        job_id = state["job_id"]
        existing = client.jobs.get(job_id).settings
        if existing.tags.get("managed_by") != "specialtypulse_deploy":
            raise ValueError("Refusing to replace an unmanaged job")
        client.jobs.reset(job_id, settings)
    else:
        job_id = client.jobs.create(**{key: value for key, value in vars(settings).items() if value is not None}).job_id
    state = {"host": client.config.host, "job_id": job_id, "workspace_root": prepared["workspace_root"],
             "source_revision": prepared["manifest"]["source_revision"],
             "status": "deployed_not_run", "job_url": f"{client.config.host}/jobs/{job_id}"}
    state_path.write_text(json.dumps(state, indent=2) + "\n")
    return state


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--catalog", default="main")
    parser.add_argument("--schema-prefix", default="specialtypulse")
    parser.add_argument("--workspace-root", required=True)
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--state", type=Path, default=ROOT / "deployment/.state.json")
    args = parser.parse_args()
    prepared = plan(args.catalog, args.schema_prefix, args.workspace_root)
    if args.apply:
        from databricks.sdk import WorkspaceClient
        prepared = apply(WorkspaceClient(), prepared, args.state)
    print(json.dumps(prepared, indent=2))


if __name__ == "__main__":
    main()
