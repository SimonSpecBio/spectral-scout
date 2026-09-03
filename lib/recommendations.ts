import { findAgent, findPestProgram } from "@/lib/treatments-catalog";

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

// A budget-conscious grower deciding before buying, not after (theorizing
// pass #3) -- only ever the grower's own real inventory cost, never a
// fabricated catalog-wide default: prices vary too much by supplier/region/
// bulk discount to responsibly invent one, and inventoryItems.unitCost is
// already real, sourced data once a grower sets it (see the inventory cost
// ticket). No data = no estimate shown, not a guessed number.
export function costPerUnit(
  name: string,
  items: { name: string; unit: string; unitCost: number | null }[]
): { unitCost: number; unit: string } | null {
  const item = items.find((i) => i.name.toLowerCase() === name.toLowerCase());
  if (!item || item.unitCost == null) return null;
  return { unitCost: item.unitCost, unit: item.unit };
}

export interface FollowUpSuggestion {
  id: string;
  label: string;
  sub: string;
  task: {
    title: string;
    type: "release" | "scout" | "other";
    dueInDays: number;
    repeatEveryDays: number | null;
  };
}

// "After an event auto-resolves, don't just go quiet" -- 1-3 preventive
// follow-ups relevant to the species and area, never auto-created (see
// PestEventDetail's Accept button, the only thing that actually creates a
// task from these). Area-scoped, not tied back to the now-closed event
// (pestEventId stays null on the created tasks) -- these are about
// keeping the area clean going forward, not the resolved incident itself.
export function computeFollowUpSuggestions(params: {
  pestSpecies: string;
  locationLabel: string;
  usedInventoryItems: { id: string; name: string; quantity: number; reorderLevel: number | null }[];
}): FollowUpSuggestion[] {
  const suggestions: FollowUpSuggestion[] = [];
  const program = findPestProgram(params.pestSpecies);

  const agentId = program?.primaryBiocontrol[0];
  const agent = agentId ? findAgent(agentId) : undefined;
  if (agent) {
    suggestions.push({
      id: "release",
      label: `Preventive ${agent.name} release`,
      sub: `Recurring every ${agent.reintroDays} days`,
      task: {
        title: `Preventive release: ${agent.name}, ${params.locationLabel}`,
        type: "release",
        dueInDays: agent.reintroDays,
        repeatEveryDays: agent.reintroDays,
      },
    });
  }

  suggestions.push({
    id: "scout",
    label: "Weekly scouting cadence",
    sub: `Keep an eye on ${params.locationLabel} going forward`,
    task: {
      title: `Scout: ${params.locationLabel}`,
      type: "scout",
      dueInDays: 7,
      repeatEveryDays: 7,
    },
  });

  for (const item of params.usedInventoryItems) {
    if (item.reorderLevel == null || item.quantity > item.reorderLevel) continue;
    suggestions.push({
      id: `restock-${item.id}`,
      label: `Restock ${item.name}`,
      sub: `${item.quantity} left, at or below reorder level`,
      task: {
        title: `Restock ${item.name}`,
        type: "other",
        dueInDays: 3,
        repeatEveryDays: null,
      },
    });
  }

  return suggestions.slice(0, 3);
}
