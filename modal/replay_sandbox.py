"""
Time-travel re-run (SPEC §9).

Reconstructs the target repo exactly as it was BEFORE step N, re-runs Codex with
the corrected assumption appended to the original task, runs the test suite plus
the production simulator, and returns the new diff.

Two entry points:
  modal run modal/replay_sandbox.py --trace <session_id> --from-step 14
  POST to the deployed web endpoint (the UI's "Re-run from step N" button)

Local files (target app + traces) are copied into the image at build time, so
`modal deploy` snapshots whatever is on disk. Re-deploy after recording a new
golden trace.
"""

import json
import os
import subprocess
import time
from pathlib import Path

import modal

APP_NAME = "afr-replay"
REPO_DIR = "/work/target-app"
TRACES_DIR = "/work/traces"

here = Path(__file__).parent
project_root = here.parent

image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("git", "curl", "ca-certificates")
    .run_commands(
        "curl -fsSL https://deb.nodesource.com/setup_20.x | bash -",
        "apt-get install -y nodejs",
        "npm install -g @openai/codex",
    )
    .add_local_dir(project_root / "demo" / "target-app", REPO_DIR, copy=True, ignore=["node_modules", "data"])
    .add_local_dir(project_root / "traces", f"{TRACES_DIR}/live", copy=True, ignore=["*.db*"])
    .add_local_dir(project_root / "demo" / "traces", f"{TRACES_DIR}/golden", copy=True, ignore=["*.db*"])
)

app = modal.App(APP_NAME, image=image)
secret = modal.Secret.from_name("openai-secret")


def _run(cmd, cwd, timeout=240):
    started = time.time()
    proc = subprocess.run(cmd, cwd=cwd, shell=isinstance(cmd, str), capture_output=True, text=True, timeout=timeout)
    return {
        "cmd": cmd if isinstance(cmd, str) else " ".join(cmd),
        "exit_code": proc.returncode,
        "stdout": proc.stdout[-6000:],
        "stderr": proc.stderr[-4000:],
        "duration_s": round(time.time() - started, 1),
    }


def _load_trace(session_id):
    """Find <session>.enriched.jsonl (preferred) or <session>.jsonl in either trace dir."""
    for root in (f"{TRACES_DIR}/live", f"{TRACES_DIR}/golden"):
        for name in (f"{session_id}.enriched.jsonl", f"{session_id}.jsonl"):
            path = Path(root) / name
            if path.exists():
                events = [json.loads(line) for line in path.read_text().splitlines() if line.strip()]
                return events, root
    raise FileNotFoundError(f"no trace for session {session_id} in {TRACES_DIR}")


def _reconstruct(events, trace_root, session_id, from_step):
    """
    Restore every file to its content as of step (from_step - 1) using the
    content-addressed blobs the recorder wrote. Exact, and no diff math needed.
    """
    latest = {}
    for e in events:
        if e.get("type") != "file_edit" or e["step"] >= from_step:
            continue
        blob = e["data"].get("blob")
        if blob:
            latest[e["data"]["path"]] = blob

    restored = []
    blob_dir = Path(trace_root) / session_id / "blobs"
    for rel_path, blob in latest.items():
        src = blob_dir / blob
        if not src.exists():
            continue
        dest = Path(REPO_DIR) / rel_path
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_text(src.read_text())
        restored.append(rel_path)
    return restored


@app.function(secrets=[secret], timeout=600, cpu=2.0)
def replay(session_id: str, from_step: int, correction: str, model: str = None):
    events, trace_root = _load_trace(session_id)
    start_event = next(e for e in events if e["type"] == "session_start")
    task = start_event["data"]["task"]

    steps = []
    restored = _reconstruct(events, trace_root, session_id, from_step)
    steps.append({"step": "reconstruct", "files": restored, "note": f"repo restored to state before step {from_step}"})

    # A git repo so the re-run's diff is computable.
    _run("git init -q . && git add -A && git -c user.email=afr@local -c user.name=AFR commit -qm baseline", REPO_DIR)

    install = _run("npm install --no-audit --no-fund", REPO_DIR, timeout=420)
    steps.append({"step": "npm install", "exit_code": install["exit_code"], "duration_s": install["duration_s"]})

    prompt = (
        f"{task}\n\n"
        f"Constraint learned from incident analysis: {correction}\n\n"
        f"Apply the fix and make sure `npm test` and `npm run prod-sim` both pass."
    )
    codex_cmd = ["codex", "exec", "--json", "--cd", REPO_DIR]
    if model:
        codex_cmd += ["--model", model]
    codex_cmd.append(prompt)
    agent = _run(codex_cmd, REPO_DIR, timeout=420)
    steps.append({"step": "codex re-run", "exit_code": agent["exit_code"], "duration_s": agent["duration_s"]})

    tests = _run("npm test", REPO_DIR, timeout=300)
    prod = _run("npm run prod-sim", REPO_DIR, timeout=300)
    diff = _run("git diff HEAD", REPO_DIR)

    passed = tests["exit_code"] == 0 and prod["exit_code"] == 0
    return {
        "ok": True,
        "session_id": session_id,
        "from_step": from_step,
        "correction": correction,
        "tests_passed": passed,
        "test_output": (tests["stdout"] + tests["stderr"])[-3000:] + "\n\n--- prod-sim ---\n" + (prod["stdout"] + prod["stderr"])[-2000:],
        "diff": diff["stdout"][:20000],
        "duration_s": round(sum(s.get("duration_s", 0) for s in steps) + tests["duration_s"] + prod["duration_s"], 1),
        "steps": steps,
        "agent_stream_tail": agent["stdout"][-2000:],
    }


@app.function(secrets=[secret], timeout=600)
@modal.fastapi_endpoint(method="POST")
def replay_endpoint(payload: dict):
    """POST {session_id, from_step, correction} — what the UI button calls."""
    try:
        return replay.local(
            payload["session_id"],
            int(payload["from_step"]),
            payload.get("correction", ""),
            payload.get("model"),
        )
    except Exception as exc:  # fail soft: the UI shows this instead of hanging
        return {"ok": False, "error": f"{type(exc).__name__}: {exc}"}


@app.local_entrypoint()
def main(trace: str, from_step: int, correction: str = "", model: str = None):
    if not correction:
        # Default to the correction the incident engine already wrote to disk.
        incident_path = project_root / "traces" / f"{trace}.incident.json"
        if incident_path.exists():
            correction = json.loads(incident_path.read_text())["correction"]
            print(f"using correction from {incident_path.name}")
    result = replay.remote(trace, from_step, correction, model)
    print(json.dumps({k: v for k, v in result.items() if k != "diff"}, indent=2))
    print("\n--- new diff ---\n" + result["diff"][:4000])
