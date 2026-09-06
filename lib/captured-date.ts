const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// lib/offline-queue.ts stamps every capture with the device's own local
// calendar day at the moment it was captured, not whenever the request
// happens to land server-side (ticket recd05VrZFhxePhoi) -- routes whose
// "date" column feeds day-granularity trend/threshold math read it here
// instead of defaulting to server time. Falls back to today (server UTC,
// the pre-existing behavior) for any caller that doesn't send one -- a
// direct API call, or a form not wired through queuedFetch.
export function capturedDateOrToday(body: { capturedDate?: unknown }): string {
  if (typeof body.capturedDate === "string" && DATE_RE.test(body.capturedDate)) return body.capturedDate;
  return new Date().toISOString().slice(0, 10);
}

// Same idea for a full timestamp column (trap readings' createdAt) rather
// than a plain date -- validated by actually parsing it rather than a
// regex, since a malformed string would otherwise become an Invalid Date
// silently written to the column.
export function capturedAtOrNow(body: { capturedAt?: unknown }): Date {
  if (typeof body.capturedAt === "string") {
    const d = new Date(body.capturedAt);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return new Date();
}
