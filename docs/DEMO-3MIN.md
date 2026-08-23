# Mayday — 3-minute video script

Run with `AFR_OFFLINE=1 npm run dev`. The **Demo tab inside the app** carries this
same script with copy buttons and one-click actions, plus the live before/after belief.
Verify the whole run with `npm run rehearse`. Every result on screen is real, served from
`demo/cache/`. Nothing depends on the network.

---

## 0:00–0:20 · The premise

**SHOW** Terminal, then the About page hero.

> "AI agents write a third of our code now. When agent code breaks in production,
> `git blame` says: the agent did it. Then the trail goes cold.
> Planes have black boxes. Your coding agent doesn't. So we built one."

---

## 0:20–0:50 · The agent ships

**SHOW** `npm run record -- "add pagination to GET /items and make the user_id filter optional"`
(or the recorded capture), then `npm test` → **8/8 green**.

> "Codex takes a normal ticket. Twenty-four steps. It reads the schema, checks the
> database, writes the code, writes its own tests. Eight of eight green. Ship it."

---

## 0:50–1:10 · Production disagrees ⚡

**SHOW** `npm run prod-sim` → red stack trace.

> "That's real production traffic. `TypeError: cannot read properties of null`.
> Tests were green. Prod is down.
> The agent wrote this across twenty-four steps. **Which one?** And **why?**"

---

## 1:10–2:05 · Incident mode — the core ⚡⚡⚡

**SHOW** Paste the stack trace → Analyze.

> "Paste the crash into Mayday."

**Beat. Let the timeline dim.**

> "Twenty-four steps just became two.
> **Step 12** wrote the failing line. But that's not the interesting part —
> step 12 was *reasonable*. The interesting part is **why** it was reasonable."

**SHOW** The BEFORE / AFTER belief pair in the forensics card.

> "Left: what the agent believed — *omitting user_id and dropping the WHERE clause
> safely returns all items.* Struck through, because it's false.
> Right: what's actually true.
> And that belief came from **step 9** —"

**SHOW** Click the assumption chip → scrubber jumps to step 9.

> "— right there. That's where it formed.
> This isn't where the bug is. It's **the belief that caused it, and where the belief
> came from.**"

---

## 2:05–2:45 · Time travel ⚡⚡

**SHOW** Click **Re-run from step 12**.

> "One click. Mayday rebuilds the repo exactly as it was *before* step 12 — from
> snapshots it took while recording — and re-runs Codex in an isolated Modal sandbox,
> with the corrected belief injected into the task."

**SHOW** Green tests + the diff.

> "Sixty-seven seconds. Tests green, production traffic green, and here's the fix it
> wrote — the exact guard it was missing. My laptop's repo was never touched."

---

## 2:45–3:00 · Close ⚡

> "One more thing. It took us **four** attempts to get this agent to ship the bug.
> It read the schema. It queried the database. It even read our own commit messages
> describing the trap — and defused it.
> It only shipped a crash when the truth wasn't anywhere it could look.
> That's the point. Good agents fail on **bad information** — and when they do, you
> need the recording.
> Every agent session should leave one. **Mayday.**"

---

## The moments that land

1. **8/8 green → prod down.** The gap everyone in the room has lived through.
2. **24 steps collapse to 2.** Pure visual. Say nothing for a beat.
3. **The BEFORE / AFTER belief pair.** False belief struck through in red, ground truth in
   green, side by side. Two lines that contain the whole product.
4. **"Not where the bug is — the belief that caused it."** The one line to remember.
5. **Chip click → jumps to step 9.** Proof the chain is real, not a summary.
6. **67 seconds to a verified fix.** And you show the diff.

## Numbers worth saying out loud

- 117 assumptions extracted for **$0.08**
- root cause for **$0.03**, high confidence
- 67s from crash to a sandbox-verified fix
- offline: 55ms incident, 10ms re-run — all cached, all real

## If asked

- *"How is this different from logs?"* — Logs record actions. Mayday records
  **beliefs**, and links them to outcomes.
- *"Does it work with other agents?"* — The schema is agent-agnostic. Codex first.
- *"What's the business?"* — Agent observability. The Datadog moment for
  agent-written code.
- *"Where does Greptile fit?"* — A review comment is a pre-production incident.
  Greptile says **what's** wrong with the diff; Mayday says **why the agent wrote it.**

## Fallbacks

- Live record too slow → play the capture; the golden trace carries everything after.
- Wifi dies → you're already offline. `AFR_OFFLINE=1` is the default for this demo.
- Agent dodges the trap live → "it learned — luckily we recorded yesterday's session."
