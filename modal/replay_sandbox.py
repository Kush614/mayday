"""
Time-travel re-run (SPEC §9) on a real modal.Sandbox.

The caller reconstructs the repo state before step N from the recorder's
content-addressed blobs and hands the sandbox a {path: content} map, so nothing
about a specific trace is baked into the image — record a new golden trace and
this keeps working with no redeploy.

  modal run modal/replay_sandbox.py --trace <session_id> --from-step 14
  POST {session_id, from_step, correction, files, task} to the deployed endpoint

Sandbox API verified against modal.com/docs/guide/sandboxes (client 1.5.4):
  modal.Sandbox.create(app=…, image=…, secrets=…, timeout=…, cpu=…)
  sb.filesystem.write_text / make_directory / read_text
  p = sb.exec(...); p.stdout.read(); p.wait(); p.returncode
  sb.terminate()
"""

import json
import time
from pathlib import Path

import modal

APP_NAME = "afr-replay"
WORK = "/work"

project_root = Path(__file__).parent.parent

# Node 20 + Codex CLI baked in so Sunday cold starts are just a container pull.
sandbox_image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("git", "curl", "ca-certificates")
    .run_commands(
        "curl -fsSL https://deb.nodesource.com/setup_20.x | bash -",
        "apt-get install -y nodejs",
        "npm install -g @openai/codex",
    )
    .add_local_dir(
        project_root / "demo" / "target-app",
        WORK,
        copy=True,
        ignore=["node_modules", "data", "*.db*"],
    )
)

# The driver function itself only needs fastapi for the web endpoint.
driver_image = modal.Image.debian_slim(python_version="3.11").pip_install("fastapi[standard]")

app = modal.App(APP_NAME)
secret = modal.Secret.from_name("openai-secret")


def _exec(sb, *cmd, timeout=420):
    """Run a command in the sandbox and collect its output."""
    started = time.time()
    p = sb.exec(*cmd, timeout=timeout)
    out = p.stdout.read()
    err = p.stderr.read()
    p.wait()
    return {
        "cmd": " ".join(cmd),
        "exit_code": p.returncode,
        "stdout": out[-6000:],
        "stderr": err[-4000:],
        "duration_s": round(time.time() - started, 1),
    }


@app.function(image=driver_image, secrets=[secret], timeout=1800)
def replay(session_id: str, from_step: int, correction: str, files: dict, task: str, model: str = None):
    """
    files: {relative_path: file_content} — the repo state as of step N-1.
    task:  the original session task, which we re-issue with the correction.
    """
    sb = modal.Sandbox.create(
        app=app,
        image=sandbox_image,
        secrets=[secret],
        timeout=1500,
        cpu=2.0,
        workdir=WORK,
    )
    steps = []
    try:
        # 1. Rewind: overwrite the baked-in sources with the pre-step-N state.
        for rel_path, content in (files or {}).items():
            target = f"{WORK}/{rel_path}"
            parent = target.rsplit("/", 1)[0]
            if parent != WORK:
                sb.filesystem.make_directory(parent)
            sb.filesystem.write_text(content, target)
        steps.append({"step": "reconstruct", "files": sorted(files or {}), "note": f"state restored to before step {from_step}"})

        # 2. A git baseline so the re-run's diff is computable.
        _exec(sb, "bash", "-lc", "git init -q . && git add -A && git -c user.email=afr@local -c user.name=AFR commit -qm baseline")

        install = _exec(sb, "bash", "-lc", "npm install --no-audit --no-fund")
        steps.append({"step": "npm install", "exit_code": install["exit_code"], "duration_s": install["duration_s"]})

        # 3. Re-run the agent with the corrected belief injected into the task.
        prompt = (
            f"{task}\n\n"
            f"Constraint learned from incident analysis: {correction}\n\n"
            f"Apply the fix and make sure `npm test` and `npm run prod-sim` both pass."
        )
        codex_cmd = ["codex", "exec", "--json", "--sandbox", "danger-full-access", "--skip-git-repo-check", "--cd", WORK]
        if model:
            codex_cmd += ["--model", model]
        codex_cmd.append(prompt)
        agent = _exec(sb, *codex_cmd)
        steps.append({"step": "codex re-run", "exit_code": agent["exit_code"], "duration_s": agent["duration_s"]})

        # 4. Did it actually fix production traffic, not just the unit tests?
        tests = _exec(sb, "bash", "-lc", "npm test")
        prod = _exec(sb, "bash", "-lc", "npm run prod-sim")
        diff = _exec(sb, "bash", "-lc", "git diff HEAD")

        return {
            "ok": True,
            "session_id": session_id,
            "from_step": from_step,
            "correction": correction,
            "tests_passed": tests["exit_code"] == 0 and prod["exit_code"] == 0,
            "test_output": (tests["stdout"] + tests["stderr"])[-3000:]
            + "\n\n--- prod-sim ---\n"
            + (prod["stdout"] + prod["stderr"])[-2000:],
            "diff": diff["stdout"][:20000],
            "duration_s": round(sum(s.get("duration_s", 0) for s in steps) + tests["duration_s"] + prod["duration_s"], 1),
            "steps": steps,
            "agent_stream_tail": agent["stdout"][-2000:],
        }
    finally:
        sb.terminate()


@app.function(image=driver_image, secrets=[secret], timeout=1800)
@modal.fastapi_endpoint(method="POST")
def replay_endpoint(payload: dict):
    """POST {session_id, from_step, correction, files, task} — what the UI button calls."""
    try:
        return replay.local(
            payload["session_id"],
            int(payload["from_step"]),
            payload.get("correction", ""),
            payload.get("files", {}),
            payload.get("task", ""),
            payload.get("model"),
        )
    except Exception as exc:  # fail soft: the UI renders this instead of hanging
        return {"ok": False, "error": f"{type(exc).__name__}: {exc}"}


def _reconstruct_locally(session_id: str, from_step: int):
    """Read the local trace + blobs and build the {path: content} map and task."""
    for directory in (project_root / "traces", project_root / "demo" / "traces"):
        for name in (f"{session_id}.enriched.jsonl", f"{session_id}.jsonl"):
            path = directory / name
            if not path.exists():
                continue
            events = [json.loads(line) for line in path.read_text().splitlines() if line.strip()]
            task = next(e for e in events if e["type"] == "session_start")["data"]["task"]
            latest = {}
            for e in events:
                if e.get("type") == "file_edit" and e["step"] < from_step and e["data"].get("blob"):
                    latest[e["data"]["path"]] = e["data"]["blob"]
            blob_dir = directory / session_id / "blobs"
            files = {
                rel: (blob_dir / blob).read_text()
                for rel, blob in latest.items()
                if (blob_dir / blob).exists()
            }
            return files, task
    raise FileNotFoundError(f"no trace for session {session_id} in traces/ or demo/traces/")


@app.local_entrypoint()
def main(trace: str, from_step: int, correction: str = "", model: str = None):
    if not correction:
        for directory in (project_root / "traces", project_root / "demo" / "traces"):
            incident_path = directory / f"{trace}.incident.json"
            if incident_path.exists():
                correction = json.loads(incident_path.read_text())["correction"]
                print(f"using correction from {incident_path.name}")
                break
    files, task = _reconstruct_locally(trace, from_step)
    print(f"reconstructed {len(files)} file(s) as of step {from_step - 1}")
    result = replay.remote(trace, from_step, correction, files, task, model)
    print(json.dumps({k: v for k, v in result.items() if k != "diff"}, indent=2))
    print("\n--- new diff ---\n" + result.get("diff", "")[:4000])
