#!/usr/bin/env node
import { resolve } from "node:path";
import { record } from "./record.js";

function parseArgs(argv: string[]) {
  const positional: string[] = [];
  const flags: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a.startsWith("--")) {
      const [k, inline] = a.slice(2).split("=");
      if (inline !== undefined) flags[k!] = inline;
      else if (argv[i + 1] && !argv[i + 1]!.startsWith("--")) flags[k!] = argv[++i]!;
      else flags[k!] = "true";
    } else positional.push(a);
  }
  return { positional, flags };
}

const { positional, flags } = parseArgs(process.argv.slice(2));
const task = positional.join(" ").trim();

if (!task) {
  console.error(`usage: npm run record -- "<task>" [--dir demo/target-app] [--traces traces]`);
  process.exit(1);
}

const repoRoot = resolve(new URL("../../..", import.meta.url).pathname);
const targetDir = resolve(repoRoot, flags["dir"] ?? "demo/target-app");
const traceRoot = resolve(repoRoot, flags["traces"] ?? "traces");

console.log(`▶ recording codex session`);
console.log(`  task:   ${task}`);
console.log(`  target: ${targetDir}`);
if (flags["no-isolate"] !== "true") console.log(`  isolated: yes (agent cannot see AFR's repo)`);

const started = Date.now();
try {
  const { sessionId, tracePath, events, workspaceDir, applied } = await record({
    task,
    targetDir,
    traceRoot,
    repoRoot,
    isolate: flags["no-isolate"] !== "true",
    apply: flags["no-apply"] !== "true",
    ...(flags["model"] ? { extraArgs: ["--model", flags["model"]] } : {}),
    onEvent: (e) => {
      const label = e.type.padEnd(14);
      const detail =
        e.type === "thought"
          ? e.data.text.slice(0, 90).replace(/\n/g, " ")
          : e.type === "file_edit"
            ? `${e.data.path} (+${e.data.lines_added.reduce((n, [a, b]) => n + (b - a + 1), 0)})`
            : e.type === "shell_command"
              ? e.data.command.slice(0, 90)
              : e.type === "test_run"
                ? `${e.data.passed ? "PASS" : "FAIL"} ${e.data.command}`
                : e.type === "tool_call"
                  ? e.data.name
                  : "";
      console.log(`  ${String(e.step).padStart(3)} ${label} ${detail}`);
    },
  });

  const counts = events.reduce<Record<string, number>>((acc, e) => {
    acc[e.type] = (acc[e.type] ?? 0) + 1;
    return acc;
  }, {});

  console.log(`\n✔ session ${sessionId} — ${events.length} steps in ${Math.round((Date.now() - started) / 1000)}s`);
  console.log(`  ${Object.entries(counts).map(([k, v]) => `${k}=${v}`).join("  ")}`);
  console.log(`  trace: ${tracePath}`);
  if (workspaceDir) console.log(`  workspace: ${workspaceDir}`);
  if (applied.length > 0) console.log(`  applied to target app: ${applied.join(", ")}`);
  console.log(`\n  next: npm run enrich -- ${tracePath}`);
} catch (err) {
  console.error(`\n✖ ${(err as Error).message}`);
  process.exit(1);
}
