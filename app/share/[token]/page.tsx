import { desc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { users as authUsers } from "@/db/auth-schema";
import { facilities, facilityAreas, observationPhotos, pestEventComments, pestEvents, shareLinks, treatments } from "@/db/schema";
import { SEVERITY_COLOR } from "@/lib/colors";

export const dynamic = "force-dynamic";

// Public, no session required -- deliberately outside /app/* so proxy.ts's
// auth gate never has to carve out an exception for it (db/schema.ts's
// shareLinks comment). A scoped read-only render of just one pest event,
// built as its own simple view rather than threading a "read-only" prop
// through PestEventDetail's much more complex, fully-interactive component
// tree (apply-program buttons, comment posting, photo upload, etc.).
export default async function SharedEventPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const [link] = await db.select().from(shareLinks).where(eq(shareLinks.token, token));
  if (!link || link.revokedAt || link.expiresAt < new Date()) notFound();

  const [event] = await db.select().from(pestEvents).where(eq(pestEvents.id, link.pestEventId));
  if (!event) notFound();

  const [facility] = await db.select().from(facilities).where(eq(facilities.id, event.facilityId));
  const area = event.facilityAreaId
    ? (await db.select().from(facilityAreas).where(eq(facilityAreas.id, event.facilityAreaId)))[0]
    : null;
  const eventTreatments = await db
    .select()
    .from(treatments)
    .where(eq(treatments.pestEventId, event.id))
    .orderBy(desc(treatments.appliedAt));
  const photos = await db.select().from(observationPhotos).where(eq(observationPhotos.pestEventId, event.id));
  const comments = await db
    .select({ id: pestEventComments.id, body: pestEventComments.body, createdAt: pestEventComments.createdAt, authorName: authUsers.name })
    .from(pestEventComments)
    .leftJoin(authUsers, eq(pestEventComments.authorUserId, authUsers.id))
    .where(eq(pestEventComments.pestEventId, event.id))
    .orderBy(pestEventComments.createdAt);

  return (
    <div className="mx-auto flex max-w-md flex-col gap-6 px-6 py-8">
      <div>
        <div className="label-mono text-[var(--text-faint)]">Shared read-only view -- {facility?.name}{area ? ` / ${area.name}` : ""}</div>
        <h1 className="text-2xl font-semibold capitalize">{event.pestSpecies}</h1>
        <div className="mt-1 flex items-center gap-2 text-sm">
          <span className="h-2 w-2 rounded-full" style={{ background: SEVERITY_COLOR[event.severity] }} />
          <span className="capitalize">{event.severity} severity</span>
          <span className="text-[var(--text-dim)]">· {event.status === "resolved" ? "Resolved" : "Active"}</span>
        </div>
        <div className="mt-1 text-xs text-[var(--text-dim)]">
          Reported {event.createdAt.toLocaleDateString()}
          {event.resolvedAt ? ` · Resolved ${event.resolvedAt.toLocaleDateString()}` : ""}
        </div>
      </div>

      {photos.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {photos.map((p) => (
            <img key={p.id} src={p.blobUrl} alt={p.caption ?? event.pestSpecies} className="aspect-square rounded-md object-cover" />
          ))}
        </div>
      )}

      <div className="flex flex-col gap-2">
        <div className="label-mono">Treatments</div>
        {eventTreatments.length === 0 ? (
          <div className="card p-4 text-sm text-[var(--text-dim)]">None logged yet.</div>
        ) : (
          <div className="card flex flex-col divide-y divide-[var(--border)]">
            {eventTreatments.map((t) => (
              <div key={t.id} className="flex flex-col gap-0.5 p-3.5 text-sm">
                <div>{t.product ?? t.type}</div>
                <div className="label-mono">{t.appliedAt.toLocaleDateString()}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <div className="label-mono">Comments</div>
        {comments.length === 0 ? (
          <div className="card p-4 text-sm text-[var(--text-dim)]">No comments yet.</div>
        ) : (
          <div className="card flex flex-col divide-y divide-[var(--border)]">
            {comments.map((c) => (
              <div key={c.id} className="flex flex-col gap-1 p-3.5 text-sm">
                <div className="flex items-center justify-between">
                  <span className="font-medium">{c.authorName ?? "Someone"}</span>
                  <span className="label-mono">{c.createdAt.toLocaleDateString()}</span>
                </div>
                <div className="text-[var(--text-dim)]">{c.body}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="text-center text-xs text-[var(--text-faint)]">
        Shared via Spectral Scout -- this link expires {link.expiresAt.toLocaleDateString()}.
      </div>
    </div>
  );
}
