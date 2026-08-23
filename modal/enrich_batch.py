"""
Optional stretch (SPEC §7): fan enrichment out on Modal for large traces.
Not on the demo critical path — `npm run enrich` does the same thing locally.

  modal run modal/enrich_batch.py --trace traces/<id>.jsonl
"""

import json
from pathlib import Path

import modal

image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("curl")
    .run_commands(
        "curl -fsSL https://deb.nodesource.com/setup_20.x | bash -",
        "apt-get install -y nodejs",
    )
    .add_local_dir(Path(__file__).parent.parent / "packages", "/work/packages", copy=True, ignore=["node_modules", "dist"])
)

app = modal.App("afr-enrich-batch", image=image)
secret = modal.Secret.from_name("openai-secret")


@app.function(secrets=[secret], timeout=900)
def enrich(trace_jsonl: str, concurrency: int = 16):
    import subprocess

    Path("/work/trace.jsonl").write_text(trace_jsonl)
    subprocess.run("npm install --no-audit --no-fund", cwd="/work/packages/enricher", shell=True, check=False)
    proc = subprocess.run(
        f"npx tsx src/cli.ts /work/trace.jsonl --concurrency {concurrency}",
        cwd="/work/packages/enricher",
        shell=True,
        capture_output=True,
        text=True,
    )
    return {
        "exit_code": proc.returncode,
        "log": (proc.stdout + proc.stderr)[-4000:],
        "enriched": Path("/work/trace.enriched.jsonl").read_text() if Path("/work/trace.enriched.jsonl").exists() else "",
    }


@app.local_entrypoint()
def main(trace: str, concurrency: int = 16):
    result = enrich.remote(Path(trace).read_text(), concurrency)
    print(result["log"])
    if result["enriched"]:
        out = Path(trace).with_suffix(".enriched.jsonl")
        out.write_text(result["enriched"])
        print(f"wrote {out}")
