import { openDb } from "./db.js";
import type { Db } from "./db.js";

/** Items owned by signed-in users — what the test suite and dev DB look like. */
export function seedOwnedItems(db: Db): void {
  const insert = db.prepare(`INSERT INTO items (name, price_cents, user_id) VALUES (?, ?, ?)`);
  const rows: [string, number, number][] = [
    ["Blue mug", 1200, 1],
    ["Notebook", 450, 1],
    ["Desk lamp", 3400, 2],
    ["Mechanical keyboard", 8900, 2],
    ["Cable organizer", 700, 3],
  ];
  for (const r of rows) insert.run(...r);
}

/** A guest cart row: real production traffic, no owner until checkout. */
export function seedGuestItem(db: Db): void {
  db.prepare(`INSERT INTO items (name, price_cents, user_id) VALUES (?, ?, NULL)`).run("Guest cart: travel mug", 1900);
}

if (process.argv[1] && process.argv[1].endsWith("seed.ts")) {
  const db = openDb();
  db.exec(`DELETE FROM items`);
  seedOwnedItems(db);
  seedGuestItem(db);
  const n = db.prepare(`SELECT COUNT(*) AS n FROM items`).get() as { n: number };
  console.log(`seeded ${n.n} items`);
}
