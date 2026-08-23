import { join } from "node:path";
import { loadTrace, appFilesAtStep, REPO_ROOT } from "../packages/server/src/traces.js";

const id = process.argv[2] ?? "01M0RCB1FK24HQTZB7NW7R022X";
const step = Number(process.argv[3] ?? 12);
const loaded = loadTrace(id);
if (!loaded) throw new Error(`no trace ${id}`);

const files = appFilesAtStep(id, loaded.events, step, join(REPO_ROOT, "demo", "target-app"), REPO_ROOT);
const items = files["src/items.ts"] ?? "";
console.log(`files sent to sandbox      : ${Object.keys(files).length}`);
console.log(`src/items.ts lines         : ${items.split("\n").length}`);
console.log(`pre-agent guard present    : ${items.includes("WHERE user_id = ? ORDER BY id")}`);
console.log(`agent pagination present   : ${items.includes("LIMIT ? OFFSET ?")}  (must be false)`);
console.log(`prod-sim included          : ${Boolean(files["src/prod-sim.ts"])}`);
console.log(`ops schema included        : ${Boolean(files["ops/production-schema.sql"])}`);
