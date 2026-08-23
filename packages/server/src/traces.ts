import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseTrace, type TraceEvent } from "@afr/recorder/schema";
import { getBlob } from "@afr/recorder";

export const REPO_ROOT = resolve(new URL("../../..", import.meta.url).pathname);

/** Live captures first, then the committed golden traces (the demo safety net). */
export const TRACE_DIRS = [join(REPO_ROOT, "traces"), join(REPO_ROOT, "demo", "traces")];

export type TraceSummary = {
  session_id: string;
  task: string;
  model: string;
  started_at: string;
  steps: number;
  enriched: boolean;
  golden: boolean;
  path: string;
};

function listTraceFiles(): { file: string; dir: string }[] {
  const out: { file: string; dir: string }[] = [];
  for (const dir of TRACE_DIRS) {
    if (!existsSync(dir)) continue;
    for (const name of readdirSync(dir)) {
      if (!name.endsWith(".jsonl")) continue;
      out.push({ file: join(dir, name), dir });
    }
  }
  return out;
}

/** Prefer <id>.enriched.jsonl over <id>.jsonl for the same session. */
export function listTraces(): TraceSummary[] {
  const bySession = new Map<string, TraceSummary>();
  for (const { file, dir } of listTraceFiles()) {
    let events: TraceEvent[];
    try {
      events = parseTrace(readFileSync(file, "utf8"));
    } catch {
      continue; // a half-written trace should not break the list
    }
    const start = events.find((e) => e.type === "session_start");
    if (!start) continue;
    const enriched = events.some((e) => e.enrichment);
    const summary: TraceSummary = {
      session_id: start.session_id,
      task: start.data.task,
      model: start.data.model,
      started_at: start.ts,
      steps: events.length,
      enriched,
      golden: dir.includes(join("demo", "traces")),
      path: file,
    };
    const existing = bySession.get(summary.session_id);
    if (!existing || (!existing.enriched && enriched)) bySession.set(summary.session_id, summary);
  }
  return [...bySession.values()].sort((a, b) => b.started_at.localeCompare(a.started_at));
}

export function loadTrace(sessionId: string): { events: TraceEvent[]; summary: TraceSummary } | null {
  const summary = listTraces().find((t) => t.session_id === sessionId);
  if (!summary) return null;
  return { events: parseTrace(readFileSync(summary.path, "utf8")), summary };
}

/** Root that holds this session's blobs/ dir (live capture or golden). */
export function blobRoot(sessionId: string): string | null {
  for (const dir of TRACE_DIRS) {
    if (existsSync(join(dir, sessionId, "blobs"))) return dir;
  }
  return null;
}

/**
 * File content as of a given step: the blob written by the most recent
 * file_edit at or before that step.
 */
export function fileAtStep(sessionId: string, events: TraceEvent[], path: string, step: number): string | null {
  let blob: string | undefined;
  for (const e of events) {
    if (e.type !== "file_edit" || e.step > step || e.data.path !== path) continue;
    if (e.data.blob) blob = e.data.blob;
  }
  if (!blob) return null;
  const root = blobRoot(sessionId);
  if (!root) return null;
  return getBlob(root, sessionId, blob);
}

export function indexPathFor(sessionId: string): string {
  const summary = listTraces().find((t) => t.session_id === sessionId);
  const dir = summary ? resolve(summary.path, "..") : TRACE_DIRS[0]!;
  const candidate = join(dir, "index.db");
  return existsSync(candidate) ? candidate : join(TRACE_DIRS[0]!, "index.db");
}

export function traceFileMtime(path: string): number {
  try {
    return statSync(path).mtimeMs;
  } catch {
    return 0;
  }
}
