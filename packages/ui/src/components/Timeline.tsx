import type { TraceEvent, IncidentResult } from "../types";

const TYPE_COLOR: Record<string, string> = {
  session_start: "bg-muted",
  thought: "bg-accent2",
  tool_call: "bg-accent",
  file_edit: "bg-ok",
  shell_command: "bg-warn",
  test_run: "bg-orange",
  session_end: "bg-muted",
};

const RISK_RING: Record<string, string> = {
  high: "ring-4 ring-danger",
  medium: "ring-2 ring-warn",
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
    <div className="border-b-2 border-edge bg-panel px-5 py-3">
      <div className="mb-2 flex items-center gap-3 text-[11px] font-bold uppercase tracking-widest text-muted">
        <span className="font-black">timeline</span>
        <span className="text-slate-600">·</span>
        <span>
          step {current} / {events.length}
        </span>
        {incident && (
          <>
            <span className="text-slate-600">·</span>
            <span className="border-2 border-edge bg-danger px-2 py-0.5 font-bold text-white">
              incident chain: step {incident.basis_step ?? "?"} → step {incident.step}
            </span>
          </>
        )}
        <span className="ml-auto text-muted">← → step · space play</span>
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
                "relative min-w-[8px] max-w-[34px] flex-1 border-2 border-edge transition-all duration-150",
                height,
                TYPE_COLOR[e.type] ?? "bg-slate-500",
                RISK_RING[risk] ?? "",
                dimmed ? "opacity-20" : "opacity-100 hover:-translate-y-0.5",
                e.step === current ? "shadow-hard-sm scale-y-125" : "",
                isFaulty ? "!bg-danger pulse-danger !opacity-100 scale-y-150" : "",
                isBasis ? "!bg-warn !opacity-100 scale-y-125 shadow-hard-sm" : "",
              ].join(" ")}
            />
          );
        })}
      </div>
    </div>
  );
}

export const LEGEND: [string, string][] = Object.entries(TYPE_COLOR).map(([k, v]) => [k, v]);
