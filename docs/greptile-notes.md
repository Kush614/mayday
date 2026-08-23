# Greptile notes

Read from live docs 2026-08-23. CLI **v3.4.1**. Sources:
[llms.txt index](https://www.greptile.com/docs/llms.txt),
[CLI](https://www.greptile.com/docs/code-review/greptile-cli.md),
[Fix with your Agent](https://www.greptile.com/docs/integrations/fix-with-your-agent.md).

## Correction to INTEGRATIONS.md §3

The spec says Greptile is "GitHub App + dashboard, no CLI". **There is now an official
CLI** — `npm i -g greptile` — and it changes our integration for the better:

```bash
greptile review --json          # reviews the CURRENT BRANCH, no PR, no GITHUB_TOKEN
```

That removes the demo's slowest dependency (open a PR → wait ~3 min → poll the GitHub
API). Mayday now treats the CLI as the primary Greptile source.

## Auth

```bash
greptile login                  # browser
greptile login --api-key        # reads the key from a prompt/stdin
export GREPTILE_API_KEY=…       # non-interactive; `greptile review` picks it up
greptile whoami                 # verify
```

Docs warn explicitly: never pass the key as a command-line argument (shell history and
process lists leak it). Use the env var or the stdin prompt.

## Review flags that matter to us

| Flag | Use |
|---|---|
| `--json` | Machine-readable findings → our incident artifact |
| `--branch <b>` | Base branch to diff against (default: repo default) |
| `--instructions "…"` | Same as `@greptile <instructions>` in a PR comment |
| `--include <paths…>` | Force-include files held back as sensitive |
| `--resume` | Continue the latest unfinished review |

## Finding shape → incident artifact

**The JSON schema is not documented**, so `packages/incident/src/greptile.ts`
normalizes defensively rather than assuming field names:

| Our field | Accepted source keys |
|---|---|
| `path` | `path`, `file`, `filePath`, `file_path`, `filename` |
| `line_range` | `line_range` / `lineRange` / `lines` array, else `start_line`…`line`/`end_line`/`original_line` |
| `comment` | `comment`, `body`, `message`, `description`, `text`, `content` |
| `url` | `url`, `html_url`, `link` |

Findings are collected out of whatever container wraps them (`comments`, `findings`,
`results`, `review`, `issues`, `data`, or a bare array). Anything without both a
location and text is dropped. Covered by `packages/incident/test/greptile.test.ts`.

**Confirm the real shape on first authenticated run** and tighten if needed:
```bash
greptile review --json | tee docs/greptile-finding-sample.json
```

## Three sources, tried in order

`GET /api/greptile` (and the UI's "Import from Greptile PR review" button):

1. **CLI** — `greptile review --json` against `demo/target-app`
2. **GitHub PR comments** — `?pr=<n>&repo=owner/name`, needs `GITHUB_TOKEN`;
   Greptile posts as review comments from `greptile-apps[bot]` / `greptileai[bot]`
3. **Saved finding** — `demo/greptile-finding.json`, works offline and is still truthful

CLI equivalent: `npm run incident -- traces/<id>.enriched.jsonl --greptile-review`

## Fix with your Agent

Clicking it in a review: browser opens the `Greptile Fix` protocol handler → you pick
the local repo directory → your agent launches with a prompt carrying the file, line
numbers, the comment, and the suggested fix. Setup: link the GitHub account in
Settings, install the CLI (`npm i -g greptile`, it doubles as the bridge), and pick the
agent (Claude Code / Codex / Conductor / Cursor / Devin) in Review Settings.

For the demo this is the mirror image of Incident Mode, and worth saying out loud:
Greptile dispatches *what to fix* to the agent; Mayday answers *why the agent wrote it*.

## Credits

100 credits applied by organizers on hackathon day to the signup account. Nothing to
redeem via CLI.
