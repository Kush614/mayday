# Sponsor Integrations

Every sponsor (except Stripe, unused) plays a real role — not a logo-slide role.
Judges reward integrations that are load-bearing; here's how each one is.

## 1. OpenAI Codex — $100 / 2,500 credits (REQUIRED by rules)

Codex must play a "meaningful role in building your project." We use it three ways:

1. **The recorded subject.** AFR records Codex CLI sessions — Codex is literally the
   star of the product demo (`codex exec --json` on the target app).
2. **The re-run engine.** Incident Mode's fix re-runs Codex inside a Modal sandbox
   with the corrected assumption injected into the task.
3. **Build tool.** Use Codex CLI (alongside Claude Code) for chunks of the build so
   the "meaningful role in building" box is checked twice over; keep a couple of
   commit messages noting Codex-generated modules.

Credits logistics:
- Individual single-use link at Sunday check-in. Sign in to ChatGPT **personal
  workspace first** (credits can't land in Business/managed workspaces).
- Redeem before Aug 25 11:59 PM PT; valid 30 days.
- Until Sunday, develop against your own key; keep enrichment on a cheap model.
- API key also feeds the enricher + incident verdict calls via
  `packages/enricher/src/llm.ts` (single choke point logs per-call cost).

## 2. Modal — $100

Role: **sandboxed time-travel re-runs** (`modal/replay_sandbox.py`) and optional
parallel enrichment (`modal/enrich_batch.py`).

Setup:
- Fill the credits form (done pre-hackathon), `pip install modal`, `modal setup`.
- Store the OpenAI key: `modal secret create openai-secret OPENAI_API_KEY=...`
- Image: `modal.Image.debian_slim().apt_install("git", "curl")` + Node 20 install +
  `npm i -g @openai/codex`. Bake the image Saturday night so Sunday cold-starts are
  just container pulls.
- Expose the re-run as a `@modal.fastapi_endpoint` so the UI button can POST
  `{session_id, from_step, correction}` and poll status.
- Prefer `modal.Sandbox` for executing the untrusted agent re-run — it's the right
  primitive and the better demo line: "the agent retries in an isolated cloud
  sandbox, not on my laptop."
- Verify current Sandbox/API syntax against modal.com/docs/guide at build time —
  the SDK moves fast; don't code it from memory.

Demo line: "Fix is one click: AFR reconstructs the exact repo state before step 14,
re-runs Codex with the corrected assumption in a Modal sandbox, and runs the tests —
green in ~60 seconds."

## 3. Greptile — 100 credits

Two roles:

**a) Dogfood reviewer (setup, zero code).** Greptile app installed on the submission
repo; it reviews every PR (~3 min turnaround) with full-codebase context. We commit
in small PRs so it functions as our QA. Screenshot 2–3 of its best catches for the
"built responsibly, fast" slide. Its "Fix with your Agent" button dispatches findings
to Claude Code/Codex — which we actually use mid-hackathon.

**b) Incident-source integration (small code).** A Greptile review finding is a
*pre-production incident artifact*: `{path, line_range, comment}`. Incident Mode
accepts it directly — "Import from Greptile PR review" maps the finding through the
line_origin index to the agent step that wrote those lines and surfaces the
assumption behind them. Story: *Greptile tells you WHAT is wrong with the diff; AFR
tells you WHY the agent wrote it.* Implementation: fetch the PR review comments
(Greptile posts as PR comments — GitHub API is enough; check greptile.com/docs for a
native API if time permits), normalize to the incident artifact shape. If the API
path is slow, a saved finding JSON loaded by the button is acceptable for the demo
and still truthful.

## 4. claude-mem (CMEM Pro, 30 days, code FASTHACK30)

Role: **build-time memory** for Claude Code across the weekend's many sessions.

- `npx claude-mem install`, restart Claude Code; redeem FASTHACK30 at cmem.ai.
- It auto-injects summaries of the last sessions on start, captures tool-use
  observations via lifecycle hooks, and generates folder CLAUDE.md activity
  timelines — so Sunday-morning sessions know what Saturday-night sessions did.
- Use `<private>` tags around anything touching credit links/keys so they're
  excluded from stored observations.
- Its MCP search tools ("what did we decide about the trace schema?") replace
  scrolling old sessions.
- Pitch garnish (optional, honest): claude-mem is itself proof of the thesis — agent
  work needs durable, queryable records of what the agent did and why. AFR is that
  idea aimed at forensics.

## 5. Stripe — intentionally unused

Nothing to integrate; skip. (Credits expire unredeemed; no action.)

## Env checklist

```
OPENAI_API_KEY=            # own key Sat, credited Sun
MODAL_TOKEN_ID=            # via `modal setup`
MODAL_TOKEN_SECRET=
GITHUB_TOKEN=              # read PR review comments (Greptile findings)
```
