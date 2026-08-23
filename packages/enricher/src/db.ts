/**
 * SQLite index over enriched traces (traces/index.db).
 * Rebuilt from JSONL on every enrich run — JSONL is the source of truth.
 */
import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { TraceEvent } from "@mayday/recorder/schema";
import { buildLineOrigin } from "./line-history.js";

export type Db = Database.Database;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS sessions (
  session_id TEXT PRIMARY KEY,
  task       TEXT NOT NULL,
  model      TEXT NOT NULL,
  git_sha    TEXT NOT NULL,
  cwd        TEXT NOT NULL,
  started_at TEXT NOT NULL,
  steps      INTEGER NOT NULL,
  trace_path TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS steps (
  session_id TEXT NOT NULL,
  step       INTEGER NOT NULL,
  type       TEXT NOT NULL,
  ts         TEXT NOT NULL,
  path       TEXT,
  risk       TEXT,
  intent     TEXT,
  PRIMARY KEY (session_id, step)
);
CREATE TABLE IF NOT EXISTS assumptions (
  id         TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  step       INTEGER NOT NULL,
  claim      TEXT NOT NULL,
  basis_step INTEGER,
  confidence TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS line_origin (
  session_id TEXT NOT NULL,
  path       TEXT NOT NULL,
  line_no    INTEGER NOT NULL,
  step       INTEGER NOT NULL,
  PRIMARY KEY (session_id, path, line_no)
);
CREATE INDEX IF NOT EXISTS idx_line_origin_lookup ON line_origin(session_id, path, line_no);
CREATE INDEX IF NOT EXISTS idx_assumptions_step ON assumptions(session_id, step);
`;

export function openIndex(file: string): Db {
  mkdirSync(dirname(file), { recursive: true });
  const db = new Database(file);
  db.pragma("journal_mode = WAL");
  db.exec(SCHEMA);
  return db;
}

export function indexTrace(db: Db, events: TraceEvent[], tracePath: string): void {
  const start = events.find((e) => e.type === "session_start");
  if (!start) throw new Error("trace has no session_start event");
  const sessionId = start.session_id;

  const wipe = db.transaction(() => {
    for (const table of ["sessions", "steps", "assumptions", "line_origin"]) {
      db.prepare(`DELETE FROM ${table} WHERE session_id = ?`).run(sessionId);
    }
  });
  wipe();

  const insertSession = db.prepare(
    `INSERT INTO sessions (session_id, task, model, git_sha, cwd, started_at, steps, trace_path)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const insertStep = db.prepare(
    `INSERT INTO steps (session_id, step, type, ts, path, risk, intent) VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );
  const insertAssumption = db.prepare(
    `INSERT INTO assumptions (id, session_id, step, claim, basis_step, confidence) VALUES (?, ?, ?, ?, ?, ?)`,
  );
  const insertLine = db.prepare(
    `INSERT OR REPLACE INTO line_origin (session_id, path, line_no, step) VALUES (?, ?, ?, ?)`,
  );

  const write = db.transaction(() => {
    insertSession.run(
      sessionId,
      start.data.task,
      start.data.model,
      start.data.git_sha,
      start.data.cwd,
      start.ts,
      events.length,
      tracePath,
    );
    for (const e of events) {
      insertStep.run(
        sessionId,
        e.step,
        e.type,
        e.ts,
        e.type === "file_edit" ? e.data.path : null,
        e.enrichment?.risk ?? null,
        e.enrichment?.intent ?? null,
      );
      for (const a of e.enrichment?.assumptions ?? []) {
        insertAssumption.run(a.id, sessionId, e.step, a.claim, a.basis_step, a.confidence);
      }
    }
    for (const o of buildLineOrigin(events)) {
      insertLine.run(sessionId, o.path, o.line_no, o.step);
    }
  });
  write();
}

export type StepCandidate = { path: string; line_no: number; step: number; risk: string | null; type: string };

/**
 * Which step wrote a given line. Falls back to the nearest written line within
 * `slack` lines — stack frames often point a line or two off the edit.
 */
export function lookupLine(db: Db, sessionId: string, path: string, line: number, slack = 3): StepCandidate | null {
  const exact = db
    .prepare(
      `SELECT lo.path, lo.line_no, lo.step, s.risk, s.type
       FROM line_origin lo JOIN steps s ON s.session_id = lo.session_id AND s.step = lo.step
       WHERE lo.session_id = ? AND lo.path = ? AND lo.line_no = ?`,
    )
    .get(sessionId, path, line) as StepCandidate | undefined;
  if (exact) return exact;

  return (
    (db
      .prepare(
        `SELECT lo.path, lo.line_no, lo.step, s.risk, s.type
         FROM line_origin lo JOIN steps s ON s.session_id = lo.session_id AND s.step = lo.step
         WHERE lo.session_id = ? AND lo.path = ? AND ABS(lo.line_no - ?) <= ?
         ORDER BY ABS(lo.line_no - ?) ASC, lo.step DESC LIMIT 1`,
      )
      .get(sessionId, path, line, slack, line) as StepCandidate | undefined) ?? null
  );
}

/** Path matching is suffix-based: stack traces carry absolute or dist paths. */
export function resolvePath(db: Db, sessionId: string, path: string): string | null {
  const paths = db
    .prepare(`SELECT DISTINCT path FROM line_origin WHERE session_id = ?`)
    .all(sessionId)
    .map((r) => (r as { path: string }).path);
  const normalized = path.replace(/\\/g, "/");
  const exact = paths.find((p) => p === normalized);
  if (exact) return exact;
  const suffix = paths.find((p) => normalized.endsWith(p) || p.endsWith(normalized));
  if (suffix) return suffix;
  const base = normalized.split("/").pop()!.replace(/\.js$/, ".ts");
  return paths.find((p) => p.split("/").pop() === base) ?? null;
}

export function listSessions(db: Db): { session_id: string; task: string; started_at: string; steps: number }[] {
  return db
    .prepare(`SELECT session_id, task, started_at, steps FROM sessions ORDER BY started_at DESC`)
    .all() as { session_id: string; task: string; started_at: string; steps: number }[];
}
