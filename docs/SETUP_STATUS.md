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
| Modal | client 1.5.4 | ❌ no `~/.modal.toml`, no profiles | `modal --version`, `modal profile list` |
| Greptile CLI (`greptile`) | 3.4.1 | ❌ `greptile whoami` → *Not signed in* | `greptile --version`, `greptile review --help` |
| claude-mem | 13.15.3 | ✅ uses Claude Code's own auth | worker running, PID checked via `claude-mem status` |

### Blocked on a human (browser / account)

1. `codex login` — browser flow. Alternative: `export OPENAI_API_KEY=…` then `codex login --api-key`.
2. `modal setup` — browser flow, writes `~/.modal.toml`. Then:
   `modal secret create openai-secret OPENAI_API_KEY=$OPENAI_API_KEY` (run in your own
   shell so the key never enters an agent transcript).
3. `greptile login` — browser, or `greptile login --api-key` (reads from stdin).
4. claude-mem Pro: enter **FASTHACK30** at https://cmem.ai (30 days). Optional.
5. Restart Claude Code once so claude-mem's hooks attach; memory injection begins on
   the *second* session in a project.

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
