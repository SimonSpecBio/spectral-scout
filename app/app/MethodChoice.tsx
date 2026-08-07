import Link from "next/link";

// The "Plant sampling | Counts" segmented choice the mockups show atop
// sampling forms (05/08) -- Traps is deliberately not a third option here:
// it's reached from the Traps screen's own "Log readings" button instead
// (see QuickActionsMenu's comment on why trap reading isn't a create-sheet
// item either).
export default function MethodChoice({ baseHref }: { baseHref: string }) {
  const join = baseHref.includes("?") ? "&" : "?";
  return (
    <div className="mx-auto flex max-w-md flex-col gap-4">
      <h1 className="text-2xl font-semibold">Method</h1>
      <Link href={`${baseHref}${join}method=plant_sampling`} className="card card-interactive flex flex-col gap-1 p-4">
        <span className="text-sm font-medium">Plant sampling</span>
        <span className="text-xs text-[var(--text-dim)]">10 plants x top/mid/bottom leaf, severity tap matrix</span>
      </Link>
      <Link href={`${baseHref}${join}method=counts`} className="card card-interactive flex flex-col gap-1 p-4">
        <span className="text-sm font-medium">Counts</span>
        <span className="text-xs text-[var(--text-dim)]">Quick tally -- pests on 5 leaves</span>
      </Link>
    </div>
  );
}
