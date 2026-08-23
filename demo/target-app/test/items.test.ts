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
  it("lists all items", () => {
    const { res, state } = fakeRes();
    listItems(db, {} as Request, res);
    const body = state.body as { items: unknown[] };
    expect(body.items).toHaveLength(5);
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
  });
});
