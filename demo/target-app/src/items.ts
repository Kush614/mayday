import type { Request, Response } from "express";
import type { Db } from "./db.js";
import { ownerCode, ownerLabel } from "./owner.js";

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
  owner_code: string;
  created_at: string;
};

export function toDTO(row: ItemRow): ItemDTO {
  return {
    id: row.id,
    name: row.name,
    price: `$${(row.price_cents / 100).toFixed(2)}`,
    owner: ownerLabel(row.user_id),
    owner_code: ownerCode(row.user_id),
    created_at: row.created_at,
  };
}

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

function positiveInteger(value: unknown, fallback?: number): number | undefined {
  if (value === undefined) return fallback;
  if (typeof value !== "string" || !/^\d+$/.test(value)) return undefined;

  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined;
}

export function listItems(db: Db, req: Request, res: Response): void {
  const page = positiveInteger(req.query.page, DEFAULT_PAGE);
  const limit = positiveInteger(req.query.limit, DEFAULT_LIMIT);
  const userId = positiveInteger(req.query.user_id);

  if (page === undefined || limit === undefined || limit > MAX_LIMIT) {
    res.status(400).json({ error: `page and limit must be positive integers; limit cannot exceed ${MAX_LIMIT}` });
    return;
  }
  if (req.query.user_id !== undefined && userId === undefined) {
    res.status(400).json({ error: "user_id must be a positive integer" });
    return;
  }

  const where = userId === undefined ? "" : " WHERE user_id = ?";
  const filterParams = userId === undefined ? [] : [userId];
  const { total } = db.prepare(`SELECT COUNT(*) AS total FROM items${where}`).get(...filterParams) as { total: number };
  const rows = db
    .prepare(`SELECT * FROM items${where} ORDER BY id LIMIT ? OFFSET ?`)
    .all(...filterParams, limit, (page - 1) * limit) as ItemRow[];

  res.json({
    items: rows.map(toDTO),
    pagination: {
      page,
      limit,
      total,
      total_pages: Math.ceil(total / limit),
    },
  });
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
