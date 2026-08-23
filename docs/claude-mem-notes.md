# claude-mem notes

Installed 2026-08-23, v13.15.3. Build-time memory across the weekend's sessions.

## State

```
npx claude-mem install --provider claude --no-auto-start   # done (non-TTY safe)
npx claude-mem start                                       # worker running
npx claude-mem status                                      # PID 12210, port 37701
```

- Plugin dir: `~/.claude/plugins/marketplaces/thedotmack`
- Data: `~/.claude-mem` (stays on this machine)
- Native Claude Code auto-memory was **left enabled** — the two coexist.
- Auth: piggybacks on Claude Code, no key needed.
- Install warning logged: a `tree-sitter` peer-dep ERESOLVE resolved via
  `--legacy-peer-deps`. Benign for the marketplace install.

## To do (human)

1. Restart Claude Code so the hooks attach. Memory injection starts on the **second**
   session in a project — the first session is the one being recorded.
2. Optional Pro: enter **FASTHACK30** at https://cmem.ai (30 days).
3. Local viewer: http://127.0.0.1:37701

## House rules for this repo

- Wrap anything credential-adjacent — the Codex credit link, API keys, token values —
  in `<private>` tags so it is excluded from stored observations.
- End every session with one line: `DONE: … NEXT: …`, so the next session's injected
  summary is sharp.
- Query past sessions with `npx claude-mem search "<query>"` or the MCP search tools
  rather than scrolling transcripts.

## Caveat

This machine already runs the memhub plugin's hooks. Two memory systems now observe
the same sessions; if injections look duplicated, that is why. Neither is load-bearing
for the demo.
