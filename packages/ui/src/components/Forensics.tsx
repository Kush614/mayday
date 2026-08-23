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
    <div className="border-t border-danger/30 bg-gradient-to-b from-danger/[0.07] to-transparent">
      <div className="flex items-center gap-3 border-b border-edge px-5 py-3">
        <span className="h-2 w-2 rounded-full bg-danger pulse-danger" />
        <span className="text-[11px] font-semibold uppercase tracking-widest text-danger">forensics</span>
        <span className="text-[11px] text-muted">
          {incident.elapsed_ms}ms · confidence {incident.confidence} · {incident.candidates.length} candidate step(s)
        </span>
        <button onClick={onClear} className="ml-auto text-[11px] text-muted hover:text-slate-200">
          clear
        </button>
      </div>

      <div className="space-y-3 px-5 py-4 text-xs">
        <div className="font-mono text-rose-200">{incident.failure.message}</div>

        <div className="flex flex-wrap items-center gap-2 text-[11px]">
          {incident.basis_step !== null && (
            <>
              <button
                onClick={() => onJump(incident.basis_step!)}
                className="rounded border border-warn/50 bg-warn/15 px-2 py-1 text-warn hover:bg-warn/25"
              >
                step {incident.basis_step} · belief formed here
              </button>
              <span className="text-slate-600">→</span>
            </>
          )}
          <button
            onClick={() => onJump(incident.step)}
            className="rounded border border-danger/50 bg-danger/15 px-2 py-1 text-danger hover:bg-danger/25"
          >
            step {incident.step} · wrote the failing line
          </button>
          <span className="text-slate-600">→</span>
          <span className="rounded border border-white/10 bg-white/5 px-2 py-1 text-slate-300 font-mono">
            {incident.candidates[0]?.path}:{incident.candidates[0]?.line}
          </span>
        </div>

        {incident.assumption && (
          <div className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2">
            <div className="text-[10px] uppercase tracking-widest text-danger">false assumption</div>
            <div className="mt-1 text-rose-100">{incident.assumption.claim}</div>
          </div>
        )}

        <div className="leading-relaxed text-slate-300">{incident.verdict}</div>

        <div className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">
          <div className="text-[10px] uppercase tracking-widest text-muted">corrected instruction for the re-run</div>
          <div className="mt-1 leading-relaxed text-slate-300">{incident.correction}</div>
        </div>

        <div className="flex items-center gap-3 pt-1">
          <button
            onClick={rerun}
            disabled={busy}
            className="rounded-lg bg-accent px-4 py-2 text-xs font-semibold text-black transition hover:bg-sky-300 disabled:opacity-40"
          >
            {busy ? "running in sandbox…" : `Re-run from step ${incident.step}`}
          </button>
          <span className="text-[11px] text-muted">reconstructs state before step {incident.step}, re-runs Codex with the correction</span>
        </div>

        {replay && (
          <div className="mt-2 space-y-2 rounded-lg border border-edge bg-black/30 px-3 py-3">
            {replay.status && !replay.error && <div className="text-slate-300">{replay.status}</div>}
            {replay.tests_passed !== undefined && (
              <div className={`font-semibold ${replay.tests_passed ? "text-ok" : "text-danger"}`}>
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
                        ? "text-emerald-300"
                        : l.startsWith("-") && !l.startsWith("---")
                          ? "text-rose-300"
                          : "text-slate-500"
                    }
                  >
                    {l || " "}
                  </div>
                ))}
              </pre>
            )}
            {replay.test_output && (
              <pre className="max-h-40 overflow-auto font-mono text-[11px] text-slate-400">{replay.test_output}</pre>
            )}
            {replay.error && (
              <div className="space-y-1">
                <div className="text-rose-200">{replay.error}</div>
                {replay.fallback_command && (
                  <div className="text-[11px] text-muted">
                    run locally: <span className="font-mono text-slate-300">{replay.fallback_command}</span>
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
