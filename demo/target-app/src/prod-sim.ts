/**
 * Production simulator: the traffic mix the test suite does not cover.
 * Real users include guests whose cart items have no owner yet.
 */
import { openDb } from "./db.js";
import { seedOwnedItems, seedGuestItem } from "./seed.js";
import { createApp } from "./server.js";
import { rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dbFile = join(root, "data", "prod-sim.db");
rmSync(dbFile, { force: true });
rmSync(`${dbFile}-wal`, { force: true });
rmSync(`${dbFile}-shm`, { force: true });

const crashFile = join(root, "crash.txt");

/**
 * Express renders uncaught handler errors as an HTML page. Incident Mode wants
 * the raw stack, so unwrap it back to plain text.
 */
function extractStack(body: string): string {
  if (!body.trimStart().startsWith("<")) return body.slice(0, 4000);
  const pre = /<pre>([\s\S]*?)<\/pre>/.exec(body);
  const inner = pre ? pre[1]! : body;
  return inner
    .replace(/<br\s*\/?>/g, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .split("\n")
    .map((l) => l.replace(/\s+$/, ""))
    .join("\n")
    .trim()
    .slice(0, 4000);
}

const setup = openDb(dbFile);
seedOwnedItems(setup);
seedGuestItem(setup);
setup.close();

const { app } = createApp(dbFile);
const server = app.listen(0, async () => {
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  const base = `http://127.0.0.1:${port}`;

  console.log(`prod-sim: replaying production traffic against ${base}`);
  let failed = false;

  for (const path of ["/items?page=1&limit=10", "/items"]) {
    process.stdout.write(`  GET ${path} ... `);
    try {
      const res = await fetch(`${base}${path}`);
      const body = await res.text();
      if (res.status >= 500) {
        failed = true;
        console.log(`HTTP ${res.status}`);
        const trace = extractStack(body);
        console.log("\n--- server error ---");
        console.log(trace);
        writeFileSync(crashFile, trace + "\n", "utf8");
        console.log(`\n(stack trace written to ${crashFile})`);
        break;
      }
      console.log(`HTTP ${res.status}`);
    } catch (err) {
      failed = true;
      console.log("connection error");
      console.error(err);
      break;
    }
  }

  server.close();
  if (failed) {
    console.error("\nprod-sim: FAILED — production traffic crashed the items endpoint");
    process.exit(1);
  }
  console.log("\nprod-sim: ok");
});
