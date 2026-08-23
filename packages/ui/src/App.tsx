import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "./api";
import { Timeline } from "./components/Timeline";
import { FilePanel } from "./components/FilePanel";
import { StepCard } from "./components/StepCard";
import { IncidentOverlay } from "./components/IncidentOverlay";
import { Forensics } from "./components/Forensics";
import type { IncidentResult, TraceEvent, TraceSummary } from "./types";

export default function App() {
  const [sessions, setSessions] = useState<TraceSummary[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [events, setEvents] = useState<TraceEvent[]>([]);
  const [step, setStep] = useState(1);
  const [playing, setPlaying] = useState(false);
  const [incident, setIncident] = useState<IncidentResult | null>(null);
  const [showIncident, setShowIncident] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .sessions()
      .then(({ sessions }) => {
        setSessions(sessions);
        if (sessions.length > 0) setSessionId((prev) => prev ?? sessions[0]!.session_id);
      })
      .catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    if (!sessionId) return;
    setIncident(null);
    api
      .trace(sessionId)
      .then(({ events }) => {
        setEvents(events);
        setStep(1);
      })
      .catch((e) => setError(e.message));
  }, [sessionId]);

  const current = useMemo(() => events.find((e) => e.step === step) ?? events[0], [events, step]);
  const maxStep = events.length > 0 ? events[events.length - 1]!.step : 1;

  const goto = useCallback(
    (n: number) => setStep(Math.max(1, Math.min(maxStep, n))),
    [maxStep],
  );

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement) return;
      if (e.key === "ArrowRight") goto(step + 1);
      else if (e.key === "ArrowLeft") goto(step - 1);
      else if (e.key === " ") {
        e.preventDefault();
        setPlaying((p) => !p);
      } else if (e.key === "i") setShowIncident(true);
      else if (e.key === "Escape") setShowIncident(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [step, goto]);

  useEffect(() => {
    if (!playing) return;
    const timer = setInterval(() => {
      setStep((s) => {
        if (s >= maxStep) {
          setPlaying(false);
          return s;
        }
        return s + 1;
      });
    }, 550);
    return () => clearInterval(timer);
  }, [playing, maxStep]);

  const summary = sessions.find((s) => s.session_id === sessionId);
  const focusLine = incident && incident.step === step ? incident.candidates[0]?.line ?? null : null;

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-4 border-b border-edge bg-panel px-5 py-3">
        <div className="flex items-center gap-2">
          <div className="grid h-7 w-7 place-items-center rounded bg-danger/20 text-xs font-bold text-danger">M</div>
          <div className="text-sm font-semibold tracking-tight text-slate-100">Mayday</div>
        </div>

        <select
          value={sessionId ?? ""}
          onChange={(e) => setSessionId(e.target.value)}
          className="max-w-lg rounded border border-edge bg-black/40 px-2 py-1 text-xs text-slate-300 outline-none"
        >
          {sessions.length === 0 && <option value="">no traces yet — run npm run record</option>}
          {sessions.map((s) => (
            <option key={s.session_id} value={s.session_id}>
              {s.golden ? "★ " : ""}
              {s.task.slice(0, 60)} · {s.steps} steps{s.enriched ? "" : " (raw)"}
            </option>
          ))}
        </select>

        {summary && (
          <div className="flex items-center gap-3 text-[11px] text-muted">
            <span className="font-mono">{summary.model}</span>
            <span>{new Date(summary.started_at).toLocaleString()}</span>
            {!summary.enriched && <span className="rounded bg-warn/15 px-2 py-0.5 text-warn">not enriched</span>}
          </div>
        )}

        <button
          onClick={() => setShowIncident(true)}
          disabled={!sessionId}
          className="ml-auto rounded-lg border border-danger/50 bg-danger/10 px-3 py-1.5 text-xs font-semibold text-danger transition hover:bg-danger/20 disabled:opacity-30"
        >
          Incident mode
        </button>
      </header>

      {error && <div className="border-b border-danger/30 bg-danger/10 px-5 py-2 text-xs text-rose-200">{error}</div>}

      {events.length === 0 ? (
        <div className="grid flex-1 place-items-center text-center text-sm text-muted">
          <div className="space-y-2">
            <div>No trace loaded.</div>
            <div className="font-mono text-xs text-slate-600">npm run record -- "add pagination to /items"</div>
          </div>
        </div>
      ) : (
        <>
          <Timeline events={events} current={step} onSelect={goto} incident={incident} />
          <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <FilePanel sessionId={sessionId!} events={events} step={step} focusLine={focusLine} />
            <div className="flex min-h-0 flex-col">
              <div className="min-h-0 flex-1 overflow-auto">{current && <StepCard event={current} onJump={goto} incident={incident} />}</div>
              {incident && <Forensics incident={incident} onJump={goto} onClear={() => setIncident(null)} />}
            </div>
          </div>
        </>
      )}

      {showIncident && sessionId && (
        <IncidentOverlay
          sessionId={sessionId}
          onClose={() => setShowIncident(false)}
          onResult={(r) => {
            setIncident(r);
            goto(r.step);
          }}
        />
      )}
    </div>
  );
}
