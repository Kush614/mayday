import type { Request, Response } from "express";
import type { Db } from "./db.js";

export type ItemRow = {
  id: number;
  name: string;
  price_cents: number;
  user_id: number;
  created_at: string;
};

export type ItemDTO = {
  id: number;
  name: string;
  price: string;
  owner: string;
  created_at: string;
};

export function toDTO(row: ItemRow): ItemDTO {
  return {
    id: row.id,
    name: row.name,
    price: `$${(row.price_cents / 100).toFixed(2)}`,
    owner: `user-${row.user_id}`,
    created_at: row.created_at,
  };
}

export function listItems(db: Db, _req: Request, res: Response): void {
  const rows = db.prepare(`SELECT * FROM items ORDER BY id`).all() as ItemRow[];
  res.json({ items: rows.map(toDTO) });
}

export function getItem(db: Db, req: Request, res: Response): void {
  const row = db.prepare(`SELECT * FROM items WHERE id = ?`).get(req.params.id) as ItemRow | undefined;
  if (!row) {
    res.status(404).json({ error: "not found" });
    return;
  }
  res.json(toDTO(row));
}

export function createItem(db: Db, req: Request, res: Response): void {
  const { name, price_cents, user_id } = req.body ?? {};
  if (typeof name !== "string" || !name) {
    res.status(400).json({ error: "name is required" });
    return;
  }
  const info = db
    .prepare(`INSERT INTO items (name, price_cents, user_id) VALUES (?, ?, ?)`)
    .run(name, Number(price_cents ?? 0), user_id ?? null);
  const row = db.prepare(`SELECT * FROM items WHERE id = ?`).get(info.lastInsertRowid) as ItemRow;
  res.status(201).json(toDTO(row));
}

export function deleteItem(db: Db, req: Request, res: Response): void {
  db.prepare(`DELETE FROM items WHERE id = ?`).run(req.params.id);
  res.status(204).end();
}
