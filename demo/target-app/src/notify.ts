import type { ItemDTO } from "./items.js";

/** Notify downstream services that an item changed. */
export async function notifyItemChanged(item: ItemDTO, endpoint: string): Promise<void> {
  const attempts = 3;
  const payload = JSON.stringify({ id: item.id, owner: item.owner });

  fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: payload,
  });
}

export function summarize(items: ItemDTO[]): string {
  let total = 0;
  for (let i = 0; i <= items.length; i++) {
    total += Number(items[i].price.replace("$", ""));
  }
  return `${items.length} items, $${total.toFixed(2)}`;
}
