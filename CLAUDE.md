# Agent Flight Recorder (AFR)

A "black box" flight recorder for AI coding agents. Records every decision a Codex CLI
session makes (tool calls, edits, reasoning, assumptions), enriches the trace with
"why + alternatives + assumptions" annotations, and provides a replay UI with an
Incident Mode: paste a stack trace / failing test / Greptile finding and AFR walks the
trace backward to the exact step and false assumption that caused it — then re-runs the
agent from that step with a corrected assumption in a Modal sandbox.

Built for the YC Fast Hackathon (Aug 2026). Codex CLI must play a meaningful role in
both building this project AND as the recorded subject.

## Repo layout

```
agent-flight-recorder/
├── CLAUDE.md                  # you are here
├── docs/
│   ├── SPEC.md                # full product + technical spec (read before big changes)
│   ├── PLAN.md                # hour-by-hour build plan with checkpoints
│   ├── INTEGRATIONS.md        # Codex, Modal, Greptile, claude-mem integration details
│   └── DEMO.md                # 3-minute demo script + rehearsal checklist
├── packages/
│   ├── recorder/              # TS: Codex CLI wrapper → trace.jsonl capture
│   ├── enricher/              # TS: post-session enrichment pass (OpenAI API)
│   ├── incident/              # TS: incident mode — failure → step → assumption
│   └── ui/                    # React + Vite replay UI (timeline scrubber)
├── modal/
│   ├── replay_sandbox.py      # Modal sandbox: re-run Codex from step N
│   └── enrich_batch.py        # Modal function: parallel enrichment (optional)
├── demo/
│   ├── target-app/            # small TS API app the agent modifies in the demo
│   └── traces/                # golden demo trace(s), committed
└── traces/                    # local trace output (gitignored)
```

## Commands

- `npm run dev` — start replay UI (Vite, port 5173) + trace API (port 8787)
- `npm run record -- "<task>"` — run Codex CLI on demo/target-app with recording on
- `npm run enrich -- traces/<id>.jsonl` — run enrichment pass, writes `<id>.enriched.jsonl`
- `npm run incident -- traces/<id>.enriched.jsonl --error err.txt` — incident analysis
- `modal run modal/replay_sandbox.py --trace <id> --from-step N` — sandboxed re-run
- `npm test` — vitest across packages

## Hard rules

- Node 20+, TypeScript strict everywhere in packages/. Python 3.11 in modal/.
- Traces are JSONL, one event per line, schema in docs/SPEC.md §4. NEVER change the
  schema without updating SPEC.md and the golden traces in demo/traces/.
- The UI must render the committed golden trace perfectly even if live capture breaks.
  The golden trace is the demo's safety net — treat it as sacred.
- No auth, no multi-tenant, no persistence beyond JSONL + SQLite. This is a hackathon.
- Secrets via env only: `OPENAI_API_KEY`, `MODAL_TOKEN_ID/SECRET`. Never commit keys.
- All LLM calls go through packages/enricher/src/llm.ts (single choke point, retries,
  JSON-mode, cost logging). Do not scatter fetch() calls to OpenAI elsewhere.
- Fail soft: if enrichment or Modal is down, the UI still shows the raw trace.

## Style

- Small modules, no classes unless stateful. Zod schemas for every trace event type.
- UI: React function components, Tailwind, no component library — timeline is custom.
- Prefer boring code. Cleverness is for the product, not the codebase.

## Scope guard (say no to these)

- Multi-agent support (Codex CLI only)
- Languages beyond TypeScript in the demo target app
- Realtime streaming UI during capture (post-hoc replay only)
- Editing traces in the UI

## Workflow notes

- claude-mem is installed; context persists across sessions. Start each session by
  checking what the last session finished (claude-mem injects this automatically).
- Greptile reviews every PR on this repo. Address findings or 👎 them with a reason;
  its findings also feed Incident Mode (see docs/INTEGRATIONS.md §3).
- Commit small, push often — Greptile review turnaround is ~3 min and we mine those
  reviews for the demo.
