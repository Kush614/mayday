/**
 * About page — what Mayday is, how it works, and what each sponsor actually
 * carries. Diagrams are inline SVG so they inherit the theme and animate
 * without any asset loading.
 */

function Card({
  children,
  className = "",
  tone = "raised",
}: {
  children: React.ReactNode;
  className?: string;
  tone?: "raised" | "accent" | "accent2" | "warn" | "ok" | "danger";
}) {
  const bg = {
    raised: "bg-raised",
    accent: "bg-accent",
    accent2: "bg-accent2",
    warn: "bg-warn",
    ok: "bg-ok",
    danger: "bg-danger text-white",
  }[tone];
  return <div className={`border-2 border-edge ${bg} shadow-hard ${className}`}>{children}</div>;
}

function SectionTitle({ children, kicker }: { children: React.ReactNode; kicker?: string }) {
  return (
    <div className="mb-5">
      {kicker && <div className="mb-1 text-[11px] font-black uppercase tracking-[0.2em] text-muted">{kicker}</div>}
      <h2 className="text-2xl font-black tracking-tight">{children}</h2>
    </div>
  );
}

/** The black box metaphor, drawn: a flight recorder surviving the crash. */
function BlackBoxDiagram() {
  return (
    <svg viewBox="0 0 620 200" className="w-full" role="img" aria-label="A plane's flight recorder survives the crash">
      <style>{`
        .fly { animation: fly 7s linear infinite; }
        @keyframes fly { 0% { transform: translateX(-70px);} 100% { transform: translateX(560px);} }
        .blink { animation: blink 1.4s steps(2, jump-none) infinite; }
        @keyframes blink { 0%,100% { opacity: 1 } 50% { opacity: .25 } }
        .trail { stroke-dasharray: 6 10; animation: dash 1.2s linear infinite; }
        @keyframes dash { to { stroke-dashoffset: -32; } }
      `}</style>

      <line x1="10" y1="70" x2="600" y2="70" stroke="var(--color-edge)" strokeWidth="2" className="trail" opacity="0.5" />

      <g className="fly">
        <path
          d="M0 70 L34 62 L46 50 L54 50 L50 62 L70 58 L74 63 L50 74 L54 88 L46 88 L34 76 Z"
          fill="var(--color-accent)"
          stroke="var(--color-edge)"
          strokeWidth="2.5"
          strokeLinejoin="round"
        />
      </g>

      <g transform="translate(250 108)">
        <rect x="0" y="0" width="120" height="58" fill="var(--color-warn)" stroke="var(--color-edge)" strokeWidth="3" />
        <rect x="10" y="10" width="100" height="38" fill="none" stroke="var(--color-edge)" strokeWidth="2" strokeDasharray="5 5" />
        <circle cx="24" cy="29" r="6" fill="var(--color-danger)" stroke="var(--color-edge)" strokeWidth="2" className="blink" />
        <text x="44" y="34" fontSize="15" fontWeight="900" fill="var(--color-edge)" fontFamily="ui-monospace, monospace">
          REC
        </text>
        <text x="0" y="78" fontSize="12" fontWeight="800" fill="var(--color-edge)">
          the recorder keeps running
        </text>
      </g>
    </svg>
  );
}

/** The pipeline, with a token travelling along it. */
function PipelineDiagram() {
  const boxes = [
    { x: 8, label: "Codex", sub: "the agent", fill: "var(--color-accent)" },
    { x: 138, label: "Recorder", sub: "trace.jsonl", fill: "var(--color-accent2)" },
    { x: 268, label: "Enricher", sub: "assumptions", fill: "var(--color-warn)" },
    { x: 398, label: "Incident", sub: "root cause", fill: "var(--color-danger)" },
    { x: 528, label: "Sandbox", sub: "verified fix", fill: "var(--color-ok)" },
  ];
  return (
    <svg viewBox="0 0 640 150" className="w-full" role="img" aria-label="Record, enrich, investigate, re-run">
      <style>{`
        .pulse-dot { animation: run 6s linear infinite; }
        @keyframes run { 0% { transform: translateX(0) } 100% { transform: translateX(520px) } }
      `}</style>
      {boxes.slice(0, -1).map((b, i) => (
        <line
          key={i}
          x1={b.x + 104}
          y1={52}
          x2={boxes[i + 1]!.x}
          y2={52}
          stroke="var(--color-edge)"
          strokeWidth="2.5"
          markerEnd="url(#arrow)"
        />
      ))}
      <defs>
        <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto">
          <path d="M0 0 L10 5 L0 10 z" fill="var(--color-edge)" />
        </marker>
      </defs>

      {boxes.map((b) => (
        <g key={b.label} transform={`translate(${b.x} 26)`}>
          <rect x="4" y="4" width="104" height="52" fill="var(--color-edge)" />
          <rect x="0" y="0" width="104" height="52" fill={b.fill} stroke="var(--color-edge)" strokeWidth="2.5" />
          <text x="52" y="24" textAnchor="middle" fontSize="14" fontWeight="900" fill="#000">
            {b.label}
          </text>
          <text x="52" y="41" textAnchor="middle" fontSize="10" fontWeight="700" fill="#000" opacity="0.75">
            {b.sub}
          </text>
        </g>
      ))}

      <circle cx="112" cy="52" r="6" fill="var(--color-edge)" className="pulse-dot" />
    </svg>
  );
}

/** How a stack-trace line resolves back to the step that wrote it. */
function LineHistoryDiagram() {
  const rows = [
    { step: "step 4", label: "writes lines 1–40", fill: "var(--color-accent2)", w: 150 },
    { step: "step 9", label: "reads the schema", fill: "var(--color-warn)", w: 120 },
    { step: "step 12", label: "inserts line 67", fill: "var(--color-danger)", w: 190 },
  ];
  return (
    <svg viewBox="0 0 620 210" className="w-full" role="img" aria-label="A failing line maps back to the step that wrote it">
      {rows.map((r, i) => (
        <g key={r.step} transform={`translate(10 ${12 + i * 46})`}>
          <rect x="4" y="4" width={r.w} height="34" fill="var(--color-edge)" />
          <rect x="0" y="0" width={r.w} height="34" fill={r.fill} stroke="var(--color-edge)" strokeWidth="2.5" />
          <text x="10" y="22" fontSize="12" fontWeight="900" fill="#000">
            {r.step}
          </text>
          <text x={r.w + 14} y="22" fontSize="12" fontWeight="700" fill="var(--color-edge)">
            {r.label}
          </text>
        </g>
      ))}

      <g transform="translate(10 158)">
        <rect x="4" y="4" width="600" height="40" fill="var(--color-edge)" />
        <rect x="0" y="0" width="600" height="40" fill="var(--color-code)" stroke="var(--color-edge)" strokeWidth="2.5" />
        <text x="14" y="25" fontSize="12.5" fontWeight="800" fill="var(--color-danger)" fontFamily="ui-monospace, monospace">
          TypeError … at listItems (items.ts:67)
        </text>
        <text x="380" y="25" fontSize="12" fontWeight="900" fill="var(--color-edge)">
          → step 12 → assumption
        </text>
      </g>
      <line x1="300" y1="146" x2="300" y2="156" stroke="var(--color-edge)" strokeWidth="2.5" markerEnd="url(#arrow2)" />
      <defs>
        <marker id="arrow2" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto">
          <path d="M0 0 L10 5 L0 10 z" fill="var(--color-edge)" />
        </marker>
      </defs>
    </svg>
  );
}

const SPONSORS = [
  {
    name: "OpenAI Codex",
    tone: "accent" as const,
    role: "the recorded subject · the re-run engine · a build tool",
    body: "Mayday wraps `codex exec --json` and maps its event stream into the trace. The same CLI runs again inside the Modal sandbox with the corrected assumption appended to the original task. Building this surfaced two things worth knowing: exec sandboxes file writes read-only by default, and reasoning summaries are off unless you ask for them — without `-c model_reasoning_summary=detailed` a trace contains no beliefs at all.",
  },
  {
    name: "Modal",
    tone: "ok" as const,
    role: "sandboxed time-travel re-runs",
    body: "The repo is rebuilt exactly as it stood before the faulty step — from the recorder's content-addressed blobs — inside a fresh sandbox. Codex retries there with the corrected belief, then the unit tests and the production simulator both run. State is pushed at request time, so a new recording never needs a redeploy.",
  },
  {
    name: "Greptile",
    tone: "accent2" as const,
    role: "reviewer · and a source of incidents",
    body: "Greptile reviews every pull request here. Its findings are also a pre-production incident artifact: {path, line_range, comment} drops straight into Incident Mode, which maps those lines through the line-history index to the step that wrote them. Greptile tells you what is wrong with the diff; Mayday tells you why the agent wrote it.",
  },
  {
    name: "claude-mem",
    tone: "warn" as const,
    role: "build-time memory",
    body: "Persistent memory across the Claude Code sessions that built Mayday, so a session picks up where the last one stopped. Fitting, since it is the same thesis pointed at a different target: agent work needs durable records of what happened and why.",
  },
];

export function About() {
  return (
    <div className="min-h-0 flex-1 overflow-auto bg-ink">
      <div className="mx-auto max-w-5xl px-8 py-10">
        {/* Hero */}
        <div className="mb-12">
          <div className="mb-3 inline-block border-2 border-edge bg-accent px-3 py-1 text-[11px] font-black uppercase tracking-[0.2em] text-black shadow-hard-sm">
            YC Fast Hackathon · Aug 2026
          </div>
          <h1 className="text-5xl font-black leading-[1.05] tracking-tight">
            Planes have black boxes.
            <br />
            Your coding agent doesn&apos;t.
          </h1>
          <p className="mt-5 max-w-3xl text-base leading-relaxed">
            AI agents write a growing share of production code. When that code breaks,{" "}
            <span className="border-2 border-edge bg-code px-1.5 font-mono text-sm">git blame</span> names the agent and
            the trail goes cold. There is no record of what it believed, what it read, or which assumption turned out to
            be false. <strong>Mayday records the beliefs</strong> — and when production breaks, walks them backwards to
            the one that was wrong.
          </p>
          <Card className="mt-7 p-5" tone="raised">
            <BlackBoxDiagram />
          </Card>
        </div>

        {/* How it works */}
        <SectionTitle kicker="how it works">Four stages, one artifact</SectionTitle>
        <Card className="mb-6 p-5">
          <PipelineDiagram />
        </Card>
        <div className="mb-12 grid gap-4 md:grid-cols-2">
          {[
            ["1 · Record", "A wrapper around Codex CLI captures every reasoning item, command, and edit. Diffs are recomputed from disk, and every file version is snapshotted, so the trace can be replayed without git."],
            ["2 · Enrich", "One LLM call per step extracts what the step was trying to do, what it rejected, and — the part that matters — the assumptions it depended on, each linked back to the step where the belief formed."],
            ["3 · Investigate", "Paste a stack trace, a failing test, or a Greptile finding. Mayday resolves the failing line to the step that wrote it, then names the assumption that was false."],
            ["4 · Re-run", "Rebuild the repo as it was before that step, hand Codex the corrected belief, and run the tests plus real production traffic in a cloud sandbox."],
          ].map(([title, body]) => (
            <Card key={title} className="p-5">
              <div className="mb-2 text-sm font-black uppercase tracking-wide">{title}</div>
              <div className="text-sm leading-relaxed text-muted">{body}</div>
            </Card>
          ))}
        </div>

        {/* Line history */}
        <SectionTitle kicker="the load-bearing trick">A line number is not a step number</SectionTitle>
        <p className="mb-5 max-w-3xl text-sm leading-relaxed">
          Every edit shifts the lines beneath it. Mayday replays each diff in order and tracks that movement, so{" "}
          <span className="border-2 border-edge bg-code px-1.5 font-mono text-xs">items.ts:67</span> resolves to the step
          that actually wrote that line — not merely a step that touched the file. That index is what turns a crash into
          an answer.
        </p>
        <Card className="mb-12 p-5">
          <LineHistoryDiagram />
        </Card>

        {/* Real numbers */}
        <SectionTitle kicker="not a mock-up">What a real session produced</SectionTitle>
        <div className="mb-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["24", "steps recorded", "accent2"],
            ["117", "assumptions extracted", "warn"],
            ["8/8", "unit tests green — and prod still broke", "danger"],
            ["67s", "crash → verified fix in a sandbox", "ok"],
          ].map(([big, label, tone]) => (
            <Card key={label as string} tone={tone as "accent2"} className="p-5">
              <div className="text-3xl font-black">{big}</div>
              <div className="mt-1 text-xs font-bold leading-snug">{label}</div>
            </Card>
          ))}
        </div>

        {/* Sponsors */}
        <SectionTitle kicker="integrations">Every one of these is load-bearing</SectionTitle>
        <div className="mb-12 grid gap-5 md:grid-cols-2">
          {SPONSORS.map((s) => (
            <Card key={s.name} className="p-0">
              <div className={`border-b-2 border-edge px-5 py-3 ${{ accent: "bg-accent", ok: "bg-ok", accent2: "bg-accent2", warn: "bg-warn" }[s.tone]}`}>
                <div className="text-base font-black text-black">{s.name}</div>
                <div className="text-[11px] font-bold uppercase tracking-wide text-black/70">{s.role}</div>
              </div>
              <div className="px-5 py-4 text-sm leading-relaxed text-muted">{s.body}</div>
            </Card>
          ))}
        </div>

        {/* Honest note */}
        <SectionTitle kicker="one honest note">The agent is hard to fool</SectionTitle>
        <Card className="mb-10 p-5" tone="raised">
          <p className="text-sm leading-relaxed">
            It took four recorded attempts to get the demo agent to ship the bug. It read the schema, queried the
            database, and even read this repository&apos;s own commit messages describing the trap — and defused it. The
            bug only lands when the truth is genuinely unavailable: production had drifted from every local signal.
            That is the honest version of the pitch. A capable agent shipping a crash <em>because the information
            wasn&apos;t there</em> is exactly when you need a flight recorder.
          </p>
        </Card>
      </div>
    </div>
  );
}
