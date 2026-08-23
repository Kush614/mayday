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

/**
 * Paths stripped from the copy after it lands. The production traffic simulator
 * and the ops schema describe PRODUCTION, not the app: an agent that reads them
 * learns the very fact the demo depends on it not knowing, and observed captures
 * show it does read them. In a real shop these live with the SRE tooling.
 */
const STRIP = ["ops", "src/prod-sim.ts"];
const STRIP_SCRIPTS = ["prod-sim"];

function git(cwd: string, args: string[]): void {
  execFileSync("git", args, { cwd, stdio: "ignore" });
}

export type Workspace = { dir: string; sourceDir: string; baselineDir: string };

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

  // A pristine copy kept next to the blobs. Reconstructing "the repo before
  // step N" needs the app as it was when the session started, and neither the
  // working tree (the agent's changes are applied back to it) nor the recorded
  // git sha (it belongs to this throwaway workspace repo) can provide that.
  const baselineDir = join(resolve(traceRoot), sessionId, "baseline");
  rmSync(baselineDir, { recursive: true, force: true });
  mkdirSync(baselineDir, { recursive: true });
  for (const entry of readdirSync(source)) {
    if (EXCLUDE.has(entry)) continue;
    cpSync(join(source, entry), join(baselineDir, entry), { recursive: true });
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

  for (const rel of STRIP) rmSync(join(dir, rel), { recursive: true, force: true });

  // Leaving a script that points at a stripped file invites the agent to go looking.
  const pkgPath = join(dir, "package.json");
  if (existsSync(pkgPath)) {
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as { scripts?: Record<string, string> };
    if (pkg.scripts) for (const name of STRIP_SCRIPTS) delete pkg.scripts[name];
    writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n", "utf8");
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

  return { dir, sourceDir: source, baselineDir };
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
