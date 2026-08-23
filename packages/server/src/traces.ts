import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { execFileSync } from "node:child_process";
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

/** Root that holds this session's baseline/ dir, if the capture saved one. */
export function baselineRoot(sessionId: string): string | null {
  for (const dir of TRACE_DIRS) {
    if (existsSync(join(dir, sessionId, "baseline"))) return join(dir, sessionId, "baseline");
  }
  return null;
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

  // Before the first edit there is no blob: show the file as the session found
  // it, so scrubbing to early steps reads the original rather than an error.
  if (!blob) {
    const baseline = baselineRoot(sessionId);
    if (!baseline) return null;
    const candidate = join(baseline, path);
    return existsSync(candidate) ? readFileSync(candidate, "utf8") : null;
  }

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

function walkFiles(dir: string, prefix: string, out: Record<string, string>): void {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (SANDBOX_SKIP.has(entry.name)) continue;
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    const abs = join(dir, entry.name);
    if (entry.isDirectory()) {
      walkFiles(abs, rel, out);
      continue;
    }
    try {
      out[rel] = readFileSync(abs, "utf8");
    } catch {
      // binary or unreadable files are not part of this demo app
    }
  }
}

/**
 * The target app as it stood when the session STARTED, read out of git at the
 * recorded sha. Reading the working tree instead would be wrong: the agent's
 * changes are applied back to the repo after a capture, so "before step N" would
 * silently include the very edits we are trying to rewind past.
 */
function appFilesAtSessionStart(gitSha: string, appDir: string, repoRoot: string): Record<string, string> | null {
  if (!gitSha || gitSha === "unknown") return null;
  const relDir = appDir.startsWith(repoRoot) ? appDir.slice(repoRoot.length + 1) : appDir;
  try {
    const listed = execFileSync("git", ["ls-tree", "-r", "--name-only", gitSha, "--", relDir], {
      cwd: repoRoot,
      encoding: "utf8",
      maxBuffer: 32 * 1024 * 1024,
    })
      .split("\n")
      .filter(Boolean);
    if (listed.length === 0) return null;

    const files: Record<string, string> = {};
    for (const repoPath of listed) {
      const rel = repoPath.slice(relDir.length + 1);
      if (!rel || [...SANDBOX_SKIP].some((skip) => rel === skip || rel.startsWith(`${skip}/`))) continue;
      try {
        files[rel] = execFileSync("git", ["show", `${gitSha}:${repoPath}`], {
          cwd: repoRoot,
          encoding: "utf8",
          maxBuffer: 32 * 1024 * 1024,
        });
      } catch {
        // deleted or binary; skip
      }
    }
    return Object.keys(files).length > 0 ? files : null;
  } catch {
    return null;
  }
}

/**
 * Every file of the target app as of step (beforeStep - 1): the app at the
 * session's starting commit, overlaid with the recorder's blobs. The Modal
 * sandbox writes this map straight to disk, so the image stays generic and a new
 * trace never requires a redeploy.
 */
export function appFilesAtStep(
  sessionId: string,
  events: TraceEvent[],
  beforeStep: number,
  appDir: string,
  repoRoot: string,
): Record<string, string> {
  // Preference order: the capture's own pristine baseline, then the session's
  // git sha, then the working tree (which may already contain the agent's work).
  let files: Record<string, string> | null = null;
  const baseline = baselineRoot(sessionId);
  if (baseline) {
    files = {};
    walkFiles(baseline, "", files);
  }
  if (!files || Object.keys(files).length === 0) {
    const gitSha = events.find((e) => e.type === "session_start")?.data.git_sha ?? "";
    files = appFilesAtSessionStart(gitSha, appDir, repoRoot);
  }
  if (!files || Object.keys(files).length === 0) {
    files = {};
    if (existsSync(appDir)) walkFiles(appDir, "", files);
  }

  // The agent's own edits, up to but excluding the step we are rewinding to.
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
