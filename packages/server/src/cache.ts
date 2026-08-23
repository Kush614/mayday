/**
 * Demo cache — the stage safety net.
 *
 * Every expensive result (incident verdicts, Modal sandbox re-runs) is written
 * here after a successful live run and replayed from here when the live path
 * fails or is switched off. On stage the demo must never depend on the wifi,
 * an API key, or a cold container.
 *
 * AFR_OFFLINE=1 forces cache-only: no network calls at all.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";

export type CacheKind = "incident" | "replay" | "greptile";

export function cacheDir(repoRoot: string): string {
  return join(repoRoot, "demo", "cache");
}

export function isOffline(): boolean {
  return process.env.AFR_OFFLINE === "1" || process.env.AFR_OFFLINE === "true";
}

function keyHash(parts: (string | number)[]): string {
  return createHash("sha256").update(parts.join(" ")).digest("hex").slice(0, 12);
}

function fileFor(repoRoot: string, kind: CacheKind, key: string): string {
  return join(cacheDir(repoRoot), `${kind}-${key}.json`);
}

/** Incidents are keyed by session plus the failure text, so any paste re-hits. */
export function incidentKey(sessionId: string, failureText: string): string {
  const normalized = failureText.replace(/\s+/g, " ").trim().toLowerCase();
  return `${sessionId.slice(0, 8)}-${keyHash([sessionId, normalized])}`;
}

export function replayKey(sessionId: string, fromStep: number): string {
  return `${sessionId.slice(0, 8)}-step${fromStep}`;
}

export function put(repoRoot: string, kind: CacheKind, key: string, value: unknown): void {
  mkdirSync(cacheDir(repoRoot), { recursive: true });
  writeFileSync(fileFor(repoRoot, kind, key), JSON.stringify(value, null, 2), "utf8");
}

export function get<T>(repoRoot: string, kind: CacheKind, key: string): T | null {
  const file = fileFor(repoRoot, kind, key);
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(readFileSync(file, "utf8")) as T;
  } catch {
    return null;
  }
}

/**
 * Nearest usable entry for a session when the exact key misses — a slightly
 * different paste (extra whitespace, a trimmed frame) should still land.
 */
export function getNearest<T>(repoRoot: string, kind: CacheKind, sessionId: string): T | null {
  const dir = cacheDir(repoRoot);
  if (!existsSync(dir)) return null;
  const prefix = `${kind}-${sessionId.slice(0, 8)}`;
  const candidates = readdirSync(dir)
    .filter((f) => f.startsWith(prefix) && f.endsWith(".json"))
    .sort();
  const first = candidates[0];
  if (!first) return null;
  try {
    return JSON.parse(readFileSync(join(dir, first), "utf8")) as T;
  } catch {
    return null;
  }
}

export function listCached(repoRoot: string): { kind: string; key: string; file: string }[] {
  const dir = cacheDir(repoRoot);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => {
      const [kind, ...rest] = f.replace(/\.json$/, "").split("-");
      return { kind: kind!, key: rest.join("-"), file: join(dir, f) };
    });
}
