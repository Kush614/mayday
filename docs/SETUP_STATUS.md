# Setup Status

> **SUNDAY: sign into ChatGPT personal workspace BEFORE opening credit link; redeem by Aug 25 11:59 PM PT.**
> The $100 Codex link is single-use and will not redeem into a Business/managed workspace.

Last audited: 2026-08-23.

## Toolchain

| Tool | Version | Requirement | Status |
|---|---|---|---|
| node | v24.18.1 | ≥ 20 | ✅ |
| npm | 11.16.0 | — | ✅ |
| git | 2.50.1 | — | ✅ |
| gh | 2.97.0 | — | ✅ authed as `Kush614` (scopes: repo, workflow, gist, read:org) |
| sqlite3 | 3.51.0 | — | ✅ |
| uv | 0.12.1 | — | ✅ |
| python3 (system) | 3.9.6 | 3.11 wanted | ⚠️ system python is 3.9; **not used** — see note |
| python (modal venv) | 3.12.13 | ≥ 3.11 | ✅ `uv tool install --python 3.12 modal` |

Note on Python: macOS ships 3.9.6 and `pip3` is the system pip (installing into it is
a bad idea). Modal runs from an isolated uv tool venv on 3.12, and the sandbox image
pins `python_version="3.11"`, so nothing depends on the system interpreter.

## Sponsor tooling

| Tool | Version | Auth | Verified by |
|---|---|---|---|
| Codex CLI (`@openai/codex`) | 0.149.0 | ❌ `codex login status` → *Not logged in* | `codex --version`, `codex exec --help` |
| Modal | client 1.5.4 | ✅ profile `kushise27`, token in `~/.modal.toml` | `modal run modal/hello.py` → *modal ok on x86_64* |
| Greptile CLI (`greptile`) | 3.4.1 | ✅ `kushise27@gmail.com` (API key), org `Kush` | `greptile whoami` |
| claude-mem | 13.15.3 | ✅ uses Claude Code's own auth | worker running, PID checked via `claude-mem status` |

### Still blocked on a human

1. `codex login` — browser flow. Alternative: `export OPENAI_API_KEY=…` then `codex login --api-key`.
2. `OPENAI_API_KEY` — needed by the enricher and incident verdicts. Could be avoided
   entirely by routing `llm.ts` through `codex exec --output-schema` (proposed, not built).
3. `modal secret create openai-secret OPENAI_API_KEY=$OPENAI_API_KEY` — waits on (2).
   Required before `modal deploy modal/replay_sandbox.py`.
4. GitHub repo + Greptile GitHub App install — the CLI is authed, but `greptile review`
   needs a remote to diff against.
5. claude-mem Pro: enter **FASTHACK30** at https://cmem.ai (30 days). Optional.
6. Restart Claude Code once so claude-mem's hooks attach; memory injection begins on
   the *second* session in a project.

### Done

- **Modal** — `modal setup` authorized 2026-08-23; workspace `kushise27`; verified with a
  real remote execution (`modal run modal/hello.py`). Check the credit balance in the
  dashboard.
- **Greptile** — signed in with an API key stored in the CLI's own credential store (not
  in `.env`, not in any repo file). Org `Kush`.
  ⚠️ That key was pasted into a chat transcript — rotate it after the hackathon.

### Credits

- **Codex** — $100 / 2,500 credits, individual single-use link at Sunday check-in. See the banner above.
- **Modal** — $100 form submitted pre-hackathon. Confirm the workspace shows the balance
  in the dashboard once `modal setup` completes (`modal profile current` names the workspace).
- **Greptile** — 100 credits applied by organizers on hackathon day to the signup account.
  Nothing to redeem via CLI.
- **claude-mem** — FASTHACK30 at cmem.ai, browser only.
- **Stripe** — intentionally unused (INTEGRATIONS.md §5).

## Correction to the plan

INTEGRATIONS.md §3 and the kickoff prompt both say Greptile has "no CLI — GitHub App +
dashboard only". That is no longer true: `npm i -g greptile` installs an official CLI
(v3.4.1) whose `greptile review --json` reviews the **working branch** with no PR and no
`GITHUB_TOKEN`. AFR now uses it as the primary Greptile source; the PR-comment path and a
saved finding remain as fallbacks. See `docs/greptile-notes.md`.

## Secret hygiene

- `.env` is gitignored; only `.env.example` (no values) is committed.
- Modal auth lives in `~/.modal.toml`; Codex auth in `$CODEX_HOME` (default `~/.codex`).
- Nothing credential-adjacent is written to any file in this repo.
