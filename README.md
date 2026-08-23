# Agent Flight Recorder

**Planes have black boxes. Your coding agent doesn't.**

AFR records every decision a Codex CLI session makes, annotates each step with the
*assumptions it depended on*, and turns a production stack trace into a root-cause
answer: which step wrote the failing line, which belief was false, and where that
belief came from — then re-runs the agent from that step with the belief corrected,
in an isolated Modal sandbox.

Logs record actions. AFR records **beliefs**, and links them to outcomes.

## Quickstart

```bash
npm install
cp .env.example .env            # add OPENAI_API_KEY
npm i -g @openai/codex          # the recorded subject

npm run record -- "add pagination + per-user filtering to GET /items"
npm run enrich  -- traces/<session>.jsonl
npm run dev                     # UI :5173 · trace API :8787

npm run prod-sim                # crash the demo app with real traffic
npm run incident -- traces/<session>.enriched.jsonl --error err.txt
```

## How it works

```
codex exec --json → recorder → trace.jsonl → enricher → enriched.jsonl + index.db
                                                              │
        stack trace / failing test / Greptile finding ────────▼
                        incident engine: line → step → false assumption
                                          │
                    Modal sandbox ◀───────┴──────▶ replay UI (timeline + forensics)
```

| Piece | Path | What it does |
|---|---|---|
| Recorder | `packages/recorder` | Wraps `codex exec --json`, maps both Codex event families to the trace schema, computes real unified diffs, snapshots every file version as a content-addressed blob |
| Enricher | `packages/enricher` | One LLM call per step → intent, rejected alternatives, **assumptions with `basis_step`**, risk. Builds the line-history index in SQLite |
| Incident | `packages/incident` | Failure artifact → `(path, line)` → owning step → the false assumption + a corrected instruction |
| Server | `packages/server` | Trace API on :8787 — sessions, events, file-at-step, incident analysis, Greptile import, Modal proxy |
| UI | `packages/ui` | Timeline scrubber, file state at any step, assumption chips that jump to the step that formed the belief, incident overlay + forensics card |
| Modal | `modal/replay_sandbox.py` | Rebuilds the repo exactly as it was before step N from blobs, re-runs Codex with the correction, runs tests + prod-sim, returns the new diff |
| Demo app | `demo/target-app` | Items API whose `schema.sql` says `user_id NOT NULL` while migration 002 made it nullable for guest carts — the trap the agent walks into |

### The line-history index

The load-bearing trick. `file_edit` diffs are replayed in order while tracking how
insertions shift every line below them, so `items.ts:42` resolves to the step that
actually wrote that line — not the step that happened to touch the file.
`packages/enricher/src/line-history.ts`, tested in `packages/enricher/test/`.

## Sponsors

- **OpenAI Codex** — the recorded subject (`codex exec --json`), the re-run engine inside
  the Modal sandbox, and a build tool for parts of this repo.
- **Modal** — sandboxed time-travel re-runs (`modal/replay_sandbox.py`), plus optional
  parallel enrichment (`modal/enrich_batch.py`).
- **Greptile** — reviews every PR here, and its findings are a *pre-production incident
  artifact*: `{path, line_range, comment}` goes straight into Incident Mode.
  Greptile says **what** is wrong with the diff; AFR says **why the agent wrote it**.
  Primary path is the CLI (`npm i -g greptile && greptile login`), so a review of the
  working branch feeds Incident Mode with no PR and no GitHub token:
  `npm run incident -- traces/<id>.enriched.jsonl --greptile-review`
- **claude-mem** — build-time memory across sessions.

## Status

Verified locally (no API keys needed):

- `npm test` — 16 tests green: diff engine, line-history replay across shifting edits,
  failure parsing, and stack-frame → step ranking over a real SQLite index
- `npm run dev` — UI and trace API both serve
- `demo/target-app` — tests pass, `prod-sim` is green *before* the agent's change, and
  the trap is armed (stale `schema.sql` vs migration 002)

Needs credentials to run (`.env`): recording (`codex` + `OPENAI_API_KEY`), enrichment and
incident verdicts (`OPENAI_API_KEY`), sandbox re-runs (`modal setup` +
`modal secret create openai-secret OPENAI_API_KEY=…`, then
`modal deploy modal/replay_sandbox.py` and put the URL in `AFR_MODAL_ENDPOINT`),
live Greptile import (`greptile login`; `GITHUB_TOKEN` + `GITHUB_REPO` only for the PR-comment fallback).

Fail-soft everywhere: no enrichment still renders the raw trace, no Modal still prints
the exact local command, no Greptile API still loads a saved finding.

Docs: [`docs/SPEC.md`](docs/SPEC.md) · [`docs/PLAN.md`](docs/PLAN.md) ·
[`docs/INTEGRATIONS.md`](docs/INTEGRATIONS.md) · [`docs/DEMO.md`](docs/DEMO.md)
