# Modal notes

Read from live docs 2026-08-23 (client 1.5.4). Source pages:
[guide/sandboxes](https://modal.com/docs/guide/sandboxes),
[guide/sandbox-files](https://modal.com/docs/guide/sandbox-files),
[guide/webhooks](https://modal.com/docs/guide/webhooks).

## The API surface Mayday uses

### Create a sandbox

```python
sb = modal.Sandbox.create(
    app=app,
    image=sandbox_image,
    secrets=[modal.Secret.from_name("openai-secret")],
    timeout=1500,        # default 5 min, max 24 h
    cpu=2.0,
    workdir="/work",
)
```

`modal.App.lookup("name", create_if_missing=True)` is the alternative when creating a
sandbox outside a deployed app.

### Run commands

```python
p = sb.exec("bash", "-lc", "npm test", timeout=420)
out = p.stdout.read()          # or: for line in p.stdout: …  (streams)
err = p.stderr.read()
p.wait()
p.returncode                   # exit code
```

### Filesystem — how we rewind the repo

```python
sb.filesystem.make_directory("/work/src")
sb.filesystem.write_text(content, "/work/src/items.ts")
text = sb.filesystem.read_text("/work/src/items.ts")
sb.filesystem.copy_from_local("local.txt", "/work/remote.txt")
sb.filesystem.list_files("/work")
sb.filesystem.remove("/work/tmp", recursive=True)
```

Reads support files up to 5 GB; writes any size. **This is why Mayday pushes the
reconstructed state at runtime instead of baking traces into the image** — a new
golden trace needs no redeploy.

### Teardown

```python
sb.terminate()        # always in a finally block
sb.detach()           # release the client connection
sb.object_id / modal.Sandbox.from_id(id)   # reattach later
```

### Web endpoint (the UI's "Re-run from step N" button)

```python
@app.function(image=driver_image, secrets=[secret], timeout=1800)
@modal.fastapi_endpoint(method="POST")
def replay_endpoint(payload: dict):
    ...
```

- `@app.function` is required *above* the endpoint decorator.
- The image must `pip_install("fastapi[standard]")`.
- **`@modal.web_endpoint` is deprecated** (renamed in v0.73.82) — use `fastapi_endpoint`.
- `modal deploy modal/replay_sandbox.py` prints the persistent URL →
  `AFR_MODAL_ENDPOINT` in `.env`.

### Image

```python
modal.Image.debian_slim(python_version="3.11")
    .apt_install("git", "curl", "ca-certificates")
    .run_commands(
        "curl -fsSL https://deb.nodesource.com/setup_20.x | bash -",
        "apt-get install -y nodejs",
        "npm install -g @openai/codex",
    )
    .add_local_dir(local_path, "/work", copy=True, ignore=["node_modules", "data"])
```

`copy=True` bakes the files into the image layer (required if later build steps use
them). Build it Saturday night so Sunday is a container pull, not an npm install.

## Mayday's design decision

Two images, on purpose:

- **`driver_image`** — tiny, just `fastapi[standard]`; runs `replay()` and the endpoint.
- **`sandbox_image`** — Node 20 + Codex CLI + the target app; only the sandbox pays
  for it.

The driver reconstructs nothing: `packages/server` reads the recorder's blobs and POSTs
`{session_id, from_step, correction, files, task}`. The sandbox writes those files over
the baked-in copy, `git init`s a baseline, re-runs Codex with the correction appended,
then runs both `npm test` **and** `npm run prod-sim` — the unit tests passed for the
buggy code too, so prod-sim is the real verdict.

## Setup checklist

```bash
uv tool install --python 3.12 modal      # do NOT pip3 install into system python 3.9
modal setup                              # browser; writes ~/.modal.toml
modal run modal/hello.py                 # smoke test → "modal ok on arm64"
modal secret create openai-secret OPENAI_API_KEY=$OPENAI_API_KEY
modal deploy modal/replay_sandbox.py     # copy URL → AFR_MODAL_ENDPOINT
```
