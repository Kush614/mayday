/**
 * Greptile findings as incident artifacts (INTEGRATIONS.md §3b).
 *
 * Two sources, CLI first:
 *   1. `greptile review --json` — reviews the current branch, no PR required.
 *   2. GitHub PR review comments — Greptile posts its review as PR comments.
 *
 * The CLI's JSON shape is normalized defensively (field names vary by version);
 * anything with a path, a line and a body becomes a finding.
 */
import { spawn } from "node:child_process";
import type { GreptileFinding } from "./parse-failure.js";

const GREPTILE_LOGINS = ["greptile-apps[bot]", "greptileai[bot]", "greptile[bot]"];

function num(v: unknown): number | null {
  const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? n : null;
}

function pick(obj: Record<string, unknown>, keys: string[]): unknown {
  for (const k of keys) if (obj[k] !== undefined && obj[k] !== null) return obj[k];
  return undefined;
}

/** Pull findings out of whatever container the CLI wraps them in. */
function collectFindings(json: unknown): Record<string, unknown>[] {
  if (Array.isArray(json)) return json.filter((x): x is Record<string, unknown> => Boolean(x) && typeof x === "object");
  if (!json || typeof json !== "object") return [];
  const obj = json as Record<string, unknown>;
  for (const key of ["comments", "findings", "results", "review", "issues", "data"]) {
    const value = obj[key];
    if (Array.isArray(value)) return collectFindings(value);
    if (value && typeof value === "object") {
      const nested = collectFindings(value);
      if (nested.length) return nested;
    }
  }
  return [];
}

export function normalizeFinding(raw: Record<string, unknown>): GreptileFinding | null {
  const path = pick(raw, ["path", "file", "filePath", "file_path", "filename"]);
  const comment = pick(raw, ["comment", "body", "message", "description", "text", "content"]);
  if (typeof path !== "string" || typeof comment !== "string") return null;

  const range = pick(raw, ["line_range", "lineRange", "lines"]);
  let start: number | null = null;
  let end: number | null = null;
  if (Array.isArray(range) && range.length >= 1) {
    start = num(range[0]);
    end = num(range[1] ?? range[0]);
  } else {
    end = num(pick(raw, ["line", "end_line", "endLine", "line_end", "original_line"]));
    start = num(pick(raw, ["start_line", "startLine", "line_start"])) ?? end;
  }
  if (start === null && end === null) return null;
  const s = start ?? end!;
  const e = end ?? start!;

  const finding: GreptileFinding = {
    path,
    line_range: [Math.min(s, e), Math.max(s, e)],
    comment,
  };
  const url = pick(raw, ["url", "html_url", "link"]);
  if (typeof url === "string") finding.url = url;
  return finding;
}

export type ReviewOptions = { cwd: string; branch?: string; instructions?: string; bin?: string; timeoutMs?: number };

/** Runs the Greptile CLI against the current branch and returns its findings. */
export function runGreptileReview(opts: ReviewOptions): Promise<GreptileFinding[]> {
  const bin = opts.bin ?? process.env.AFR_GREPTILE_BIN ?? "greptile";
  const args = ["review", "--json"];
  if (opts.branch) args.push("--branch", opts.branch);
  if (opts.instructions) args.push("--instructions", opts.instructions);

  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { cwd: opts.cwd, env: process.env });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`greptile review timed out after ${(opts.timeoutMs ?? 300_000) / 1000}s`));
    }, opts.timeoutMs ?? 300_000);

    child.stdout.on("data", (c: Buffer) => (stdout += c.toString()));
    child.stderr.on("data", (c: Buffer) => (stderr += c.toString()));
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(
        new Error(
          `could not run \`${bin}\` (${err.message}). Install with \`npm i -g greptile\` and sign in with \`greptile login\`.`,
        ),
      );
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      const combined = `${stdout}\n${stderr}`;
      if (/not signed in|greptile login/i.test(combined)) {
        reject(new Error("greptile CLI is not signed in — run `greptile login`"));
        return;
      }
      // The JSON may be preceded by banner output; take the first JSON value.
      const jsonStart = stdout.search(/[[{]/);
      if (jsonStart === -1) {
        reject(new Error(`greptile review returned no JSON (exit ${code}): ${combined.trim().slice(0, 300)}`));
        return;
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(stdout.slice(jsonStart));
      } catch (err) {
        reject(new Error(`could not parse greptile JSON: ${(err as Error).message}`));
        return;
      }
      const findings = collectFindings(parsed)
        .map(normalizeFinding)
        .filter((f): f is GreptileFinding => f !== null);
      resolve(findings);
    });
  });
}

export async function fetchGreptileFindings(opts: {
  repo: string;
  pr: number;
  token?: string;
  includeAllReviewers?: boolean;
}): Promise<GreptileFinding[]> {
  const token = opts.token ?? process.env.GITHUB_TOKEN;
  if (!token) throw new Error("GITHUB_TOKEN is required to read PR review comments");

  const res = await fetch(`https://api.github.com/repos/${opts.repo}/pulls/${opts.pr}/comments?per_page=100`, {
    headers: {
      authorization: `Bearer ${token}`,
      accept: "application/vnd.github+json",
      "user-agent": "agent-flight-recorder",
    },
  });
  if (!res.ok) throw new Error(`GitHub API ${res.status}: ${(await res.text()).slice(0, 300)}`);

  const comments = (await res.json()) as Record<string, unknown>[];
  return comments
    .filter((c) => {
      const login = (c["user"] as { login?: string } | undefined)?.login ?? "";
      return opts.includeAllReviewers || GREPTILE_LOGINS.includes(login);
    })
    .map((c) => normalizeFinding({ ...c, pr: opts.pr }))
    .filter((f): f is GreptileFinding => f !== null);
}
