/**
 * Isolated capture workspace.
 *
 * The agent must never see AFR's own repository: our commit messages, docs and
 * source describe the demo's seeded bug, and a capable agent WILL read them
 * (observed on codex-cli 0.149.0 — the agent ran `git log`/`git show` on the
 * parent repo and defused the trap from the commit message). A capture
 * therefore runs against a pristine copy of the target app in its own git repo
 * with a neutral history.
 */
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, resolve } from "node:path";

const EXCLUDE = new Set([".git", "node_modules", "data", "dist", "crash.txt", ".DS_Store"]);

function git(cwd: string, args: string[]): void {
  execFileSync("git", args, { cwd, stdio: "ignore" });
}

export type Workspace = { dir: string; sourceDir: string };

/**
 * Copies the target app into traces/<session>/workspace, gives it a fresh git
 * repo with one neutral commit, and links the hoisted node_modules so the
 * agent can actually run the test suite.
 */
export function prepareWorkspace(sourceDir: string, traceRoot: string, sessionId: string, repoRoot: string): Workspace {
  const source = resolve(sourceDir);
  const dir = join(resolve(traceRoot), sessionId, "workspace");
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });

  for (const entry of readdirSync(source)) {
    if (EXCLUDE.has(entry)) continue;
    cpSync(join(source, entry), join(dir, entry), { recursive: true });
  }

  // npm workspaces hoist dependencies to the repo root; without this the agent
  // cannot run `npm test` and the trace loses its test_run events.
  const hoisted = join(repoRoot, "node_modules");
  const localModules = join(source, "node_modules");
  const linkTarget = existsSync(localModules) ? localModules : hoisted;
  if (existsSync(linkTarget)) {
    try {
      symlinkSync(linkTarget, join(dir, "node_modules"), "dir");
    } catch {
      // a pre-existing link or a filesystem that refuses symlinks is not fatal
    }
  }

  writeFileSync(join(dir, ".gitignore"), "node_modules/\ndata/\ncrash.txt\n", "utf8");
  git(dir, ["init", "-q"]);
  git(dir, ["add", "-A"]);
  git(dir, [
    "-c",
    "user.email=dev@example.com",
    "-c",
    "user.name=dev",
    "commit",
    "-qm",
    "initial commit",
  ]);

  return { dir, sourceDir: source };
}

/** Copy the agent's changed files back into the real target app. */
export function applyWorkspace(workspace: Workspace, paths: string[]): string[] {
  const applied: string[] = [];
  for (const rel of paths) {
    const from = join(workspace.dir, rel);
    if (!existsSync(from)) continue;
    const to = join(workspace.sourceDir, rel);
    mkdirSync(join(to, ".."), { recursive: true });
    writeFileSync(to, readFileSync(from, "utf8"), "utf8");
    applied.push(rel);
  }
  return applied;
}
