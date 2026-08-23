import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "./api";
import { Timeline } from "./components/Timeline";
import { FilePanel } from "./components/FilePanel";
import { StepCard } from "./components/StepCard";
import { IncidentOverlay } from "./components/IncidentOverlay";
import { Forensics } from "./components/Forensics";
import { About } from "./components/About";
import { DemoGuide } from "./components/DemoGuide";
import type { IncidentResult, TraceEvent, TraceSummary } from "./types";

type Theme = "light" | "dark";

function useTheme(): [Theme, () => void] {
  const [theme, setTheme] = useState<Theme>(
    () => (document.documentElement.getAttribute("data-theme") as Theme) ?? "light",
  );
  const toggle = useCallback(() => {
    setTheme((prev) => {
      const next: Theme = prev === "dark" ? "light" : "dark";
      document.documentElement.setAttribute("data-theme", next);
      localStorage.setItem("mayday-theme", next);
      return next;
    });
  }, []);
  return [theme, toggle];
}

export default function App() {
  const [sessions, setSessions] = useState<TraceSummary[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [events, setEvents] = useState<TraceEvent[]>([]);
  const [step, setStep] = useState(1);
  const [playing, setPlaying] = useState(false);
  const [incident, setIncident] = useState<IncidentResult | null>(null);
  const [showIncident, setShowIncident] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [theme, toggleTheme] = useTheme();
  const [tab, setTab] = useState<"replay" | "demo" | "about">("replay");
  const [incidentPrefill, setIncidentPrefill] = useState("");

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
      <header className="flex items-center gap-4 border-b-2 border-edge bg-panel px-5 py-3">
        <div className="flex items-center gap-2">
          <div className="grid h-8 w-8 place-items-center border-2 border-edge bg-accent text-sm font-black text-black shadow-hard-sm">
            M
          </div>
          <div className="text-base font-black tracking-tight">Mayday</div>
        </div>

        <div className="flex border-2 border-edge shadow-hard-sm">
          {(["replay", "demo", "about"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-3 py-1 text-xs font-black uppercase tracking-wide ${
                tab === t ? "bg-edge text-ink" : "bg-raised hover:bg-accent hover:text-black"
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {tab === "replay" && (
        <select
          value={sessionId ?? ""}
          onChange={(e) => setSessionId(e.target.value)}
          className="max-w-lg border-2 border-edge bg-raised px-2 py-1 text-xs font-semibold text-body shadow-hard-sm outline-none"
        >
          {sessions.length === 0 && <option value="">no traces yet — run npm run record</option>}
          {sessions.map((s) => (
            <option key={s.session_id} value={s.session_id}>
              {s.golden ? "★ " : ""}
              {s.task.slice(0, 60)} · {s.steps} steps{s.enriched ? "" : " (raw)"}
            </option>
          ))}
        </select>
        )}

        {tab === "replay" && summary && (
          <div className="flex items-center gap-3 text-[11px] text-muted">
            <span className="font-mono">{summary.model}</span>
            <span>{new Date(summary.started_at).toLocaleString()}</span>
            {!summary.enriched && (
              <span className="border-2 border-edge bg-warn px-2 py-0.5 font-bold text-black">not enriched</span>
            )}
          </div>
        )}

        <div className="ml-auto flex items-center gap-3">
          <button
            onClick={toggleTheme}
            title="toggle theme"
            className="press border-2 border-edge bg-raised px-3 py-1.5 text-xs font-bold shadow-hard-sm"
          >
            {theme === "dark" ? "☀ light" : "☾ dark"}
          </button>
          <button
            onClick={() => setShowIncident(true)}
            disabled={!sessionId || tab !== "replay"}
            className="press border-2 border-edge bg-danger px-4 py-1.5 text-xs font-black uppercase tracking-wide text-white shadow-hard disabled:opacity-30"
          >
            Incident mode
          </button>
        </div>
      </header>

      {error && <div className="border-b-2 border-edge bg-danger px-5 py-2 text-xs font-bold text-white">{error}</div>}

      {tab === "about" ? (
        <About />
      ) : tab === "demo" ? (
        <DemoGuide
          onJumpToStep={(step) => {
            setTab("replay");
            goto(step);
          }}
          onOpenIncident={(prefill) => {
            setIncidentPrefill(prefill);
            setTab("replay");
            setShowIncident(true);
          }}
        />
      ) : events.length === 0 ? (
        <div className="grid flex-1 place-items-center text-center text-sm text-muted">
          <div className="space-y-2">
            <div>No trace loaded.</div>
            <div className="border-2 border-edge bg-code px-3 py-2 font-mono text-xs">npm run record -- "add pagination to /items"</div>
          </div>
        </div>
      ) : (
        <>
          <Timeline events={events} current={step} onSelect={goto} incident={incident} />
          <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_minmax(0,1fr)] overflow-hidden">
            <FilePanel sessionId={sessionId!} events={events} step={step} focusLine={focusLine} />
            <div className="flex h-full min-h-0 flex-col overflow-hidden">
              <div className="min-h-0 flex-1 overflow-auto">{current && <StepCard event={current} onJump={goto} incident={incident} />}</div>
              {incident && (
                // Capped so the forensics card is always on screen the moment
                // an analysis lands — it is the payoff, not a footnote.
                <div className="max-h-[48vh] min-h-0 shrink-0 overflow-auto">
                  <Forensics incident={incident} onJump={goto} onClear={() => setIncident(null)} />
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {showIncident && sessionId && (
        <IncidentOverlay
          sessionId={sessionId}
          initialText={incidentPrefill}
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
