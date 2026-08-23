import { useState } from "react";
import { api } from "../api";
import type { IncidentResult, ReplayResult } from "../types";

export function Forensics({
  incident,
  onJump,
  onClear,
}: {
  incident: IncidentResult;
  onJump: (step: number) => void;
  onClear: () => void;
}) {
  const [replay, setReplay] = useState<ReplayResult | null>(null);
  const [busy, setBusy] = useState(false);

  async function rerun() {
    setBusy(true);
    setReplay({ status: "reconstructing repo state before step " + incident.step + " in a Modal sandbox…" });
    try {
      const result = await api.replay({
        session_id: incident.session_id,
        from_step: incident.step,
        correction: incident.correction,
      });
      setReplay(result);
    } catch (e) {
      setReplay({ error: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="border-t-4 border-edge bg-panel">
      <div className="flex items-center gap-3 border-b-2 border-edge bg-danger px-5 py-3">
        <span className="h-3 w-3 border-2 border-edge bg-white" />
        <span className="text-[11px] font-black uppercase tracking-widest text-white">forensics</span>
        <span className="text-[11px] font-semibold text-white/85">
          {incident.elapsed_ms}ms · confidence {incident.confidence} · {incident.candidates.length} candidate step(s)
        </span>
        <button onClick={onClear} className="ml-auto text-[11px] font-bold text-white/80 hover:text-white">
          clear
        </button>
      </div>

      <div className="space-y-3 px-5 py-4 text-xs">
        <div className="border-2 border-edge bg-code px-3 py-2 font-mono text-xs font-bold text-danger">{incident.failure.message}</div>

        <div className="flex flex-wrap items-center gap-2 text-[11px]">
          {incident.basis_step !== null && (
            <>
              <button
                onClick={() => onJump(incident.basis_step!)}
                className="press border-2 border-edge bg-warn px-2 py-1 font-bold text-black shadow-hard-sm"
              >
                step {incident.basis_step} · belief formed here
              </button>
              <span className="font-black">→</span>
            </>
          )}
          <button
            onClick={() => onJump(incident.step)}
            className="press border-2 border-edge bg-danger px-2 py-1 font-bold text-white shadow-hard-sm"
          >
            step {incident.step} · wrote the failing line
          </button>
          <span className="font-black">→</span>
          <span className="border-2 border-edge bg-raised px-2 py-1 font-mono font-bold">
            {incident.candidates[0]?.path}:{incident.candidates[0]?.line}
          </span>
        </div>

        {incident.assumption && (
          <div className="grid gap-3 md:grid-cols-2">
            <div className="border-2 border-edge bg-danger px-3 py-2 shadow-hard-sm">
              <div className="flex items-center gap-2">
                <span className="border-2 border-edge bg-white px-1.5 text-[10px] font-black text-danger">BEFORE</span>
                <span className="text-[10px] font-black uppercase tracking-widest text-white/80">what the agent believed</span>
              </div>
              <div className="mt-1.5 font-bold text-white line-through decoration-white/50 decoration-2">
                {incident.assumption.claim}
              </div>
              <div className="mt-1.5 text-[10px] font-bold text-white/75">
                formed at step {incident.basis_step ?? "?"} · {incident.assumption.confidence}
              </div>
            </div>

            <div className="border-2 border-edge bg-ok px-3 py-2 shadow-hard-sm">
              <div className="flex items-center gap-2">
                <span className="border-2 border-edge bg-white px-1.5 text-[10px] font-black text-black">AFTER</span>
                <span className="text-[10px] font-black uppercase tracking-widest text-black/70">what is actually true</span>
              </div>
              <div className="mt-1.5 font-bold text-black">
                {incident.corrected_belief?.trim() || incident.correction.split(/(?<=\.)\s/)[0]}
              </div>
              <div className="mt-1.5 text-[10px] font-bold text-black/70">verified by the sandbox re-run</div>
            </div>
          </div>
        )}

        <div className="leading-relaxed">{incident.verdict}</div>

        <div className="border-2 border-edge bg-raised px-3 py-2 shadow-hard-sm">
          <div className="text-[10px] font-black uppercase tracking-widest text-muted">corrected instruction for the re-run</div>
          <div className="mt-1 leading-relaxed">{incident.correction}</div>
        </div>

        <div className="flex items-center gap-3 pt-1">
          <button
            onClick={rerun}
            disabled={busy}
            className="press border-2 border-edge bg-ok px-5 py-2 text-xs font-black uppercase text-black shadow-hard disabled:opacity-40"
          >
            {busy ? "running in sandbox…" : `Re-run from step ${incident.step}`}
          </button>
          <span className="text-[11px] font-semibold text-white/85">reconstructs state before step {incident.step}, re-runs Codex with the correction</span>
        </div>

        {replay && (
          <div className="mt-2 space-y-2 border-2 border-edge bg-code px-3 py-3">
            {replay.status && !replay.error && <div className="font-semibold">{replay.status}</div>}
            {replay.tests_passed !== undefined && (
              <div className={`inline-block border-2 border-edge px-2 py-1 font-black ${replay.tests_passed ? "bg-ok text-black" : "bg-danger text-white"}`}>
                {replay.tests_passed ? "✔ tests passed in sandbox" : "✖ tests still failing"}
                {replay.duration_s ? ` · ${replay.duration_s}s` : ""}
              </div>
            )}
            {replay.diff && (
              <pre className="max-h-60 overflow-auto font-mono text-[11px] leading-[1.5]">
                {replay.diff.split("\n").map((l, i) => (
                  <div
                    key={i}
                    className={
                      l.startsWith("+") && !l.startsWith("+++")
                        ? "text-ok"
                        : l.startsWith("-") && !l.startsWith("---")
                          ? "text-danger"
                          : "text-muted"
                    }
                  >
                    {l || " "}
                  </div>
                ))}
              </pre>
            )}
            {replay.test_output && (
              <pre className="max-h-40 overflow-auto font-mono text-[11px] text-muted">{replay.test_output}</pre>
            )}
            {replay.error && (
              <div className="space-y-1">
                <div className="font-bold text-danger">{replay.error}</div>
                {replay.fallback_command && (
                  <div className="text-[11px] text-muted">
                    run locally: <span className="border border-edge bg-raised px-1 font-mono">{replay.fallback_command}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
