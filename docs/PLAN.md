# Build Plan — hour by hour

Two hackers: **A** (capture + incident + Modal), **B** (enricher + UI).
Solo? Follow A's track, use the golden-trace fallback aggressively, cut M6.

## Before the hackathon (Fri/Sat morning, ~2h)

- [ ] Redeem/verify credits: Codex ($100 link at Sun check-in — until then use your
      own key sparingly), Modal ($100 form), Greptile (signup + enable on the repo),
      claude-mem (`npx claude-mem install`, code FASTHACK30 at cmem.ai).
- [ ] `modal setup` (token), `modal run` hello world once so auth is never a stage risk.
- [ ] Install Codex CLI, run `codex exec --json "echo hi"` in a scratch dir, save the
      raw event stream to `docs/codex-events-sample.txt` — this defines the recorder's
      parser. Also locate the session/rollout log under `~/.codex/`.
- [ ] Create GitHub repo, push CLAUDE.md + docs/, install Greptile app on it, open a
      trivial PR to confirm reviews fire.
- [ ] Scaffold monorepo (npm workspaces), Vite UI shell, empty packages, CI-less.
- [ ] Write demo/target-app + the stale-schema trap + prod-sim crash script.

## Saturday

### 09:00–10:00 — Kickoff
- Both: read SPEC.md aloud, agree schema is frozen. A starts recorder, B starts UI shell
  against a hand-written fake trace (write 15 fake events by hand NOW — B must never
  block on A).

### 10:00–13:00 — M1: Recorder (A) / UI skeleton (B)
- A: spawn codex exec --json, parse events → TraceEvents, blob snapshots, session_end
  diff. Run against target app with the demo task. Iterate until trace is rich.
- B: timeline scrubber + step card rendering fake trace; file panel reads blobs.
- ✅ 13:00 checkpoint: `npm run record` yields a real trace; UI scrubs the fake one.

### 13:00–17:00 — M2: Enricher (B) / line-history index (A)
- B: llm.ts choke point, enrich prompt, parallel pass, JSON-mode validation w/ Zod,
  write enriched.jsonl. Run on the real trace; eyeball assumptions quality; iterate
  prompt until the stale-schema assumption appears with basis_step pointing at the
  schema-read step.
- A: diff replayer + line_origin SQLite index; unit test with 3 synthetic edits.
- ✅ 17:00: enriched golden-trace candidate exists. COMMIT IT to demo/traces/.

### 17:00–21:00 — M3: UI on real enriched trace
- B: swap fake→golden trace, assumption chips, basis_step jump, risk glow, polish
  dark theme, keyboard nav.
- A: trace API server (Express, serves traces + SQLite queries), record 2 more
  sessions to check recorder robustness; pick the best as THE golden trace.
- ✅ 21:00: full scrub of golden trace looks demo-worthy. Record a screen capture as
  insurance. Sleep.

## Sunday

### 08:00–10:00 — M4: Incident engine (A) / UI incident overlay (B)
- A: stack-trace parser → line_origin lookup → verdict LLM call → incident.json.
  Test with prod-sim crash output. Target <10s.
- B: overlay UI, dimmed-timeline chain highlight, red assumption chip, forensics card.
- ✅ 10:00: paste crash → correct step + assumption on screen.

### 10:00–12:30 — M5: Modal re-run
- A: replay_sandbox.py — image w/ Node+Codex, reconstruct state to step N-1, re-run
  with correction, run tests, return results. fastapi_endpoint wrapper. Wire the
  UI button (B assists). Store OPENAI_API_KEY as Modal Secret.
- Redeem the $100 Codex credits from check-in link (personal workspace!) before this.
- ✅ 12:30: button → sandbox → green tests → new diff in UI. Screen-record it.

### 12:30–14:00 — M6 (stretch): Greptile → Incident
- Open a PR containing the agent's buggy diff; Greptile reviews in ~3 min. Fetch the
  finding (API or copy JSON), feed as incident artifact. If time is short: the
  "Import from Greptile" button loads a saved finding JSON — still a true story.
- Also: screenshot the best Greptile reviews of YOUR OWN repo for the "we dogfood
  reviews" slide.

### 14:00–15:30 — M7: Freeze + rehearse
- Feature freeze. Fix only demo-path bugs. Rehearse DEMO.md 3× on golden trace with
  network off (except Modal step — have the recording as fallback). Prepare the
  30-second "what if Modal/wifi dies" branch.

### 15:30 — Submit
- README with the pitch, architecture diagram, sponsor-usage section, screen
  recordings linked. Final Greptile-reviewed PR merged.

## Standing rules

- Golden trace is sacred; regenerate only if strictly better, then re-test incident
  mode against it immediately.
- Every 2h: commit, push, open PR (Greptile review = free QA + demo material).
- claude-mem carries context between Claude Code sessions — end each session by
  stating "done/next" in one line so the next session's injected summary is sharp.
- Any task >30 min behind: cut scope per CLAUDE.md scope guard, don't grind.
