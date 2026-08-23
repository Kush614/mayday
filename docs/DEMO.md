# Demo Script — 3 minutes

## The hook (0:00–0:20)

> "AI agents now write a third of our code. When agent code breaks in prod,
> `git blame` says: the agent did it. Then the trail goes cold. Planes have black
> boxes. Your coding agent doesn't. We built one."

## Act 1 — Record (0:20–0:50)

- Terminal: `npm run record -- "add pagination to GET /items and make the user_id filter optional, so that omitting user_id returns items across all users"`
- Codex CLI runs live (or time-lapse if slow). Tests pass. "Great, ship it."
- Cut to Greptile's PR review of the diff already posted (pre-opened PR):
  "Even our reviewer signed off... mostly." *(If Greptile flagged the bug, even
  better — pivot: 'and here's WHY the agent wrote that line.')*

## Act 2 — Crash (0:50–1:10)

- `npm run prod-sim` → guest-cart request → `TypeError: Cannot read properties of null (reading 'toString')` at `owner.ts:6` ← `items.ts:67`.
- "Prod is down. The agent wrote this three hours ago across 14 steps. Which step?
  And why?"

## Act 3 — Incident Mode (1:10–2:10) ← the core

- Open AFR UI on the recorded trace. Paste the stack trace. Analyze.
- Timeline dims except two glowing steps. Forensics card:
  - **Step 12** wrote `items.ts:67` (`items: rows.map(toDTO)`).
  - **False assumption:** "Omitting `user_id` should return items across all users;
    an empty WHERE clause correctly yields that behavior" — **based on step 9**.
  - Click the assumption chip → scrubber jumps to step 9, the belief's origin.
- "It's not just where the bug is. It's the belief that caused it, and where the
  belief came from. Greptile findings plug in here too — reviewer comment in,
  root-cause step out."

## Act 4 — Time travel (2:10–2:50)

- Click **Re-run from step 12**. "AFR reconstructs the repo exactly as it was before
  step 14 and re-runs Codex — with the corrected assumption — in an isolated Modal
  sandbox."
- Live status → green tests → new diff side-by-side with the old one.
- "Sixty seconds from stack trace to verified fix, without touching my laptop's repo."

## Close (2:50–3:00)

> "Every agent session should leave a flight recording. Recording is free,
> forensics are instant, and debugging becomes time travel. Agent Flight Recorder."

## Fallback branches (rehearse these!)

- **Live record too slow/flaky** → play the pre-recorded capture video, keep the
  golden trace for everything after (identical UX, zero risk).
- **Modal/wifi dies at Act 4** → "here's this morning's run" → play the screen
  recording of the sandbox re-run. Practice the pivot sentence so it's smooth.
- **Agent dodges the trap in live record** → laugh line: "it learned — luckily we
  recorded yesterday's session," switch to golden trace.

## Rehearsal checklist (Sun 14:00+)

- [ ] 3 full runs on golden trace, network off except Act 4
- [ ] Both screen recordings exported and playable locally
- [ ] UI zoom level set for projector (125–150%), dark theme checked on projector
- [ ] Timer: each act within ±5s of script
- [ ] One-sentence answers ready for: "how is this different from logs?" (logs record
      actions; AFR records *beliefs* and links them to outcomes), "does it work with
      other agents?" (schema is agent-agnostic; Codex first), "what's the business?"
      (agent observability — the Datadog moment for agent-written code)
