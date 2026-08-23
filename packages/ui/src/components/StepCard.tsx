import { useState } from "react";
import type { TraceEvent, IncidentResult } from "../types";

const RISK_STYLE: Record<string, string> = {
  high: "bg-danger/15 text-danger border-danger/40",
  medium: "bg-warn/15 text-warn border-warn/40",
  low: "bg-white/5 text-muted border-white/10",
};

function Payload({ event }: { event: TraceEvent }) {
  const d = event.data;
  switch (event.type) {
    case "session_start":
      return (
        <div className="space-y-2 text-sm">
          <div className="text-slate-200">{d.task}</div>
          <div className="font-mono text-xs text-muted">
            {d.model} · {d.git_sha?.slice(0, 8)} · {d.cwd}
          </div>
        </div>
      );
    case "thought":
      return <div className="whitespace-pre-wrap text-sm leading-relaxed text-slate-200">{d.text}</div>;
    case "tool_call":
      return (
        <div className="space-y-2">
          <div className="font-mono text-xs text-violet-300">{d.name}</div>
          <pre className="overflow-auto rounded bg-black/40 p-3 font-mono text-[11px] text-slate-400">
            {JSON.stringify(d.input, null, 2)?.slice(0, 1500)}
          </pre>
          {d.output_summary && <div className="text-xs text-muted">{d.output_summary}</div>}
        </div>
      );
    case "file_edit":
      return (
        <div className="space-y-2">
          <div className="font-mono text-xs text-emerald-300">{d.path}</div>
          <pre className="overflow-auto rounded bg-black/40 p-3 font-mono text-[11px] leading-[1.5]">
            {String(d.diff ?? "")
              .split("\n")
              .map((l: string, i: number) => (
                <div
                  key={i}
                  className={
                    l.startsWith("+") && !l.startsWith("+++")
                      ? "text-emerald-300"
                      : l.startsWith("-") && !l.startsWith("---")
                        ? "text-rose-300"
                        : l.startsWith("@@")
                          ? "text-sky-300"
                          : "text-slate-500"
                  }
                >
                  {l || " "}
                </div>
              ))}
          </pre>
        </div>
      );
    case "shell_command":
      return (
        <div className="space-y-2">
          <div className="font-mono text-xs text-amber-300">$ {d.command}</div>
          <pre className="max-h-56 overflow-auto rounded bg-black/40 p-3 font-mono text-[11px] text-slate-400">{d.output_tail}</pre>
          <div className="text-xs text-muted">exit {d.exit_code}</div>
        </div>
      );
    case "test_run":
      return (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className={`rounded px-2 py-0.5 text-[11px] font-semibold ${d.passed ? "bg-ok/20 text-ok" : "bg-danger/20 text-danger"}`}>
              {d.passed ? "PASSED" : "FAILED"}
            </span>
            <span className="font-mono text-xs text-teal-200">{d.command}</span>
          </div>
          <pre className="max-h-56 overflow-auto rounded bg-black/40 p-3 font-mono text-[11px] text-slate-400">{d.output_tail}</pre>
        </div>
      );
    case "session_end":
      return (
        <div className="space-y-2 text-sm">
          <div className="text-muted">
            {d.files_touched?.length ?? 0} files · {d.duration_s}s
          </div>
          <pre className="max-h-72 overflow-auto rounded bg-black/40 p-3 font-mono text-[11px] text-slate-400">{d.final_diff}</pre>
        </div>
      );
    default:
      return null;
  }
}

export function StepCard({
  event,
  onJump,
  incident,
}: {
  event: TraceEvent;
  onJump: (step: number) => void;
  incident: IncidentResult | null;
}) {
  const [showAlternatives, setShowAlternatives] = useState(false);
  const enrichment = event.enrichment;
  const faultyAssumptionId = incident?.step === event.step ? incident.assumption?.id : undefined;

  return (
    <div className="flex h-full flex-col overflow-auto bg-panel">
      <div className="border-b border-edge px-5 py-4">
        <div className="flex items-center gap-3">
          <span className="rounded bg-white/5 px-2 py-0.5 font-mono text-xs text-slate-300">step {event.step}</span>
          <span className="text-xs uppercase tracking-widest text-muted">{event.type.replace("_", " ")}</span>
          {enrichment && (
            <span className={`ml-auto rounded border px-2 py-0.5 text-[11px] ${RISK_STYLE[enrichment.risk]}`}>
              risk: {enrichment.risk}
            </span>
          )}
        </div>
        {enrichment?.intent && <div className="mt-3 text-sm text-slate-300">{enrichment.intent}</div>}
      </div>

      <div className="px-5 py-4">
        <Payload event={event} />
      </div>

      {enrichment && (
        <div className="border-t border-edge px-5 py-4">
          <div className="mb-3 text-[11px] uppercase tracking-widest text-muted">
            assumptions ({enrichment.assumptions.length})
          </div>
          <div className="space-y-2">
            {enrichment.assumptions.length === 0 && <div className="text-xs text-slate-600">none recorded for this step</div>}
            {enrichment.assumptions.map((a) => {
              const isFaulty = a.id === faultyAssumptionId;
              return (
                <button
                  key={a.id}
                  onClick={() => a.basis_step !== null && onJump(a.basis_step)}
                  disabled={a.basis_step === null}
                  className={[
                    "w-full rounded-lg border px-3 py-2 text-left text-xs transition",
                    isFaulty
                      ? "border-danger/60 bg-danger/15 text-rose-100 pulse-danger"
                      : "border-white/10 bg-white/[0.03] text-slate-300 hover:border-accent/40 hover:bg-accent/10",
                    a.basis_step === null ? "cursor-default" : "cursor-pointer",
                  ].join(" ")}
                >
                  <div className="leading-relaxed">{a.claim}</div>
                  <div className="mt-1.5 flex items-center gap-2 text-[10px] text-muted">
                    <span className="rounded bg-white/5 px-1.5 py-0.5">{a.confidence}</span>
                    {a.basis_step !== null ? (
                      <span className="text-accent">↩ based on step {a.basis_step} — click to jump</span>
                    ) : (
                      <span>no traceable basis</span>
                    )}
                    {isFaulty && <span className="ml-auto font-semibold text-danger">FALSE — caused the incident</span>}
                  </div>
                </button>
              );
            })}
          </div>

          {enrichment.alternatives.length > 0 && (
            <div className="mt-4">
              <button
                onClick={() => setShowAlternatives((v) => !v)}
                className="text-[11px] uppercase tracking-widest text-muted hover:text-slate-300"
              >
                {showAlternatives ? "▾" : "▸"} alternatives considered ({enrichment.alternatives.length})
              </button>
              {showAlternatives && (
                <div className="mt-2 space-y-2">
                  {enrichment.alternatives.map((alt, i) => (
                    <div key={i} className="rounded border border-white/10 bg-white/[0.02] px-3 py-2 text-xs">
                      <div className="text-slate-300">{alt.description}</div>
                      <div className="mt-1 text-muted">rejected: {alt.why_rejected}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {!enrichment && event.type !== "session_start" && event.type !== "session_end" && (
        <div className="border-t border-edge px-5 py-4 text-xs text-slate-600">
          not enriched — run <span className="font-mono text-slate-400">npm run enrich</span> to add intent and assumptions
        </div>
      )}
    </div>
  );
}
