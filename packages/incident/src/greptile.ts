/**
 * Greptile findings as incident artifacts (INTEGRATIONS.md §3b).
 * Greptile posts its review as PR comments, so the GitHub API is enough.
 */
import type { GreptileFinding } from "./parse-failure.js";

const GREPTILE_LOGINS = ["greptile-apps[bot]", "greptileai[bot]", "greptile[bot]"];

type GhComment = {
  id: number;
  path?: string;
  line?: number | null;
  start_line?: number | null;
  original_line?: number | null;
  body: string;
  html_url: string;
  user?: { login?: string };
};

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

  const comments = (await res.json()) as GhComment[];
  return comments
    .filter((c) => opts.includeAllReviewers || GREPTILE_LOGINS.includes(c.user?.login ?? ""))
    .filter((c): c is GhComment & { path: string } => Boolean(c.path))
    .map((c) => {
      const end = c.line ?? c.original_line ?? 1;
      const start = c.start_line ?? end;
      return {
        path: c.path,
        line_range: [start, end] as [number, number],
        comment: c.body,
        pr: opts.pr,
        url: c.html_url,
      };
    });
}
