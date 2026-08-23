/**
 * Production simulator: the traffic mix the test suite does not cover.
 * Real users include guests whose cart items have no owner yet.
 */
import { openDb } from "./db.js";
import { seedOwnedItems, seedGuestItem } from "./seed.js";
import { createApp } from "./server.js";
import { rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dbFile = join(root, "data", "prod-sim.db");
rmSync(dbFile, { force: true });
rmSync(`${dbFile}-wal`, { force: true });
rmSync(`${dbFile}-shm`, { force: true });

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
        console.log("\n--- server error ---");
        console.log(body.slice(0, 4000));
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
