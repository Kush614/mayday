import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseTrace, type TraceEvent } from "@mayday/recorder/schema";
import { getBlob } from "@mayday/recorder";

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
    // Enrichment first, then the committed golden copy: the golden trace is the
    // demo's safety net and must win over a live capture of the same session.
    const rank = (t: TraceSummary) => (t.enriched ? 2 : 0) + (t.golden ? 1 : 0);
    const existing = bySession.get(summary.session_id);
    if (!existing || rank(summary) > rank(existing)) bySession.set(summary.session_id, summary);
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

/**
 * Repo state as of step (beforeStep - 1): for every file the agent edited, the
 * blob written by its most recent edit before that step. This is what the Modal
 * sandbox needs to rewind — exact content, no diff replay.
 */
export function reconstructFiles(sessionId: string, events: TraceEvent[], beforeStep: number): Record<string, string> {
  const latest = new Map<string, string>();
  for (const e of events) {
    if (e.type !== "file_edit" || e.step >= beforeStep || !e.data.blob) continue;
    latest.set(e.data.path, e.data.blob);
  }
  const root = blobRoot(sessionId);
  if (!root) return {};
  const files: Record<string, string> = {};
  for (const [path, blob] of latest) {
    const content = getBlob(root, sessionId, blob);
    if (content !== null) files[path] = content;
  }
  return files;
}

const SANDBOX_SKIP = new Set(["node_modules", "data", ".git", "dist", "crash.txt", ".DS_Store"]);

/**
 * Every file of the target app as of step (beforeStep - 1): the checked-in app
 * overlaid with the recorder's blobs. The Modal sandbox writes this map straight
 * to disk, so the sandbox image stays generic (Node + Codex only) and a new
 * trace never requires a redeploy.
 */
export function appFilesAtStep(sessionId: string, events: TraceEvent[], beforeStep: number, appDir: string): Record<string, string> {
  const files: Record<string, string> = {};

  const walk = (dir: string, prefix: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (SANDBOX_SKIP.has(entry.name)) continue;
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      const abs = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(abs, rel);
        continue;
      }
      try {
        files[rel] = readFileSync(abs, "utf8");
      } catch {
        // binary or unreadable files are not part of this demo app
      }
    }
  };
  if (existsSync(appDir)) walk(appDir, "");

  // The agent's own edits win over the checked-in copy.
  for (const [path, content] of Object.entries(reconstructFiles(sessionId, events, beforeStep))) {
    files[path] = content;
  }
  return files;
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
