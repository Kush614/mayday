import { execFileSync } from "node:child_process";

function git(cwd: string, args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
}

export function headSha(cwd: string): string {
  try {
    return git(cwd, ["rev-parse", "HEAD"]).trim();
  } catch {
    return "unknown";
  }
}

/** File content at HEAD; "" when the file is new (untracked). */
export function fileAtHead(cwd: string, path: string): string {
  try {
    return git(cwd, ["show", `HEAD:${path}`]);
  } catch {
    return "";
  }
}

export function workingDiff(cwd: string): string {
  try {
    const tracked = git(cwd, ["diff", "HEAD", "--relative", "--"]);
    const untracked = git(cwd, ["ls-files", "--others", "--exclude-standard"])
      .split("\n")
      .filter(Boolean);
    const extra = untracked
      .map((p) => {
        try {
          return git(cwd, ["diff", "--no-index", "--", "/dev/null", p]);
        } catch (err) {
          // --no-index exits 1 when files differ; the diff is still on stdout.
          const e = err as { stdout?: string };
          return e.stdout ?? "";
        }
      })
      .join("");
    return tracked + extra;
  } catch {
    return "";
  }
}

export function filesTouched(cwd: string): string[] {
  try {
    const changed = git(cwd, ["diff", "HEAD", "--relative", "--name-only"]).split("\n").filter(Boolean);
    const untracked = git(cwd, ["ls-files", "--others", "--exclude-standard"]).split("\n").filter(Boolean);
    return [...new Set([...changed, ...untracked])];
  } catch {
    return [];
  }
}

export function isRepo(cwd: string): boolean {
  try {
    return git(cwd, ["rev-parse", "--is-inside-work-tree"]).trim() === "true";
  } catch {
    return false;
  }
}
