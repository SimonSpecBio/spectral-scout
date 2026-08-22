"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { INVENTORY_CATALOG, type CatalogEntry, type InventoryCategory } from "@/lib/inventory-catalog";

interface Item {
  id: string;
  category: InventoryCategory;
  name: string;
  scientificName: string | null;
  unit: string;
  quantity: number;
  reorderLevel: number | null;
  reiHours: number | null;
  phiDays: number | null;
  cautions: string | null;
}
interface Order {
  id: string;
  itemId: string;
  quantity: number;
  supplier: string | null;
  expectedAt: string | null;
}

// "chemical" is the underlying InventoryCategory/DB enum value (unchanged,
// no migration) -- "Synthetic" is just the user-facing label for it.
const TABS: { value: InventoryCategory | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "beneficial", label: "Beneficials" },
  { value: "biopesticide", label: "Biopesticides" },
  { value: "chemical", label: "Synthetic" },
];
const CATEGORY_LABEL: Record<InventoryCategory, string> = { beneficial: "Beneficials", biopesticide: "Biopesticides", chemical: "Synthetic" };

function isLow(item: Item) {
  return item.reorderLevel != null && item.quantity <= item.reorderLevel;
}

export default function InventoryClient({ initialItems, initialOrders }: { initialItems: Item[]; initialOrders: Order[] }) {
  const router = useRouter();
  const [items, setItems] = useState(initialItems);
  const [orders, setOrders] = useState(initialOrders);
  const [tab, setTab] = useState<InventoryCategory | "all">("all");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const visible = tab === "all" ? items : items.filter((i) => i.category === tab);
  const groups: [InventoryCategory, Item[]][] =
    tab === "all"
      ? (["beneficial", "biopesticide", "chemical"] as const)
          .map((c) => [c, items.filter((i) => i.category === c)] as [InventoryCategory, Item[]])
          .filter(([, list]) => list.length > 0)
      : [[tab, visible]];

  async function restock(itemId: string, addQuantity: number) {
    setError(null);
    try {
      const res = await fetch(`/api/inventory/${itemId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ addQuantity }),
      });
      if (res.ok) {
        const row = await res.json();
        setItems((prev) => prev.map((i) => (i.id === itemId ? { ...i, quantity: Number(row.quantity) } : i)));
      } else {
        setError("Couldn't update stock. Check your connection and try again.");
      }
    } catch {
      setError("Couldn't update stock. Check your connection and try again.");
    }
  }

  async function receiveOrder(itemId: string, orderId: string) {
    setError(null);
    try {
      const res = await fetch(`/api/inventory/${itemId}/orders/${orderId}/receive`, { method: "POST" });
      if (res.ok) {
        const row = await res.json();
        setItems((prev) => prev.map((i) => (i.id === itemId ? { ...i, quantity: Number(row.quantity) } : i)));
        setOrders((prev) => prev.filter((o) => o.id !== orderId));
      } else {
        setError("Couldn't mark this order received. Check your connection and try again.");
      }
    } catch {
      setError("Couldn't mark this order received. Check your connection and try again.");
    }
  }

  function onItemAdded(item: Item) {
    setItems((prev) => [...prev, item]);
    setAdding(false);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4">
      {error && (
        <div
          className="flex items-center justify-between gap-3 rounded-md p-3.5 text-sm"
          style={{ background: "var(--danger-bg)", color: "var(--danger)" }}
        >
          {error}
          <button type="button" onClick={() => setError(null)} className="shrink-0 text-[var(--text-dim)]">
            Dismiss
          </button>
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t.value}
            onClick={() => setTab(t.value)}
            className={`rounded-full px-3 py-1.5 text-sm ${tab === t.value ? "bg-[var(--accent)] text-[var(--on-accent)]" : "card text-[var(--text-dim)]"}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {groups.length === 0 ? (
        <div className="card p-6 text-sm text-[var(--text-dim)]">No items yet.</div>
      ) : (
        groups.map(([category, list]) => (
          <div key={category} className="flex flex-col gap-2">
            <div className="label-mono">{CATEGORY_LABEL[category]}</div>
            <div className="card flex flex-col divide-y divide-[var(--border)]">
              {list.map((item) => {
                const low = isLow(item);
                const pctOfReorderX3 = item.reorderLevel ? Math.min(100, (item.quantity / (item.reorderLevel * 3)) * 100) : 60;
                const itemOrders = orders.filter((o) => o.itemId === item.id);
                return (
                  <div key={item.id}>
                    <button onClick={() => setExpanded((e) => (e === item.id ? null : item.id))} className="flex w-full flex-col gap-1.5 p-3.5 text-left">
                      <div className="flex items-center justify-between">
                        <span className="text-sm">{item.name}</span>
                        <span className="text-sm" style={{ color: low ? "var(--danger)" : "var(--text)" }}>
                          {item.quantity}
                          {item.unit === "units" ? "" : item.unit}
                        </span>
                      </div>
                      {item.category === "chemical" && (item.reiHours != null || item.phiDays != null) && (
                        <div className="label-mono">
                          {item.reiHours != null && `REI ${item.reiHours}H`}
                          {item.reiHours != null && item.phiDays != null && " · "}
                          {item.phiDays != null && `PHI ${item.phiDays}D`}
                        </div>
                      )}
                      <div className="h-1 w-full overflow-hidden rounded-full" style={{ background: "var(--track-bg)" }}>
                        <div
                          className="h-full rounded-full"
                          style={{ width: `${pctOfReorderX3}%`, background: low ? "var(--danger)" : "var(--text-faint)" }}
                        />
                      </div>
                      {low && <span className="label-mono text-[var(--danger)]">LOW STOCK</span>}
                    </button>
                    {expanded === item.id && (
                      <div className="flex flex-col gap-3 border-t border-[var(--border)] bg-[var(--surface-raised)]/30 p-3.5">
                        {item.cautions && <div className="text-xs text-[var(--text-dim)]">{item.cautions}</div>}
                        {itemOrders.length > 0 && (
                          <div className="flex flex-col gap-1.5">
                            <div className="label-mono">On order</div>
                            {itemOrders.map((o) => (
                              <div key={o.id} className="flex items-center justify-between text-xs">
                                <span className="text-[var(--text-dim)]">
                                  {o.quantity} {item.unit} {o.supplier ? `· ${o.supplier}` : ""} {o.expectedAt ? `· ETA ${o.expectedAt}` : ""}
                                </span>
                                <button onClick={() => receiveOrder(item.id, o.id)} className="text-[var(--accent)]">
                                  Mark received
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                        <RestockRow item={item} onRestock={(qty) => restock(item.id, qty)} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))
      )}

      {adding ? (
        <AddFromCatalog defaultCategory={tab} onAdded={onItemAdded} onCancel={() => setAdding(false)} />
      ) : (
        <button onClick={() => setAdding(true)} className="rounded-md bg-[var(--accent)] px-4 py-3 text-sm font-medium text-[var(--on-accent)]">
          + Add from catalog
        </button>
      )}
    </div>
  );
}

function RestockRow({ item, onRestock }: { item: Item; onRestock: (qty: number) => void }) {
  const [qty, setQty] = useState(1);
  const [orderMode, setOrderMode] = useState(false);
  const [supplier, setSupplier] = useState("");
  const router = useRouter();

  async function placeOrder() {
    await fetch(`/api/inventory/${item.id}/orders`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ quantity: qty, supplier: supplier || null }),
    });
    setOrderMode(false);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <input
          type="number"
          inputMode="numeric"
          min={1}
          value={qty}
          onChange={(e) => setQty(Number(e.target.value))}
          className="w-16 rounded-md border border-[var(--border)] bg-transparent px-2 py-1 text-xs"
        />
        <span className="text-xs text-[var(--text-dim)]">{item.unit}</span>
        <button onClick={() => onRestock(qty)} className="ml-auto rounded-md border border-[var(--border)] px-2.5 py-1 text-xs text-[var(--text-dim)]">
          Restock now
        </button>
        <button onClick={() => setOrderMode((v) => !v)} className="rounded-md border border-[var(--border)] px-2.5 py-1 text-xs text-[var(--text-dim)]">
          Place order
        </button>
      </div>
      {orderMode && (
        <div className="flex items-center gap-2">
          <input
            value={supplier}
            onChange={(e) => setSupplier(e.target.value)}
            placeholder="Supplier (optional)"
            className="flex-1 rounded-md border border-[var(--border)] bg-transparent px-2 py-1 text-xs"
          />
          <button onClick={placeOrder} className="rounded-md bg-[var(--accent)] px-2.5 py-1 text-xs font-medium text-[var(--on-accent)]">
            Save
          </button>
        </div>
      )}
    </div>
  );
}

function AddFromCatalog({
  onAdded,
  onCancel,
  defaultCategory,
}: {
  onAdded: (item: Item) => void;
  onCancel: () => void;
  // Whichever tab the grower was on when they opened this -- a starting
  // point, not a lock: the chips below still let them widen/narrow it.
  // "all" (the default tab) means no filter, same as before this existed.
  defaultCategory: InventoryCategory | "all";
}) {
  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<InventoryCategory | "all">(defaultCategory);
  const [picked, setPicked] = useState<CatalogEntry | null>(null);
  const [custom, setCustom] = useState(false);
  const [name, setName] = useState("");
  const [category, setCategory] = useState<InventoryCategory>("beneficial");
  const [unit, setUnit] = useState("units");
  const [quantity, setQuantity] = useState(1);
  const [reorderLevel, setReorderLevel] = useState<number | "">("");
  const [submitting, setSubmitting] = useState(false);

  const results = query.trim()
    ? INVENTORY_CATALOG.filter(
        (c) => c.name.toLowerCase().includes(query.trim().toLowerCase()) && (categoryFilter === "all" || c.category === categoryFilter)
      ).slice(0, 8)
    : [];

  function pick(entry: CatalogEntry) {
    setPicked(entry);
    setCustom(false);
    setName(entry.name);
    setCategory(entry.category);
    setUnit(entry.unit);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    const res = await fetch("/api/inventory", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        category,
        unit,
        quantity,
        reorderLevel: reorderLevel === "" ? null : reorderLevel,
        reiHours: picked?.reiHours ?? null,
        phiDays: picked?.phiDays ?? null,
        cautions: picked?.cautions ?? null,
      }),
    });
    if (res.ok) {
      const row = await res.json();
      onAdded({ ...row, quantity: Number(row.quantity), reorderLevel: row.reorderLevel == null ? null : Number(row.reorderLevel) });
    } else {
      setSubmitting(false);
    }
  }

  if (!picked && !custom) {
    return (
      <div className="card flex flex-col gap-3 p-4">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">Add from catalog</span>
          <button onClick={onCancel} className="text-xs text-[var(--text-dim)]">
            Cancel
          </button>
        </div>
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search products…"
          className="rounded-md border border-[var(--border)] bg-transparent px-3 py-2 text-sm"
        />
        <div className="flex flex-wrap gap-2">
          {TABS.map((t) => (
            <button
              key={t.value}
              type="button"
              onClick={() => setCategoryFilter(t.value)}
              className={`rounded-full px-3 py-1 text-xs ${
                categoryFilter === t.value ? "bg-[var(--accent)] text-[var(--on-accent)]" : "card text-[var(--text-dim)]"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        {results.length > 0 && (
          <div className="flex flex-col divide-y divide-[var(--border)]">
            {results.map((r) => (
              <button key={r.name} onClick={() => pick(r)} className="flex items-center justify-between py-2 text-left text-sm">
                <span>{r.name}</span>
                <span className="label-mono">{CATEGORY_LABEL[r.category].toUpperCase()}</span>
              </button>
            ))}
          </div>
        )}
        <button onClick={() => setCustom(true)} className="self-start text-xs text-[var(--accent)]">
          Add a custom item instead
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="card flex flex-col gap-3 p-4">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">{picked ? picked.name : "Custom item"}</span>
        <button
          type="button"
          onClick={() => {
            setPicked(null);
            setCustom(false);
          }}
          className="text-xs text-[var(--text-dim)]"
        >
          Back
        </button>
      </div>
      {picked?.restricted && (
        <div className="rounded-md p-2 text-xs" style={{ background: "var(--danger-bg)", color: "var(--danger)" }}>
          Restricted in many cannabis markets -- verify legality before use.
        </div>
      )}
      {custom && (
        <>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Name"
            required
            className="rounded-md border border-[var(--border)] bg-transparent px-3 py-2 text-sm"
          />
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as InventoryCategory)}
            className="rounded-md border border-[var(--border)] bg-transparent px-3 py-2 text-sm"
          >
            <option value="beneficial" style={{ background: "var(--surface)" }}>
              Beneficial
            </option>
            <option value="biopesticide" style={{ background: "var(--surface)" }}>
              Biopesticide
            </option>
            <option value="chemical" style={{ background: "var(--surface)" }}>
              Synthetic
            </option>
          </select>
        </>
      )}
      <div className="flex gap-2">
        <label className="flex flex-1 flex-col gap-1 text-xs text-[var(--text-dim)]">
          Quantity
          <input
            type="number"
            inputMode="numeric"
            min={0}
            value={quantity}
            onChange={(e) => setQuantity(Number(e.target.value))}
            className="rounded-md border border-[var(--border)] bg-transparent px-3 py-2 text-sm text-[var(--text)]"
          />
        </label>
        <label className="flex flex-1 flex-col gap-1 text-xs text-[var(--text-dim)]">
          Unit
          <input
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
            className="rounded-md border border-[var(--border)] bg-transparent px-3 py-2 text-sm text-[var(--text)]"
          />
        </label>
      </div>
      <label className="flex flex-col gap-1 text-xs text-[var(--text-dim)]">
        Reorder below (optional)
        <input
          type="number"
          inputMode="numeric"
          min={0}
          value={reorderLevel}
          onChange={(e) => setReorderLevel(e.target.value === "" ? "" : Number(e.target.value))}
          className="rounded-md border border-[var(--border)] bg-transparent px-3 py-2 text-sm text-[var(--text)]"
        />
      </label>
      <button
        type="submit"
        disabled={submitting || !name.trim()}
        className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-[var(--on-accent)] disabled:opacity-50"
      >
        {submitting ? "Adding…" : "Add to inventory"}
      </button>
    </form>
  );
}
