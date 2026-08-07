export type StockStatus = "in_stock" | "low" | "out" | "unknown";

// Cross-checks a recommended agent/product name against the org's actual
// inventory (name match, case-insensitive) -- TREATMENTS.md: "Cross-check
// against Inventory: if the agent is low/out, raise a restock notification
// and suggest the on-order ETA." The restock notification itself already
// exists (lib/notifications.ts's lowstock kind reads the same
// reorderLevel comparison); this just tells the recommendation card
// whether to show "in stock" / "low" / "not in your inventory" next to
// each option.
export function matchInventoryStock(
  name: string,
  items: { name: string; quantity: number; reorderLevel: number | null }[]
): StockStatus {
  const item = items.find((i) => i.name.toLowerCase() === name.toLowerCase());
  if (!item) return "unknown";
  if (item.quantity <= 0) return "out";
  if (item.reorderLevel != null && item.quantity <= item.reorderLevel) return "low";
  return "in_stock";
}
