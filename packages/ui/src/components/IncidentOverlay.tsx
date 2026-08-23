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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-8" onClick={onClose}>
      <div
        className="w-full max-w-3xl border-4 border-edge bg-ink shadow-hard-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b-4 border-edge bg-danger px-6 py-4">
          <span className="h-3 w-3 border-2 border-edge bg-white" />
          <h2 className="text-sm font-black uppercase tracking-widest text-white">incident mode</h2>
          <button onClick={onClose} className="ml-auto text-xs font-bold text-white/80 hover:text-white">
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
            className="h-56 w-full resize-none border-2 border-edge bg-code p-4 font-mono text-[12px] leading-relaxed text-body shadow-hard-sm outline-none placeholder:text-muted focus:bg-raised"
          />

          {note && <div className="mt-3 border-2 border-edge bg-accent px-3 py-2 text-xs font-bold text-black">{note}</div>}
          {error && <div className="mt-3 border-2 border-edge bg-danger px-3 py-2 text-xs font-bold text-white">{error}</div>}

          <div className="mt-4 flex items-center gap-3">
            <button
              onClick={importGreptile}
              className="press border-2 border-edge bg-accent2 px-3 py-2 text-xs font-bold text-black shadow-hard-sm"
            >
              Import from Greptile PR review
            </button>
            <div className="ml-auto flex items-center gap-3">
              <span className="text-[11px] text-muted">walks the trace backward to the false assumption</span>
              <button
                onClick={analyze}
                disabled={busy || !text.trim()}
                className="press border-2 border-edge bg-danger px-5 py-2 text-xs font-black uppercase text-white shadow-hard disabled:cursor-not-allowed disabled:opacity-40"
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
