# Mayday

**The black box and crash investigator for AI coding agents.**

AI agents write a growing share of production code. When that code breaks, `git blame`
names the agent and the trail goes cold — there is no record of what it believed, what it
read, or which assumption turned out to be false. Mayday records every decision a Codex
CLI session makes, annotates each step with the *assumptions it depended on*, and turns a
production stack trace into a root-cause answer: which step wrote the failing line, which
belief was false, and where that belief came from — then re-runs the agent from that step
with the belief corrected, inside an isolated Modal sandbox. Logs record actions. Mayday
records **beliefs**, and links them to outcomes.

Built at the YC Fast Hackathon, August 2026.

## It works end to end

A real recorded session, not a mock-up:

```
record   → 24 steps · 11 thoughts · 2 file edits · 5 test runs · 80s
agent    → ships with 8/8 unit tests green
prod-sim → TypeError: Cannot read properties of null (reading 'toString')
             at ownerCode (owner.ts:6)
             at listItems (items.ts:67)      ← a line the agent wrote
enrich   → 17 steps · 117 assumptions · 76 attributed lines · $0.08
incident → step 12 · basis step 9 · high confidence · $0.03
```

> **Verdict, verbatim from the incident engine:** *"The agent assumed that omitting
> `user_id` and dropping the WHERE clause would safely return all user-owned items. In
> reality, the items table includes rows with `user_id = NULL`, so `toDTO` passed a null
> to `ownerCode`, which called `toString()` on null and threw at `owner.ts:6`."*

That trace is committed in `demo/traces/` and is what the demo runs on.

## Architecture

```
┌────────────┐  JSON events  ┌───────────┐  trace.jsonl  ┌───────────┐
│ Codex CLI  │ ────────────▶ │ recorder  │ ────────────▶ │ enricher  │
│ (the agent)│  exec --json  │  (TS)     │               │ (OpenAI)  │
└────────────┘               └───────────┘               └─────┬─────┘
                                                               │ enriched.jsonl
                                                               │ + line_origin index
   stack trace / failing test / ┌─────────────────────────┐    │
   Greptile finding ──────────▶ │ incident engine         │◀───┘
                                │ line → step → the false │
                                │ assumption behind it    │
                                └───────────┬─────────────┘
                                            │ "re-run from step N"
                   ┌────────────────┐       │        ┌──────────────────┐
                   │ Modal sandbox  │◀──────┴───────▶│ replay UI (React)│
                   │ Codex re-runs  │                │ timeline + chain │
                   │ with the fix   │                │ + forensics card │
                   └────────────────┘                └──────────────────┘
```

| Piece | Path | What it does |
|---|---|---|
| Recorder | `packages/recorder` | Wraps `codex exec --json`, handles both Codex event families, computes real unified diffs from disk, snapshots every file version as a content-addressed blob. Captures run in an isolated workspace copy so the agent cannot read this repo. |
| Enricher | `packages/enricher` | One LLM call per step → intent, rejected alternatives, **assumptions with `basis_step`**, risk. Builds the line-history index in SQLite. |
| Incident | `packages/incident` | Failure artifact → `(path, line)` → owning step → the false assumption + a corrected instruction. |
| Server | `packages/server` | Trace API on :8787 — sessions, file-at-step, incident analysis, Greptile import, Modal proxy. |
| UI | `packages/ui` | Timeline scrubber with risk glow, file state at any step, assumption chips that jump to where the belief formed, incident overlay + forensics card. |
| Modal | `modal/replay_sandbox.py` | Rebuilds the repo exactly as it was before step N from blobs, re-runs Codex with the correction, runs tests **and** the production simulator, returns the new diff. |
| Demo app | `demo/target-app` | Items API whose local schema, migrations and dev database all say `user_id NOT NULL`. Production disagrees. |

### The line-history index

The load-bearing trick. `file_edit` diffs are replayed in order while tracking how
insertions shift every line below them, so `items.ts:67` resolves to the step that
actually wrote that line — not merely the step that touched the file.
See `packages/enricher/src/line-history.ts`.

## Quickstart

```bash
npm install
cp .env.example .env          # add OPENAI_API_KEY
npm i -g @openai/codex && codex login

npm run record -- "add pagination to GET /items and make the user_id filter optional, so that omitting user_id returns items across all users"
npm run enrich  -- traces/<session>.jsonl
npm run dev                   # UI :5173 · trace API :8787

npm run prod-sim              # crash it with production traffic
npm run incident -- traces/<session>.enriched.jsonl --error demo/target-app/crash.txt
```

Environment variables use an `AFR_` prefix — the project's original working name.

## Sponsors

Every integration is load-bearing, not a logo.

- **OpenAI Codex** — three roles. It is the **recorded subject** (`codex exec --json`
  drives the whole demo), the **re-run engine** inside the Modal sandbox, and a **build
  tool** used alongside Claude Code on this repo. Building Mayday also surfaced two
  findings about the CLI worth writing down: `codex exec` sandboxes file writes
  read-only by default, and reasoning summaries are off unless you ask for them — see
  [`docs/codex-event-map.md`](docs/codex-event-map.md), verified against a live stream.
- **Modal** — sandboxed **time-travel re-runs** (`modal/replay_sandbox.py`). State is
  pushed into the sandbox at runtime from the recorder's blobs, so a new golden trace
  never requires a redeploy. Optional parallel enrichment in `modal/enrich_batch.py`.
- **Greptile** — reviews every PR here, *and* its findings are a pre-production incident
  artifact: `{path, line_range, comment}` feeds Incident Mode directly. Greptile tells you
  **what** is wrong with the diff; Mayday tells you **why the agent wrote it**. Uses the
  Greptile CLI (`greptile review --json`), which reviews the working branch with no PR.
- **claude-mem** — build-time memory across the weekend's Claude Code sessions.

## A note on the demo app's state

`demo/target-app` is committed **as the agent left it** — pagination shipped, 8/8 unit
tests green, and a latent crash on production traffic. That is deliberate: it is the
starting position for the demo, so `npm run prod-sim` fails on a fresh clone by design.
`git log` in that directory is not the agent's history; captures run in an isolated
workspace under `traces/<session>/workspace` precisely so the agent cannot read this
repository while it works.

## Status

`npm test` — 29 tests green. Recorder, enricher, incident engine, trace API, UI, demo app
and Modal replay are all implemented; the pipeline has been verified end to end on a real
capture. Fail-soft throughout: no enrichment still renders the raw trace, no Modal still
prints the exact local command, no Greptile API still loads a saved finding.

Docs: [SPEC](docs/SPEC.md) · [PLAN](docs/PLAN.md) · [INTEGRATIONS](docs/INTEGRATIONS.md) ·
[DEMO](docs/DEMO.md) · [SETUP_STATUS](docs/SETUP_STATUS.md)
