import express from "express";
import { openDb } from "./db.js";
import { listItems, getItem, createItem, deleteItem } from "./items.js";

export function createApp(dbFile?: string) {
  const db = openDb(dbFile);
  const app = express();
  app.use(express.json());

  app.get("/health", (_req, res) => res.json({ ok: true }));
  app.get("/items", (req, res) => listItems(db, req, res));
  app.get("/items/:id", (req, res) => getItem(db, req, res));
  app.post("/items", (req, res) => createItem(db, req, res));
  app.delete("/items/:id", (req, res) => deleteItem(db, req, res));

  return { app, db };
}

if (process.argv[1] && process.argv[1].endsWith("server.ts")) {
  const port = Number(process.env.PORT ?? 3000);
  const { app } = createApp();
  app.listen(port, () => console.log(`items api on http://localhost:${port}`));
}
