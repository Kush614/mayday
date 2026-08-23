import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import type { TraceEvent } from "../types";

/** Lines added by the current step, so the diff is visible in file context. */
function highlightedLines(events: TraceEvent[], step: number, path: string): Set<number> {
  const set = new Set<number>();
  const e = events.find((ev) => ev.step === step && ev.type === "file_edit" && ev.data.path === path);
  for (const [start, end] of e?.data?.lines_added ?? []) {
    for (let i = start; i <= end; i++) set.add(i);
  }
  return set;
}

export function FilePanel({
  sessionId,
  events,
  step,
  focusLine,
}: {
  sessionId: string;
  events: TraceEvent[];
  step: number;
  focusLine?: number | null;
}) {
  const editedPaths = [...new Set(events.filter((e) => e.type === "file_edit").map((e) => e.data.path as string))];
  const stepPath = events.find((e) => e.step === step && e.type === "file_edit")?.data?.path as string | undefined;
  const [selected, setSelected] = useState<string | null>(editedPaths[0] ?? null);
  const [content, setContent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Follow the scrubber: selecting a step that edits a file focuses that file.
  useEffect(() => {
    if (stepPath) setSelected(stepPath);
  }, [stepPath]);

  useEffect(() => {
    if (!selected) return;
    let cancelled = false;
    setError(null);
    api
      .file(sessionId, selected, step)
      .then((r) => !cancelled && setContent(r.content))
      .catch((e) => {
        if (cancelled) return;
        setContent(null);
        setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [sessionId, selected, step]);

  const scrollerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!focusLine) return;
    const el = document.getElementById(`line-${focusLine}`);
    const scroller = scrollerRef.current;
    if (!el || !scroller) return;
    // Scroll the pane, never the document: scrollIntoView moves ancestors too
    // and would carry the timeline out of view.
    scroller.scrollTo({ top: el.offsetTop - scroller.clientHeight / 2, behavior: "smooth" });
  }, [focusLine, content]);

  const highlights = selected ? highlightedLines(events, step, selected) : new Set<number>();

  return (
    <div className="flex h-full flex-col border-r border-edge bg-panel">
      <div className="border-b border-edge px-4 py-3">
        <div className="mb-2 text-[11px] uppercase tracking-widest text-muted">files touched</div>
        <div className="space-y-1">
          {editedPaths.length === 0 && <div className="text-xs text-slate-600">no file edits in this trace</div>}
          {editedPaths.map((p) => {
            const edits = events.filter((e) => e.type === "file_edit" && e.data.path === p).length;
            return (
              <button
                key={p}
                onClick={() => setSelected(p)}
                className={[
                  "flex w-full items-center justify-between rounded px-2 py-1 text-left text-xs transition",
                  selected === p ? "bg-accent/15 text-accent" : "text-slate-300 hover:bg-white/5",
                ].join(" ")}
              >
                <span className="truncate font-mono">{p}</span>
                <span className="ml-2 shrink-0 text-[10px] text-muted">{edits} edit{edits === 1 ? "" : "s"}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div ref={scrollerRef} className="min-h-0 flex-1 overflow-auto">
        {error && <div className="p-4 text-xs text-muted">{error}</div>}
        {content !== null && (
          <pre className="min-w-full py-2 font-mono text-[11px] leading-[1.55]">
            {content.split("\n").map((line, i) => {
              const no = i + 1;
              const added = highlights.has(no);
              const focused = focusLine === no;
              return (
                <div
                  key={no}
                  id={`line-${no}`}
                  className={[
                    "flex px-3",
                    added ? "bg-emerald-400/12" : "",
                    focused ? "bg-danger/25 outline outline-1 outline-danger/60" : "",
                  ].join(" ")}
                >
                  <span className="mr-3 w-8 shrink-0 select-none text-right text-slate-600">{no}</span>
                  <span className={added ? "text-emerald-200" : "text-slate-300"}>{line || " "}</span>
                </div>
              );
            })}
          </pre>
        )}
      </div>
    </div>
  );
}
