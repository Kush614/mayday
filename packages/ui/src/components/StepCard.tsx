import { useState } from "react";
import type { TraceEvent, IncidentResult } from "../types";

const RISK_STYLE: Record<string, string> = {
  high: "bg-danger text-white border-edge",
  medium: "bg-warn text-black border-edge",
  low: "bg-panel text-muted border-edge",
};

function Payload({ event }: { event: TraceEvent }) {
  const d = event.data;
  switch (event.type) {
    case "session_start":
      return (
        <div className="space-y-2 text-sm">
          <div className="font-semibold">{d.task}</div>
          <div className="font-mono text-xs text-muted">
            {d.model} · {d.git_sha?.slice(0, 8)} · {d.cwd}
          </div>
        </div>
      );
    case "thought":
      return <div className="whitespace-pre-wrap text-sm leading-relaxed">{d.text}</div>;
    case "tool_call":
      return (
        <div className="space-y-2">
          <div className="font-mono text-xs font-bold">{d.name}</div>
          <pre className="overflow-auto border-2 border-edge bg-code p-3 font-mono text-[11px]">
            {JSON.stringify(d.input, null, 2)?.slice(0, 1500)}
          </pre>
          {d.output_summary && <div className="text-xs text-muted">{d.output_summary}</div>}
        </div>
      );
    case "file_edit":
      return (
        <div className="space-y-2">
          <div className="font-mono text-xs font-bold">{d.path}</div>
          <pre className="overflow-auto border-2 border-edge bg-code p-3 font-mono text-[11px] leading-[1.5]">
            {String(d.diff ?? "")
              .split("\n")
              .map((l: string, i: number) => (
                <div
                  key={i}
                  className={
                    l.startsWith("+") && !l.startsWith("+++")
                      ? "text-ok"
                      : l.startsWith("-") && !l.startsWith("---")
                        ? "text-danger"
                        : l.startsWith("@@")
                          ? "text-accent2"
                          : "text-muted"
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
          <div className="font-mono text-xs font-bold">$ {d.command}</div>
          <pre className="max-h-56 overflow-auto border-2 border-edge bg-code p-3 font-mono text-[11px]">{d.output_tail}</pre>
          <div className="text-xs text-muted">exit {d.exit_code}</div>
        </div>
      );
    case "test_run":
      return (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className={`border-2 border-edge px-2 py-0.5 text-[11px] font-black ${d.passed ? "bg-ok text-black" : "bg-danger text-white"}`}>
              {d.passed ? "PASSED" : "FAILED"}
            </span>
            <span className="font-mono text-xs font-bold">{d.command}</span>
          </div>
          <pre className="max-h-56 overflow-auto border-2 border-edge bg-code p-3 font-mono text-[11px]">{d.output_tail}</pre>
        </div>
      );
    case "session_end":
      return (
        <div className="space-y-2 text-sm">
          <div className="text-muted">
            {d.files_touched?.length ?? 0} files · {d.duration_s}s
          </div>
          <pre className="max-h-72 overflow-auto border-2 border-edge bg-code p-3 font-mono text-[11px]">{d.final_diff}</pre>
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
    <div className="flex min-h-0 flex-col overflow-auto bg-ink">
      <div className="border-b-2 border-edge bg-panel px-5 py-4">
        <div className="flex items-center gap-3">
          <span className="border-2 border-edge bg-raised px-2 py-0.5 font-mono text-xs font-bold shadow-hard-sm">step {event.step}</span>
          <span className="text-xs font-black uppercase tracking-widest text-muted">{event.type.replace("_", " ")}</span>
          {enrichment && (
            <span className={`ml-auto border-2 px-2 py-0.5 text-[11px] font-bold ${RISK_STYLE[enrichment.risk]}`}>
              risk: {enrichment.risk}
            </span>
          )}
        </div>
        {enrichment?.intent && <div className="mt-3 text-sm">{enrichment.intent}</div>}
      </div>

      <div className="px-5 py-4">
        <Payload event={event} />
      </div>

      {enrichment && (
        <div className="border-t-2 border-edge px-5 py-4">
          <div className="mb-3 text-[11px] font-black uppercase tracking-widest text-muted">
            assumptions ({enrichment.assumptions.length})
          </div>
          <div className="space-y-2">
            {enrichment.assumptions.length === 0 && <div className="text-xs text-muted">none recorded for this step</div>}
            {enrichment.assumptions.map((a) => {
              const isFaulty = a.id === faultyAssumptionId;
              return (
                <button
                  key={a.id}
                  onClick={() => a.basis_step !== null && onJump(a.basis_step)}
                  disabled={a.basis_step === null}
                  className={[
                    "w-full border-2 border-edge px-3 py-2 text-left text-xs shadow-hard-sm",
                    isFaulty ? "bg-danger text-white pulse-danger" : "press bg-raised hover:bg-accent hover:text-black",
                    a.basis_step === null ? "cursor-default" : "cursor-pointer",
                  ].join(" ")}
                >
                  <div className="leading-relaxed">{a.claim}</div>
                  <div className="mt-1.5 flex items-center gap-2 text-[10px] text-muted">
                    <span className="border border-current px-1.5 py-0.5 font-bold">{a.confidence}</span>
                    {a.basis_step !== null ? (
                      <span className="font-bold">↩ based on step {a.basis_step} — click to jump</span>
                    ) : (
                      <span>no traceable basis</span>
                    )}
                    {isFaulty && <span className="ml-auto font-black">FALSE — caused the incident</span>}
                  </div>
                </button>
              );
            })}
          </div>

          {enrichment.alternatives.length > 0 && (
            <div className="mt-4">
              <button
                onClick={() => setShowAlternatives((v) => !v)}
                className="text-[11px] font-black uppercase tracking-widest text-muted hover:text-body"
              >
                {showAlternatives ? "▾" : "▸"} alternatives considered ({enrichment.alternatives.length})
              </button>
              {showAlternatives && (
                <div className="mt-2 space-y-2">
                  {enrichment.alternatives.map((alt, i) => (
                    <div key={i} className="border-2 border-edge bg-raised px-3 py-2 text-xs">
                      <div className="font-semibold">{alt.description}</div>
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
        <div className="border-t-2 border-edge px-5 py-4 text-xs text-muted">
          not enriched — run <span className="border border-edge bg-code px-1 font-mono">npm run enrich</span> to add intent and assumptions
        </div>
      )}
    </div>
  );
}
