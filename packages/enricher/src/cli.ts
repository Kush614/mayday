#!/usr/bin/env node
import "dotenv/config";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname, join, basename } from "node:path";
import { parseTrace, serializeTrace } from "@mayday/recorder/schema";
import { enrichTrace } from "./enrich.js";
import { costSoFar } from "./llm.js";
import { openIndex, indexTrace } from "./db.js";

/** npm -w runs with cwd set to the package dir; resolve user paths from where they typed. */
function fromUserCwd(p: string): string {
  return resolve(process.env.INIT_CWD ?? process.cwd(), p);
}

const args = process.argv.slice(2);
const input = args.find((a) => !a.startsWith("--"));
if (!input) {
  console.error(`usage: npm run enrich -- traces/<id>.jsonl [--concurrency 5] [--model gpt-5-mini] [--index traces/index.db]`);
  process.exit(1);
}

function flag(name: string, fallback?: string): string | undefined {
  const i = args.indexOf(`--${name}`);
  if (i >= 0 && args[i + 1] && !args[i + 1]!.startsWith("--")) return args[i + 1];
  const inline = args.find((a) => a.startsWith(`--${name}=`));
  return inline ? inline.split("=")[1] : fallback;
}

const tracePath = fromUserCwd(input);
const events = parseTrace(readFileSync(tracePath, "utf8"));
const outPath = tracePath.replace(/(\.enriched)?\.jsonl$/, ".enriched.jsonl");
const indexPath = fromUserCwd(flag("index", join(dirname(tracePath), "index.db"))!);

console.log(`▶ enriching ${basename(tracePath)} — ${events.length} events`);

const { events: enriched, enriched: ok, failed } = await enrichTrace(events, {
  concurrency: Number(flag("concurrency", "5")),
  ...(flag("model") ? { model: flag("model")! } : {}),
  onProgress: (p) => {
    const bar = `${p.done}/${p.total}`.padEnd(8);
    process.stdout.write(`  ${bar} step ${String(p.step).padStart(3)}${p.failed ? ` ✖ ${p.failed.slice(0, 80)}` : " ✓"}\n`);
  },
});

writeFileSync(outPath, serializeTrace(enriched), "utf8");

const db = openIndex(indexPath);
indexTrace(db, enriched, outPath);
const lineRows = db.prepare(`SELECT COUNT(*) AS n FROM line_origin WHERE session_id = ?`).get(enriched[0]!.session_id) as { n: number };
const assumptionRows = db.prepare(`SELECT COUNT(*) AS n FROM assumptions WHERE session_id = ?`).get(enriched[0]!.session_id) as { n: number };
db.close();

const cost = costSoFar();
console.log(`\n✔ enriched ${ok} steps (${failed} failed) → ${outPath}`);
console.log(`  index: ${indexPath} — ${lineRows.n} attributed lines, ${assumptionRows.n} assumptions`);
console.log(`  cost:  $${cost.usd.toFixed(4)} across ${cost.calls} calls`);
console.log(`\n  next: npm run incident -- ${outPath} --error <file>`);
