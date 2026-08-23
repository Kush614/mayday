import type { TraceEvent, IncidentResult } from "../types";

const TYPE_COLOR: Record<string, string> = {
  session_start: "bg-slate-500",
  thought: "bg-sky-400",
  tool_call: "bg-violet-400",
  file_edit: "bg-emerald-400",
  shell_command: "bg-amber-400",
  test_run: "bg-teal-300",
  session_end: "bg-slate-500",
};

const RISK_RING: Record<string, string> = {
  high: "shadow-[0_0_12px_2px_rgba(255,92,92,0.55)]",
  medium: "shadow-[0_0_10px_1px_rgba(255,176,32,0.45)]",
};

export function Timeline({
  events,
  current,
  onSelect,
  incident,
}: {
  events: TraceEvent[];
  current: number;
  onSelect: (step: number) => void;
  incident: IncidentResult | null;
}) {
  const chain = new Set<number>();
  if (incident) {
    chain.add(incident.step);
    if (incident.basis_step !== null) chain.add(incident.basis_step);
  }

  return (
    <div className="border-b border-edge bg-panel px-5 py-3">
      <div className="mb-2 flex items-center gap-3 text-[11px] uppercase tracking-widest text-muted">
        <span>timeline</span>
        <span className="text-slate-600">·</span>
        <span>
          step {current} / {events.length}
        </span>
        {incident && (
          <>
            <span className="text-slate-600">·</span>
            <span className="text-danger">
              incident chain: step {incident.basis_step ?? "?"} → step {incident.step}
            </span>
          </>
        )}
        <span className="ml-auto text-slate-600">← → step · space play</span>
      </div>

      <div className="flex items-end gap-[4px]">
        {events.map((e) => {
          const dimmed = incident !== null && !chain.has(e.step);
          const isFaulty = incident?.step === e.step;
          const isBasis = incident?.basis_step === e.step;
          const risk = e.enrichment?.risk ?? "low";
          const height = e.type === "file_edit" ? "h-12" : e.type === "thought" ? "h-8" : "h-10";
          return (
            <button
              key={e.step}
              onClick={() => onSelect(e.step)}
              title={`step ${e.step} · ${e.type}${e.enrichment ? ` · risk ${risk}` : ""}`}
              className={[
                "relative min-w-[8px] max-w-[34px] flex-1 rounded transition-all duration-150",
                height,
                TYPE_COLOR[e.type] ?? "bg-slate-500",
                RISK_RING[risk] ?? "",
                dimmed ? "opacity-15" : "opacity-90 hover:opacity-100",
                e.step === current ? "outline outline-2 outline-offset-2 outline-white/80 scale-y-125" : "",
                isFaulty ? "!bg-danger pulse-danger !opacity-100" : "",
                isBasis ? "!bg-warn !opacity-100" : "",
              ].join(" ")}
            />
          );
        })}
      </div>
    </div>
  );
}

export const LEGEND: [string, string][] = Object.entries(TYPE_COLOR).map(([k, v]) => [k, v]);
