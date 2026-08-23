import { useState } from "react";
import { api } from "../api";
import type { IncidentResult } from "../types";

const PLACEHOLDER = `Paste a stack trace, failing test output, or a Greptile finding (JSON)…

TypeError: Cannot read properties of null (reading 'toString')
    at toDTO (/app/src/items.ts:42:29)
    at listItems (/app/src/items.ts:61:26)`;

export function IncidentOverlay({
  sessionId,
  onClose,
  onResult,
}: {
  sessionId: string;
  onClose: () => void;
  onResult: (r: IncidentResult) => void;
}) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  async function analyze() {
    setBusy(true);
    setError(null);
    try {
      const result = await api.incident({ session_id: sessionId, text });
      onResult(result);
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function importGreptile() {
    setError(null);
    setNote(null);
    try {
      const { findings, source, warning } = await api.greptile();
      const finding = findings[0];
      if (!finding) throw new Error("no findings returned");
      setText(JSON.stringify(finding, null, 2));
      setNote(`loaded ${source} finding on ${finding.path}:${finding.line_range.join("-")}${warning ? ` (live fetch failed: ${warning})` : ""}`);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-8 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full max-w-3xl rounded-2xl border border-edge bg-panel shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-edge px-6 py-4">
          <span className="h-2 w-2 rounded-full bg-danger pulse-danger" />
          <h2 className="text-sm font-semibold uppercase tracking-widest text-slate-200">incident mode</h2>
          <button onClick={onClose} className="ml-auto text-xs text-muted hover:text-slate-200">
            esc
          </button>
        </div>

        <div className="px-6 py-5">
          <textarea
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={PLACEHOLDER}
            spellCheck={false}
            className="h-56 w-full resize-none rounded-lg border border-edge bg-black/40 p-4 font-mono text-[12px] leading-relaxed text-slate-200 outline-none placeholder:text-slate-700 focus:border-accent/50"
          />

          {note && <div className="mt-3 text-xs text-accent">{note}</div>}
          {error && <div className="mt-3 rounded border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-rose-200">{error}</div>}

          <div className="mt-4 flex items-center gap-3">
            <button
              onClick={importGreptile}
              className="rounded-lg border border-edge px-3 py-2 text-xs text-slate-300 transition hover:border-accent/50 hover:text-accent"
            >
              Import from Greptile PR review
            </button>
            <div className="ml-auto flex items-center gap-3">
              <span className="text-[11px] text-muted">walks the trace backward to the false assumption</span>
              <button
                onClick={analyze}
                disabled={busy || !text.trim()}
                className="rounded-lg bg-danger px-4 py-2 text-xs font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-40"
              >
                {busy ? "analyzing…" : "Analyze"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
