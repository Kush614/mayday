import type { TraceEvent, TraceSummary, IncidentResult, ReplayResult } from "./types";

async function json<T>(res: Response): Promise<T> {
  const body = await res.text();
  let parsed: any;
  try {
    parsed = body ? JSON.parse(body) : {};
  } catch {
    throw new Error(body.slice(0, 200) || `HTTP ${res.status}`);
  }
  if (!res.ok) throw Object.assign(new Error(parsed.error ?? `HTTP ${res.status}`), parsed);
  return parsed as T;
}

export const api = {
  sessions: () => fetch("/api/sessions").then((r) => json<{ sessions: TraceSummary[] }>(r)),

  trace: (id: string) => fetch(`/api/traces/${id}`).then((r) => json<{ summary: TraceSummary; events: TraceEvent[] }>(r)),

  file: (id: string, path: string, step: number) =>
    fetch(`/api/traces/${id}/file?path=${encodeURIComponent(path)}&step=${step}`).then((r) =>
      json<{ path: string; step: number; content: string }>(r),
    ),

  incident: (body: { session_id: string; text?: string; finding?: unknown }) =>
    fetch("/api/incident", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }).then((r) => json<IncidentResult>(r)),

  greptile: (pr?: string, repo?: string) =>
    fetch(`/api/greptile${pr ? `?pr=${pr}${repo ? `&repo=${repo}` : ""}` : ""}`).then((r) =>
      json<{ source: string; warning?: string; findings: { path: string; line_range: number[]; comment: string; url?: string }[] }>(r),
    ),

  replay: (body: { session_id: string; from_step: number; correction: string }) =>
    fetch("/api/replay", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }).then(async (r) => {
      const text = await r.text();
      const parsed = text ? JSON.parse(text) : {};
      return parsed as ReplayResult;
    }),
};
