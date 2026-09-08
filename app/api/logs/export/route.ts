import { NextRequest, NextResponse } from "next/server";
import { getOrgLogEntries, type LogKind } from "@/lib/logs";
import { requireGrowerSession } from "@/lib/session";

const KINDS: LogKind[] = ["event", "treatment", "monitoring"];

function csvField(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

// Reuses lib/logs.ts's merged entries directly rather than a second data
// source -- CSV of whatever's currently filtered on the Logs page (type +
// optional date range), for the compliance/record-keeping use that page's
// own copy already promises but didn't actually support.
export async function GET(request: NextRequest) {
  const session = await requireGrowerSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type") ?? "all";
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  const entries = await getOrgLogEntries(session.organizationId!);
  let filtered = type === "all" ? entries : entries.filter((e) => KINDS.includes(type as LogKind) && e.kind === type);
  if (from) {
    const fromDate = new Date(from + "T00:00:00");
    filtered = filtered.filter((e) => e.at >= fromDate);
  }
  if (to) {
    const toDate = new Date(to + "T23:59:59.999");
    filtered = filtered.filter((e) => e.at <= toDate);
  }

  // Dose/Stock Discrepancy (Phase 1.5, build-cycle doc, 2026-09-07): only
  // ever populated on treatment rows, blank for event/monitoring rows --
  // "include, carry the flag" was the doc's own decision on a stock-
  // discrepancy-flagged treatment rather than excluding or rejecting it
  // (Engineering Principle 5: the spray physically happened).
  // Who (Phase 4, build-cycle doc, 2026-09-07): "for a surface whose stated
  // job is crew oversight, that is the missing dimension" -- blank when not
  // tracked (see lib/logs.ts's `who` field comment for the specific cases).
  const header = ["Date", "Time", "Type", "Label", "Detail", "Who", "Dose", "Stock Discrepancy"];
  const rows = filtered.map((e) => [
    e.at.toISOString().slice(0, 10),
    e.at.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", hour12: false }),
    e.kind,
    e.label,
    e.sub,
    e.who ?? "",
    e.doseDetail ?? "",
    e.stockWentNegative ? "yes" : "",
  ]);
  const csv = [header, ...rows].map((row) => row.map(csvField).join(",")).join("\r\n") + "\r\n";

  const filename = `spectral-scout-logs${type !== "all" ? `-${type}` : ""}${from ? `-from-${from}` : ""}${to ? `-to-${to}` : ""}.csv`;
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
