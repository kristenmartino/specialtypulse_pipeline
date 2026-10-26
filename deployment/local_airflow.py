"""Plan or install a macOS user service using the existing secure CLI OAuth profile."""
import argparse
import json
import os
import plistlib
import re
import subprocess
import sys
import time
from pathlib import Path

LABEL = "ai.kristenmartino.specialtypulse-airflow"


def service_config(root, repository, host, profile, job_id, port=8087):
    root, repository = Path(root).resolve(), Path(repository).resolve()
    if not host.startswith("https://") or not profile or int(job_id) <= 0 or not 1024 <= port <= 65535:
        raise ValueError("Invalid workspace/profile/job/port")
    address = f"http://127.0.0.1:{port}"
    runtime = root / "airflow-host"
    return {
        "Label": LABEL,
        "ProgramArguments": [str(root / "airflow-venv/bin/airflow"), "standalone"],
        "WorkingDirectory": str(repository),
        "EnvironmentVariables": {
            "PATH": str(root / "airflow-venv/bin") + ":/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin",
            "PYTHONPATH": str(repository), "AIRFLOW_HOME": str(runtime),
            # Avoid macOS CoreFoundation proxy discovery inside forked task
            # workers. This is loopback-only; TLS remains enabled for Databricks.
            "NO_PROXY": "127.0.0.1,localhost",
            "AIRFLOW__CORE__DAGS_FOLDER": str(repository / "airflow/dags"),
            "AIRFLOW__CORE__LOAD_EXAMPLES": "false", "AIRFLOW__CORE__DAGS_ARE_PAUSED_AT_CREATION": "true",
            "AIRFLOW__CORE__SIMPLE_AUTH_MANAGER_USERS": "portfolio:admin", "AIRFLOW__CORE__PARALLELISM": "4",
            "AIRFLOW__API__HOST": "127.0.0.1", "AIRFLOW__API__PORT": str(port),
            "AIRFLOW__API__BASE_URL": address, "AIRFLOW__CORE__EXECUTION_API_SERVER_URL": address + "/execution/",
            "DATABRICKS_HOST": host.rstrip("/"), "DATABRICKS_CONFIG_PROFILE": profile,
            "SPECIALTYPULSE_DATABRICKS_JOB_ID": str(job_id), "SPECIALTYPULSE_DATA_DIR": str(repository / "data"),
            "SPECIALTYPULSE_RECEIPTS_DIR": str(root / "airflow-host-receipts"),
        },
        "RunAtLoad": True, "KeepAlive": True, "ThrottleInterval": 20,
        "StandardOutPath": str(runtime / "service.stdout.log"), "StandardErrorPath": str(runtime / "service.stderr.log"),
    }


def install(config, root):
    if sys.platform != "darwin":
        raise RuntimeError("This user-service installer requires macOS")
    if not Path(config["ProgramArguments"][0]).is_file():
        raise RuntimeError("Install the isolated Airflow environment first")
    proxies = subprocess.check_output(["scutil", "--proxy"], text=True)
    if any(int(flag) for flag in re.findall(r"\w*Enable\s*:\s*(\d+)", proxies)):
        raise RuntimeError("A macOS system proxy is enabled; configure an explicit service proxy before installing")
    root = Path(root)
    for path in [root / "airflow-host", root / "airflow-host-receipts"]:
        path.mkdir(mode=0o700, parents=True, exist_ok=True)
    target = Path.home() / "Library/LaunchAgents" / (LABEL + ".plist")
    target.parent.mkdir(exist_ok=True)
    if target.exists():
        previous = plistlib.loads(target.read_bytes())
        if previous.get("WorkingDirectory") != config["WorkingDirectory"]:
            raise RuntimeError("Existing service belongs to another checkout")
    target.write_bytes(plistlib.dumps(config))
    target.chmod(0o600)
    subprocess.run(["launchctl", "bootout", f"gui/{os.getuid()}/{LABEL}"], capture_output=True, check=False)
    # launchd can take a moment to finish unloading a previous standalone process.
    for attempt in range(5):
        result = subprocess.run(["launchctl", "bootstrap", f"gui/{os.getuid()}", str(target)], capture_output=True)
        if result.returncode == 0:
            return str(target)
        if attempt < 4:
            time.sleep(1)
    raise RuntimeError("launchd could not start Airflow; inspect the service state and port before retrying")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, required=True)
    parser.add_argument("--repository", type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument("--host", required=True)
    parser.add_argument("--profile", default="SPECIALTYPULSE")
    parser.add_argument("--job-id", required=True, type=int)
    parser.add_argument("--port", type=int, default=8087)
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    config = service_config(args.root, args.repository, args.host, args.profile, args.job_id, args.port)
    print(json.dumps({"installed": install(config, args.root)} if args.apply else config, indent=2))


if __name__ == "__main__":
    main()
