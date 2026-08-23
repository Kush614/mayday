/**
 * Demo tab — the run-of-show, on screen, during the demo.
 *
 * Each beat says what to say, exactly where to click, and (where useful) drives
 * the app itself: copy the crash to the clipboard, jump the scrubber to a step,
 * or open Incident Mode with the stack trace already pasted.
 */
import { useState } from "react";

export const CRASH_TEXT = `TypeError: Cannot read properties of null (reading 'toString')
    at ownerCode (/app/demo/target-app/src/owner.ts:6:22)
    at toDTO (/app/demo/target-app/src/items.ts:28:17)
    at Array.map (<anonymous>)
    at listItems (/app/demo/target-app/src/items.ts:67:17)`;

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
        } catch {
          // clipboard can be blocked; the text is on screen to copy by hand
        }
        setCopied(true);
        setTimeout(() => setCopied(false), 1600);
      }}
      className={`press border-2 border-edge px-3 py-1.5 text-[11px] font-black uppercase shadow-hard-sm ${
        copied ? "bg-ok text-black" : "bg-raised"
      }`}
    >
      {copied ? "copied ✓" : label}
    </button>
  );
}

function Beat({
  time,
  title,
  say,
  clicks,
  children,
  tone = "raised",
}: {
  time: string;
  title: string;
  say: string;
  clicks: { where: string; what: string }[];
  children?: React.ReactNode;
  tone?: "raised" | "danger" | "ok" | "warn" | "accent";
}) {
  const head = {
    raised: "bg-panel",
    danger: "bg-danger text-white",
    ok: "bg-ok",
    warn: "bg-warn",
    accent: "bg-accent",
  }[tone];
  return (
    <div className="border-2 border-edge bg-raised shadow-hard">
      <div className={`flex items-center gap-3 border-b-2 border-edge px-5 py-3 ${head}`}>
        <span className="border-2 border-edge bg-ink px-2 py-0.5 font-mono text-xs font-black text-body">{time}</span>
        <span className="text-sm font-black uppercase tracking-wide">{title}</span>
      </div>

      <div className="space-y-4 px-5 py-4">
        <div>
          <div className="mb-1 text-[10px] font-black uppercase tracking-[0.2em] text-muted">say</div>
          <p className="border-l-4 border-edge pl-3 text-sm italic leading-relaxed">&ldquo;{say}&rdquo;</p>
        </div>

        <div>
          <div className="mb-2 text-[10px] font-black uppercase tracking-[0.2em] text-muted">do</div>
          <ol className="space-y-2">
            {clicks.map((c, i) => (
              <li key={i} className="flex gap-3 text-sm">
                <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center border-2 border-edge bg-accent text-[10px] font-black text-black">
                  {i + 1}
                </span>
                <span className="leading-snug">
                  <span className="border-2 border-edge bg-warn px-1.5 py-0.5 text-xs font-black text-black">{c.where}</span>{" "}
                  {c.what}
                </span>
              </li>
            ))}
          </ol>
        </div>

        {children}
      </div>
    </div>
  );
}

export function DemoGuide({
  onJumpToStep,
  onOpenIncident,
}: {
  onJumpToStep: (step: number) => void;
  onOpenIncident: (prefill: string) => void;
}) {
  return (
    <div className="min-h-0 flex-1 overflow-auto bg-ink">
      <div className="mx-auto max-w-4xl px-8 py-10">
        <div className="mb-3 inline-block border-2 border-edge bg-danger px-3 py-1 text-[11px] font-black uppercase tracking-[0.2em] text-white shadow-hard-sm">
          run of show · 3 minutes
        </div>
        <h1 className="text-4xl font-black tracking-tight">Demo script</h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted">
          Start the app with <span className="border-2 border-edge bg-code px-1.5 font-mono text-xs">AFR_OFFLINE=1 npm run dev</span>{" "}
          — every result below is real, served from <span className="font-mono text-xs">demo/cache/</span>, with no network.
          The buttons on this page drive the app, so you can run the demo from here.
        </p>

        <div className="my-6 border-2 border-edge bg-warn px-5 py-4 shadow-hard">
          <div className="text-xs font-black uppercase tracking-wide text-black">Before you start</div>
          <ul className="mt-2 space-y-1 text-sm font-semibold text-black">
            <li>· Session picker (top bar) shows <strong>★ add pagination to GET /items … · 24 steps</strong></li>
            <li>· Theme toggle top-right — light reads better on a projector</li>
            <li>· Browser zoom 125–150%</li>
          </ul>
        </div>

        <div className="space-y-6">
          <Beat
            time="0:00"
            title="The premise"
            tone="accent"
            say="AI agents write a third of our code. When agent code breaks in production, git blame says: the agent did it. Then the trail goes cold. Planes have black boxes. Your coding agent doesn't. So we built one."
            clicks={[{ where: "ABOUT tab", what: "open it for the hero, then come back to REPLAY" }]}
          />

          <Beat
            time="0:20"
            title="The agent ships"
            say="Codex takes a normal ticket. Twenty-four steps. It reads the schema, checks the database, writes the code, writes its own tests. Eight of eight green. Ship it."
            clicks={[
              { where: "REPLAY tab", what: "the timeline is the whole session — 24 steps" },
              { where: "Terminal", what: "run npm test in demo/target-app → 8/8 green" },
            ]}
          >
            <div className="flex flex-wrap items-center gap-3">
              <CopyButton text="npm test --workspace @mayday/target-app" label="copy test command" />
              <button
                onClick={() => onJumpToStep(12)}
                className="press border-2 border-edge bg-raised px-3 py-1.5 text-[11px] font-black uppercase shadow-hard-sm"
              >
                jump to step 12
              </button>
            </div>
          </Beat>

          <Beat
            time="0:50"
            title="Production disagrees"
            tone="danger"
            say="That's real production traffic. TypeError: cannot read properties of null. Tests were green. Prod is down. The agent wrote this across twenty-four steps. Which one? And why?"
            clicks={[{ where: "Terminal", what: "run npm run prod-sim → red stack trace" }]}
          >
            <div className="flex flex-wrap items-center gap-3">
              <CopyButton text="npm run prod-sim" label="copy prod-sim command" />
            </div>
          </Beat>

          <Beat
            time="1:10"
            title="Incident mode — the core"
            tone="danger"
            say="Paste the crash into Mayday. … Twenty-four steps just became two. Step 12 wrote the failing line — but step 12 was reasonable. The interesting part is why it was reasonable."
            clicks={[
              { where: "INCIDENT MODE", what: "red button, top right of the app" },
              { where: "the textarea", what: "paste the stack trace (button below pastes it for you)" },
              { where: "ANALYZE", what: "bottom right of the dialog — then pause and let the timeline dim" },
              { where: "BEFORE / AFTER", what: "read the false belief, then the corrected one, straight off the card" },
              { where: "assumption chip", what: "in the forensics card, click “step 9 · belief formed here”" },
            ]}
          >
            <div className="space-y-3">
              <pre className="max-h-40 overflow-auto border-2 border-edge bg-code p-3 font-mono text-[11px] leading-relaxed">
                {CRASH_TEXT}
              </pre>
              <div className="flex flex-wrap items-center gap-3">
                <CopyButton text={CRASH_TEXT} label="copy stack trace" />
                <button
                  onClick={() => onOpenIncident(CRASH_TEXT)}
                  className="press border-2 border-edge bg-danger px-4 py-1.5 text-[11px] font-black uppercase text-white shadow-hard"
                >
                  open incident mode, pre-pasted
                </button>
              </div>
              <div className="border-2 border-edge bg-panel px-3 py-2 text-xs font-bold">
                ⏸ After ANALYZE, stop talking for two seconds. The dimming timeline is the demo.
              </div>
              <div className="border-2 border-edge bg-accent px-3 py-2 text-xs font-bold text-black">
                👀 Point at the <strong>BEFORE / AFTER</strong> pair in the forensics card. Read the struck-through
                belief, then the green one. That contrast is the whole product in two lines.
              </div>
            </div>
          </Beat>

          <Beat
            time="2:05"
            title="Time travel"
            tone="ok"
            say="One click. Mayday rebuilds the repo exactly as it was before step 12 — from snapshots it took while recording — and re-runs Codex in an isolated Modal sandbox with the corrected belief. Sixty-seven seconds. Tests green, production traffic green, and here's the fix it wrote. My laptop's repo was never touched."
            clicks={[
              { where: "RE-RUN FROM STEP 12", what: "green button in the forensics card" },
              { where: "the result panel", what: "scroll to the diff — read the one changed line out loud" },
            ]}
          />

          <Beat
            time="2:45"
            title="The close"
            tone="warn"
            say="One more thing. It took us four attempts to get this agent to ship the bug. It read the schema. It queried the database. It even read our own commit messages describing the trap — and defused it. It only shipped a crash when the truth wasn't anywhere it could look. Good agents fail on bad information — and that's exactly when you need the recording. Every agent session should leave one. Mayday."
            clicks={[{ where: "ABOUT tab", what: "scroll to “The agent is hard to fool” and end there" }]}
          />
        </div>

        <div className="mt-10 grid gap-5 md:grid-cols-2">
          <div className="border-2 border-edge bg-raised p-5 shadow-hard">
            <div className="mb-3 text-sm font-black uppercase tracking-wide">Numbers to say out loud</div>
            <ul className="space-y-1.5 text-sm">
              <li>· 117 assumptions extracted for <strong>$0.08</strong></li>
              <li>· root cause for <strong>$0.03</strong>, high confidence</li>
              <li>· <strong>67s</strong> from crash to sandbox-verified fix</li>
              <li>· offline: 55ms incident, 10ms re-run — real data, cached</li>
            </ul>
          </div>

          <div className="border-2 border-edge bg-raised p-5 shadow-hard">
            <div className="mb-3 text-sm font-black uppercase tracking-wide">If something breaks</div>
            <ul className="space-y-1.5 text-sm">
              <li>· Wifi dies → you are already offline. Keep going.</li>
              <li>· A live capture stalls → switch to the ★ golden trace in the picker.</li>
              <li>· Agent dodges the trap live → &ldquo;it learned — luckily we recorded yesterday&apos;s session.&rdquo;</li>
            </ul>
          </div>
        </div>

        <div className="mt-6 border-2 border-edge bg-panel p-5 shadow-hard">
          <div className="mb-3 text-sm font-black uppercase tracking-wide">Questions you will get</div>
          <dl className="space-y-3 text-sm">
            {[
              ["How is this different from logs?", "Logs record actions. Mayday records beliefs, and links them to outcomes."],
              ["Does it work with other agents?", "The trace schema is agent-agnostic. Codex first."],
              ["What's the business?", "Agent observability — the Datadog moment for agent-written code."],
              ["Where does Greptile fit?", "A review comment is a pre-production incident. Greptile says what's wrong with the diff; Mayday says why the agent wrote it."],
            ].map(([q, a]) => (
              <div key={q}>
                <dt className="font-black">{q}</dt>
                <dd className="text-muted">{a}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </div>
  );
}
