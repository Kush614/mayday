import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

/** Content-addressed file snapshots so the UI can scrub file state without git. */
export function blobDir(traceRoot: string, sessionId: string): string {
  return join(traceRoot, sessionId, "blobs");
}

export function hashContent(content: string): string {
  return createHash("sha256").update(content).digest("hex").slice(0, 16);
}

export function putBlob(traceRoot: string, sessionId: string, content: string): string {
  const dir = blobDir(traceRoot, sessionId);
  mkdirSync(dir, { recursive: true });
  const hash = hashContent(content);
  const file = join(dir, hash);
  if (!existsSync(file)) writeFileSync(file, content, "utf8");
  return hash;
}

export function getBlob(traceRoot: string, sessionId: string, hash: string): string | null {
  const file = join(blobDir(traceRoot, sessionId), hash);
  if (!existsSync(file)) return null;
  return readFileSync(file, "utf8");
}
