# Mayday — Specification

Version 1.0 · YC Fast Hackathon · Aug 2026

## 1. Problem

AI coding agents ship code that passes tests and breaks in production. When it does,
`git blame` points at the agent — and the trail ends there. There is no record of what
the agent believed, what it read, what alternatives it rejected, or which assumption
turned out to be false. Teams adopting agents have no forensics and no time-travel
debugging for agent decisions.

## 2. Product

Mayday is three things layered on one artifact (the trace):

1. **Recorder** — wraps Codex CLI, captures a structured trace of an entire agent
   session: task, reasoning, tool calls, file edits, shell commands, final diff.
2. **Enricher** — a post-session pass that annotates each decision point with intent,
   rejected alternatives, and — critically — explicit *assumptions* the step made.
3. **Replay + Incident Mode** — a timeline UI to scrub the session; paste a failure
   (stack trace, failing test output, or a Greptile review finding) and Mayday walks the
   trace backward to the step and false assumption that introduced it, then offers
   "re-run from step N with corrected assumption" in a Modal sandbox.

### Non-goals (v1)

No multi-agent support, no live streaming during capture, no team features, no auth,
no trace editing, no languages beyond TS in the demo target.

## 3. Architecture

```
┌────────────┐   JSON events   ┌──────────────┐   trace.jsonl   ┌──────────────┐
│ Codex CLI  │ ──────────────▶ │  recorder    │ ──────────────▶ │  enricher    │
│ (agent)    │  (exec/session  │  (TS wrapper)│                 │  (OpenAI API)│
└────────────┘   log stream)   └──────────────┘                 └──────┬───────┘
                                                                       │ enriched.jsonl
                                                     ┌─────────────────▼──────────┐
                          failure artifact ────────▶ │  incident engine (TS)      │
                          (stack trace / test /      │  failure → lines → step →  │
                           Greptile finding)         │  false assumption          │
                                                     └───────────┬────────────────┘
                                                                 │
                            ┌──────────────┐  re-run from step N │
                            │ Modal sandbox│ ◀───────────────────┤
                            │ (Codex re-run│                     │
                            │  + tests)    │           ┌─────────▼─────────┐
                            └──────────────┘           │  replay UI (React)│
                                                       │  timeline + diffs │
                                                       └───────────────────┘
```

Local trace API: a tiny Express server (port 8787) serving trace files + SQLite index
to the UI. Everything runs locally except Modal sandbox re-runs and LLM calls.

## 4. Trace schema (JSONL, one event per line)

All events share an envelope; Zod schemas live in `packages/recorder/src/schema.ts`.

```ts
type TraceEvent = {
  v: 1;                        // schema version
  session_id: string;          // ulid
  step: number;                // monotonically increasing, 1-based
  ts: string;                  // ISO 8601
  type: "session_start" | "thought" | "tool_call" | "file_edit"
      | "shell_command" | "test_run" | "session_end";
  data: SessionStart | Thought | ToolCall | FileEdit | ShellCommand | TestRun | SessionEnd;
  enrichment?: Enrichment;     // added by enricher, absent in raw trace
};

type SessionStart = { task: string; cwd: string; git_sha: string; model: string };
type Thought     = { text: string };                       // Codex reasoning items
type ToolCall    = { name: string; input: unknown; output_summary: string };
type FileEdit    = { path: string; diff: string;           // unified diff
                     lines_added: [number, number][] };    // ranges in NEW file
type ShellCommand = { command: string; exit_code: number; output_tail: string };
type TestRun     = { command: string; passed: boolean; output_tail: string };
type SessionEnd  = { final_diff: string; files_touched: string[]; duration_s: number };

type Enrichment = {
  intent: string;              // what was this step trying to accomplish
  alternatives: { description: string; why_rejected: string }[];  // 0–3
  assumptions: {               // THE money feature
    id: string;                // `${session_id}:${step}:${i}`
    claim: string;             // e.g. "user_id is always non-null per schema read in step 9"
    basis_step: number | null; // step where the belief came from, if traceable
    confidence: "stated" | "inferred";
  }[];
  risk: "low" | "medium" | "high";  // enricher's judgment of blast radius
};
```

Rules:
- `file_edit.lines_added` uses post-edit line numbers so Incident Mode can map a stack
  trace line to the step that introduced it via a line-history index (see §6).
- Raw trace must be valid and useful WITHOUT enrichment (fail-soft rule).

## 5. Recorder (packages/recorder)

Approach: shell wrapper around **Codex CLI headless mode** (`codex exec`). Codex CLI
emits structured JSON events with `--json`; the recorder spawns
`codex exec --json --cd demo/target-app "<task>"`, parses the event stream line by
line, and maps Codex events → TraceEvents. Verify the exact event names against the
installed Codex CLI version at build time (`codex exec --json` on a trivial task,
inspect output) — do not trust memory; the CLI evolves fast. If the installed version's
JSON stream lacks reasoning items, fall back to parsing the session log/rollout file
Codex writes under its home directory (`~/.codex/sessions/...`), which contains the
full item history.

- After each `file_edit`, recorder snapshots the file (content-addressed under
  `traces/<session>/blobs/`) to power diff scrubbing without replaying git.
- On `session_end`, recorder computes `final_diff` via `git diff` in the target app.
- Deterministic step numbering; a partial/crashed session still yields a valid trace.

Definition of done: `npm run record -- "add pagination to /items"` on demo/target-app
produces a trace with ≥1 thought, ≥2 file_edits, ≥1 test_run, and a session_end.

## 6. Line-history index

Built at enrich time, stored in SQLite (`traces/index.db`):

```
line_origin(session_id, path, line_no, step)   -- which step last wrote this line
```

Constructed by replaying `file_edit` diffs in order and tracking line movement
(insertions shift subsequent line numbers; the replayer maintains an offset map per
file). This is the lookup Incident Mode uses: stack frame `items.ts:42` → step 14.

## 7. Enricher (packages/enricher)

For each `thought`/`tool_call`/`file_edit` step, one LLM call (model:
`gpt-5-mini`-class via OpenAI API — check current cheap model name at build time; we
have $100 Codex/OpenAI credits) with a sliding window of the previous 6 events +
the task. Output is strict JSON matching `Enrichment` (JSON mode / structured output).

Prompt sketch (full prompt in `packages/enricher/prompts/enrich.md`):

```
You are auditing one step of an AI coding agent's session.
Task: {task}
Recent context: {previous 6 events, summarized}
Current step: {event}
Return JSON: intent; up to 3 alternatives the agent plausibly considered or should
have, each with why_rejected; assumptions — explicit claims this step DEPENDS on
being true, each with basis_step if the belief traces to an earlier step (e.g. a
file the agent read) or null; risk low|medium|high.
Assumptions must be falsifiable claims about the code/data/environment, not vibes.
```

- Runs steps in parallel (p-limit 5). ~30 steps × 1 call ≈ pennies.
- Optional stretch: `modal/enrich_batch.py` fans out enrichment on Modal for big
  traces (nice sponsor story, not on critical path).
- Writes `<id>.enriched.jsonl` + populates SQLite (steps, assumptions, line_origin).

## 8. Incident engine (packages/incident)

Input: enriched trace + a failure artifact, one of:
- **stack trace** (text) — parse frames `path:line`
- **failing test output** — parse the assertion location + failing frames
- **Greptile finding** (JSON: `{path, line_range, comment}`) — pulled from a PR review

Pipeline:
1. Extract `(path, line)` candidates from the artifact.
2. `line_origin` lookup → candidate steps, ranked by recency + risk.
3. For the top step, one LLM call: "Given this failure and this step's assumptions,
   which assumption is most likely false and why?" → returns `assumption_id`,
   `verdict`, `suggested_correction` (a one-paragraph corrected instruction).
4. Output `incident.json`: `{failure, step, assumption, verdict, correction,
   basis_step}` — the UI renders this as the forensics card and highlights the
   chain: basis step → faulty step → failing line.

Definition of done: pasting the demo crash's stack trace returns step 14 (or wherever
the golden trace's bug lives) with the correct false assumption, in <10s.

## 9. Replay from step N (modal/replay_sandbox.py)

The "time travel" fix. A Modal function that:
1. Spins a sandbox image: `modal.Image.debian_slim().apt_install("git")`
   `.pip/npm as needed` + Node 20 + Codex CLI (`npm i -g @openai/codex`), with
   `OPENAI_API_KEY` as a Modal Secret.
2. Clones the target app at the session's `git_sha` (mounted or shallow-cloned from
   the repo), replays `file_edit` diffs for steps 1..N-1 to reconstruct the exact
   pre-step-N state.
3. Runs `codex exec --json` with the original task PLUS the correction:
   "Constraint learned from incident analysis: {suggested_correction}".
4. Runs the target app's test suite + the reproduction test; streams results back.
5. Returns: new diff, test results, and a fresh mini-trace (recorded the same way).

Modal specifics: use `modal.Sandbox` or a plain `@app.function` with `subprocess`;
prefer Sandbox for the demo narrative ("agent re-runs in an isolated cloud sandbox").
Keep timeout 300s, CPU-only. `modal run` for the CLI path; a small
`@modal.fastapi_endpoint` wrapper so the UI's "Re-run from step 14" button can call it.

Fail-soft: if Modal is unreachable, the UI button falls back to printing the exact
local command to run.

## 10. Replay UI (packages/ui)

React + Vite + Tailwind, custom components, dark theme, single page:

- **Timeline scrubber** (top): one tick per step, colored by type, risk glow on
  medium/high steps. Keyboard: ←/→ step, space to play.
- **Left panel**: file tree of files_touched; selecting a file shows its state AT the
  current step (reconstructed from blobs), with the current step's diff highlighted.
- **Right panel**: the step card — thought text / tool call / command output, plus
  enrichment: intent, alternatives (collapsed), assumptions as chips. Clicking an
  assumption with a `basis_step` jumps the scrubber there.
- **Incident mode** (modal overlay): textarea for stack trace / test output + a
  "Import from Greptile PR review" button; on analyze, the timeline dims except the
  basis step → faulty step chain, the assumption chip turns red, and the forensics
  card shows verdict + correction + a **Re-run from step N** button (calls Modal
  endpoint, shows live status, then green test results + new diff).

Must render the committed golden trace with zero network (traces served statically in
dev fallback).

## 11. Demo target app (demo/target-app)

A ~150-line TypeScript Express API ("items" CRUD, SQLite) with a seeded latent trap:
the DB schema file the agent will read is stale relative to a migration (e.g. schema
says `user_id INTEGER NOT NULL`, migration 002 made it nullable for guest carts).
The demo task ("add pagination + per-user filtering to GET /items") lures the agent
into assuming non-null `user_id`. A hidden integration test / prod-sim script
(`npm run prod-sim`) sends a guest request → crash → stack trace for Incident Mode.

Tune this trap until the golden trace reliably contains the false assumption. If the
live agent dodges the trap on stage, the golden trace still tells the story.

## 12. Milestones / acceptance

M1 Recorder produces valid trace on demo app          (Sat 13:00)
M2 Enrichment adds assumptions w/ basis_step links    (Sat 17:00)
M3 UI scrubs golden trace end-to-end                  (Sat 21:00)
M4 Incident mode: stack trace → step + assumption     (Sun 10:00)
M5 Modal re-run from step N returns passing tests     (Sun 12:30)
M6 Greptile finding → incident path works             (Sun 14:00, stretch)
M7 Demo rehearsed 3× on golden trace                  (Sun 15:30)
