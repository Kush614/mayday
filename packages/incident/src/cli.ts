#!/usr/bin/env node
import "dotenv/config";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { parseTrace } from "@afr/recorder/schema";
import { costSoFar } from "@afr/enricher";
import { parseFailure, fromGreptileFinding } from "./parse-failure.js";
import { analyzeIncident } from "./analyze.js";
import { fetchGreptileFindings } from "./greptile.js";

const args = process.argv.slice(2);
function flag(name: string): string | undefined {
  const i = args.indexOf(`--${name}`);
  if (i >= 0 && args[i + 1] && !args[i + 1]!.startsWith("--")) return args[i + 1];
  const inline = args.find((a) => a.startsWith(`--${name}=`));
  return inline ? inline.split("=").slice(1).join("=") : undefined;
}

const tracePath = args.find((a) => !a.startsWith("--"));
if (!tracePath) {
  console.error(
    `usage:\n` +
      `  npm run incident -- traces/<id>.enriched.jsonl --error err.txt\n` +
      `  npm run incident -- traces/<id>.enriched.jsonl --greptile-pr 3 [--repo owner/name]\n` +
      `  npm run incident -- traces/<id>.enriched.jsonl --greptile-file finding.json`,
  );
  process.exit(1);
}

const resolvedTrace = resolve(tracePath);
const events = parseTrace(readFileSync(resolvedTrace, "utf8"));
const indexPath = resolve(flag("index") ?? join(dirname(resolvedTrace), "index.db"));

let artifact;
const errorFile = flag("error");
const greptilePr = flag("greptile-pr");
const greptileFile = flag("greptile-file");

if (errorFile) {
  artifact = parseFailure(readFileSync(resolve(errorFile), "utf8"));
} else if (greptileFile) {
  artifact = fromGreptileFinding(JSON.parse(readFileSync(resolve(greptileFile), "utf8")));
} else if (greptilePr) {
  const repo = flag("repo") ?? process.env.GITHUB_REPO;
  if (!repo) throw new Error("--repo owner/name (or GITHUB_REPO) is required with --greptile-pr");
  const findings = await fetchGreptileFindings({ repo, pr: Number(greptilePr) });
  if (findings.length === 0) throw new Error(`no Greptile review comments found on ${repo}#${greptilePr}`);
  console.log(`  using Greptile finding: ${findings[0]!.path}:${findings[0]!.line_range.join("-")}`);
  artifact = fromGreptileFinding(findings[0]!);
} else {
  // Read the failure from stdin when no source flag is given.
  const stdin = readFileSync(0, "utf8");
  if (!stdin.trim()) {
    console.error("provide --error <file>, --greptile-pr <n>, --greptile-file <f>, or pipe the failure on stdin");
    process.exit(1);
  }
  artifact = parseFailure(stdin);
}

console.log(`▶ incident analysis — ${artifact.kind}, ${artifact.frames.length} frame(s)`);

try {
  const result = await analyzeIncident({ events, artifact, indexPath, ...(flag("model") ? { model: flag("model")! } : {}) });
  const outPath = flag("out") ?? join(dirname(resolvedTrace), `${events[0]!.session_id}.incident.json`);
  writeFileSync(outPath, JSON.stringify(result, null, 2), "utf8");

  console.log(`\n╭─ FORENSICS ────────────────────────────────────────────`);
  console.log(`│ failure     ${result.failure.message}`);
  console.log(`│ faulty step ${result.step}  ${result.candidates[0]!.reason}`);
  if (result.assumption) {
    console.log(`│ assumption  "${result.assumption.claim}"`);
    console.log(`│ basis step  ${result.basis_step ?? "—"}${result.basis_summary ? `  ${result.basis_summary.slice(0, 60)}` : ""}`);
  } else {
    console.log(`│ assumption  (none matched)`);
  }
  console.log(`│ verdict     ${result.verdict}`);
  console.log(`│ correction  ${result.correction}`);
  console.log(`│ confidence  ${result.confidence}  ·  ${result.elapsed_ms}ms  ·  $${costSoFar().usd.toFixed(4)}`);
  console.log(`╰────────────────────────────────────────────────────────`);
  console.log(`\n  wrote ${outPath}`);
  console.log(`  next: modal run modal/replay_sandbox.py --trace ${events[0]!.session_id} --from-step ${result.step}`);
} catch (err) {
  console.error(`\n✖ ${(err as Error).message}`);
  process.exit(1);
}
