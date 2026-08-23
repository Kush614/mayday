import Database from "better-sqlite3";
import { readFileSync, readdirSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");

export type Db = Database.Database;

export function openDb(file = join(root, "data", "items.db")): Db {
  if (file !== ":memory:") mkdirSync(dirname(file), { recursive: true });
  const db = new Database(file);
  db.pragma("journal_mode = WAL");
  migrate(db);
  return db;
}

/** Applies every migration in order; tracked in schema_migrations. */
export function migrate(db: Db): void {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY)`);
  const applied = new Set(db.prepare(`SELECT name FROM schema_migrations`).all().map((r) => (r as { name: string }).name));
  const dir = join(root, "migrations");
  for (const name of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    if (applied.has(name)) continue;
    db.exec(readFileSync(join(dir, name), "utf8"));
    db.prepare(`INSERT INTO schema_migrations (name) VALUES (?)`).run(name);
  }
}
