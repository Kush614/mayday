import { describe, it, expect, beforeEach } from "vitest";
import { openDb } from "../src/db.js";
import { seedOwnedItems } from "../src/seed.js";
import { listItems, getItem, createItem, toDTO } from "../src/items.js";
import type { Request, Response } from "express";

function fakeRes() {
  const state: { status: number; body: unknown } = { status: 200, body: undefined };
  const res = {
    status(code: number) {
      state.status = code;
      return res;
    },
    json(body: unknown) {
      state.body = body;
      return res;
    },
    end() {
      return res;
    },
  } as unknown as Response;
  return { res, state };
}

let db: ReturnType<typeof openDb>;

beforeEach(() => {
  db = openDb(":memory:");
  seedOwnedItems(db);
});

describe("items api", () => {
  it("lists items across all users when user_id is omitted", () => {
    const { res, state } = fakeRes();
    listItems(db, { query: {} } as unknown as Request, res);
    const body = state.body as { items: { owner: string }[]; pagination: { total: number } };
    expect(body.items).toHaveLength(5);
    expect(new Set(body.items.map((i) => i.owner))).toEqual(new Set(["user-1", "user-2", "user-3"]));
    expect(body.pagination.total).toBe(5);
  });

  it("filters items by user_id when supplied", () => {
    const { res, state } = fakeRes();
    listItems(db, { query: { user_id: "2" } } as unknown as Request, res);
    const body = state.body as { items: { owner: string }[]; pagination: { total: number } };
    expect(body.items).toHaveLength(2);
    expect(body.items.every((i) => i.owner === "user-2")).toBe(true);
    expect(body.pagination.total).toBe(2);
  });

  it("paginates items", () => {
    const { res, state } = fakeRes();
    listItems(db, { query: { page: "2", limit: "2" } } as unknown as Request, res);
    const body = state.body as {
      items: { id: number }[];
      pagination: { page: number; limit: number; total: number; total_pages: number };
    };
    expect(body.items.map((i) => i.id)).toEqual([3, 4]);
    expect(body.pagination).toEqual({ page: 2, limit: 2, total: 5, total_pages: 3 });
  });

  it("applies pagination to a user_id filter", () => {
    const { res, state } = fakeRes();
    listItems(db, { query: { user_id: "2", page: "2", limit: "1" } } as unknown as Request, res);
    const body = state.body as { items: { id: number }[]; pagination: { total: number; total_pages: number } };
    expect(body.items.map((i) => i.id)).toEqual([4]);
    expect(body.pagination.total).toBe(2);
    expect(body.pagination.total_pages).toBe(2);
  });

  it("rejects invalid pagination", () => {
    const { res, state } = fakeRes();
    listItems(db, { query: { page: "0" } } as unknown as Request, res);
    expect(state.status).toBe(400);
  });

  it("gets one item", () => {
    const { res, state } = fakeRes();
    getItem(db, { params: { id: "1" } } as unknown as Request, res);
    expect((state.body as { name: string }).name).toBe("Blue mug");
  });

  it("creates an item for a signed-in user", () => {
    const { res, state } = fakeRes();
    createItem(db, { body: { name: "Stapler", price_cents: 999, user_id: 4 } } as Request, res);
    expect(state.status).toBe(201);
    expect((state.body as { owner: string }).owner).toBe("user-4");
  });

  it("formats price and owner", () => {
    const dto = toDTO({ id: 1, name: "x", price_cents: 1250, user_id: 7, created_at: "now" });
    expect(dto.price).toBe("$12.50");
    expect(dto.owner).toBe("user-7");
    expect(dto.owner_code).toBe("U-000007");
  });
});
