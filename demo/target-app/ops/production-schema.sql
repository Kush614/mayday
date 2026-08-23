-- Applied to production by the platform team during the guest-cart rollout.
-- Not part of the app's migration set; kept here so the traffic simulator can
-- reproduce production's schema locally.
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
