# Codex event → TraceEvent map

Recorder parser spec for `packages/recorder/src/codex.ts`.
Codex CLI **0.149.0**, verified 2026-08-23.

## Verification status

`codex exec --help` was read from the installed binary, and the event/item type
discriminators below were confirmed present in the binary's string table
(`strings $(npm root -g)/@openai/codex/.../bin/codex`). **A live capture is still
required** to confirm exact nesting and field names — the recorder writes every raw
line to `traces/<session>/raw.jsonl` for exactly that purpose. Run the probe as soon
as `codex login` is done:

```bash
mkdir -p /tmp/codex-probe && cd /tmp/codex-probe && git init -q
codex exec --json --sandbox workspace-write "create hello.txt containing the word hello" \
  | tee ~/Downloads/greptile/docs/codex-events-sample.jsonl
```

## Confirmed CLI surface (`codex exec --help`)

| Flag | Why it matters |
|---|---|
| `--json` | "Print events to stdout as JSONL" — the capture stream |
| `-C, --cd <DIR>` | Agent working root; recorder points it at `demo/target-app` |
| `-s, --sandbox <read-only\|workspace-write\|danger-full-access>` | **Load-bearing.** `exec` will not write files without `workspace-write`; a read-only run yields a trace with zero `file_edit` events. The recorder now defaults to `workspace-write` (override with `AFR_CODEX_SANDBOX`). |
| `-m, --model` | Passed through by `npm run record -- … --model` |
| `--skip-git-repo-check` | Needed if the target app is ever moved outside a git repo |
| `--ephemeral` | Do **not** use — it skips session files we may need as a fallback source |

## Event families

The recorder handles both, because the CLI has shipped both and versions drift.

### Family A — experimental JSON (current)

`{"type": "item.completed", "item": {…}}`, plus `thread.started`, `turn.started`,
`turn.completed`, `turn.failed`, `item.started`, `item.updated`.
Only `item.completed` becomes a trace step; `started`/`updated` are progress noise.

| Codex item type | → TraceEvent | Notes |
|---|---|---|
| `reasoning` | `thought` | The money events — the agent's stated beliefs |
| `agent_message` | `thought` | Assistant prose, treated as reasoning |
| `command_execution` | `shell_command`, or `test_run` if the command matches a test pattern | `exit_code`, `aggregated_output` |
| `file_change` | `file_edit` (one per changed path) | Diff is **recomputed from disk**, not taken from the payload |
| `mcp_tool_call`, `web_search` | `tool_call` | |
| `todo_list` | `tool_call` (name `todo_list`) | |
| `error` | `tool_call` (name `error`) | Surfaced, never dropped |
| `local_shell_call` | `shell_command` | Older alias |

### Family B — protocol events (older)

`{"id": "0", "msg": {"type": "agent_reasoning", …}}`

| msg.type | → TraceEvent |
|---|---|
| `session_configured`, `task_started` | session metadata (model) |
| `agent_reasoning`, `agent_reasoning_delta` | `thought` |
| `agent_message` | `thought` |
| `exec_command_end` | `shell_command` / `test_run` |
| `patch_apply_begin`, `patch_apply_end` | `file_edit` |
| `error`, `stream_error` | `tool_call` (name `error`) |
| `task_complete` | turn end (no step) |
| `exec_command_begin`, `token_count`, `agent_message_delta`, `agent_reasoning_section_break` | **dropped** — superseded by the corresponding `*_end` / `completed` event |

Anything unrecognized is preserved in `raw.jsonl` and ignored by the mapper rather
than crashing the capture.

## Events we deliberately drop

Deltas and `*_begin` markers (they duplicate the completed event), `token_count`
(cost is tracked in `llm.ts` instead), and turn lifecycle events (they carry no
agent decision).

## Fallback source if reasoning is absent from the stream

Codex persists a full item history per session under `$CODEX_HOME/sessions/`
(default `~/.codex/sessions/`), unless `--ephemeral` is passed. If a future CLI
version stops emitting `reasoning` items on stdout, parse the rollout file instead —
same mapping table, different transport. Confirm the exact path and format during the
first live capture; `~/.codex` currently holds only `hooks.json` (no sessions yet,
since nothing has run).

## Fields we compute ourselves (do not trust the payload)

- **Unified diffs** — recomputed by reading the file before/after each change, so
  `file_edit.lines_added` is always in post-edit coordinates (SPEC §4 rule) and the
  line-history index stays sound.
- **`final_diff` / `files_touched`** — `git diff HEAD --relative` at session end.
- **Step numbers** — assigned by the recorder, monotonic, 1-based.
