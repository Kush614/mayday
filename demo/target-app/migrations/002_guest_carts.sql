-- Guest carts: anonymous shoppers create items before signing in, so an item
-- can exist without an owner until the cart is claimed at checkout.
-- SQLite cannot drop NOT NULL in place; rebuild the table.

CREATE TABLE items_new (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT    NOT NULL,
  price_cents INTEGER NOT NULL DEFAULT 0,
  user_id     INTEGER NULL,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO items_new (id, name, price_cents, user_id, created_at)
  SELECT id, name, price_cents, user_id, created_at FROM items;

DROP TABLE items;
ALTER TABLE items_new RENAME TO items;

CREATE INDEX IF NOT EXISTS idx_items_user ON items(user_id);
