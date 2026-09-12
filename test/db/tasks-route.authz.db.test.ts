// @vitest-environment node
import type { NextRequest } from "next/server";
import { and, eq } from "drizzle-orm";
import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/db", async () => {
  const { getTestDb } = await import("../helpers/test-db");
  return { db: await getTestDb() };
});
// Replace the whole session module so next-auth / next/headers never load,
// and the route's authorization decision is driven purely by what the
// session says -- which is exactly what these tests vary.
vi.mock("@/lib/session", () => ({ requireGrowerSession: vi.fn() }));
// notifyTaskAssigned reaches web-push and the subscriptions table; the happy
// path only needs it not to throw.
vi.mock("@/lib/push", () => ({ notifyTaskAssigned: vi.fn().mockResolvedValue(undefined) }));

import { GET, POST } from "@/app/api/tasks/route";
import { memberships, tasks } from "@/db/schema";
import { requireGrowerSession } from "@/lib/session";
import { getTestDb, seedOrgScaffold, type TestDb } from "../helpers/test-db";

let db: TestDb;
const mockedSession = vi.mocked(requireGrowerSession);

beforeAll(async () => {
  db = await getTestDb();
});

const asRequest = (body: unknown) => ({ json: async () => body }) as unknown as NextRequest;

// Minimal grower session shaped like the fields the route reads.
const growerSession = (organizationId: string, opts: { role?: "owner" | "member"; userId?: string } = {}) =>
  ({
    role: "grower",
    organizationId,
    membershipRole: opts.role ?? "owner",
    user: { id: opts.userId ?? crypto.randomUUID() },
  }) as never;

describe("POST/GET /api/tasks authorization", () => {
  it("rejects an unauthenticated GET with 401", async () => {
    mockedSession.mockResolvedValueOnce(null as never);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("rejects an unauthenticated POST with 401", async () => {
    mockedSession.mockResolvedValueOnce(null as never);
    const res = await POST(asRequest({ title: "x", dueAt: new Date().toISOString() }));
    expect(res.status).toBe(401);
  });

  it("rejects a missing title/dueAt with 400", async () => {
    const { org } = await seedOrgScaffold(db);
    mockedSession.mockResolvedValueOnce(growerSession(org.id));
    const res = await POST(asRequest({ title: "   " }));
    expect(res.status).toBe(400);
  });

  it("returns 404 for a facility owned by another organization", async () => {
    const a = await seedOrgScaffold(db);
    const b = await seedOrgScaffold(db);
    mockedSession.mockResolvedValueOnce(growerSession(a.org.id));

    const res = await POST(
      asRequest({ title: "Cross-org task", dueAt: new Date().toISOString(), facilityId: b.facility.id })
    );
    expect(res.status).toBe(404);
    // Nothing was written for the attacker's org.
    const rows = await db.select().from(tasks).where(eq(tasks.organizationId, a.org.id));
    expect(rows).toHaveLength(0);
  });

  it("forbids a non-owner from assigning a task to someone else (403)", async () => {
    const { org } = await seedOrgScaffold(db);
    mockedSession.mockResolvedValueOnce(growerSession(org.id, { role: "member" }));
    const res = await POST(
      asRequest({ title: "Assign attempt", dueAt: new Date().toISOString(), assigneeUserId: crypto.randomUUID() })
    );
    expect(res.status).toBe(403);
  });

  it("rejects assigning to a user who is not a member of the org (400)", async () => {
    const { org } = await seedOrgScaffold(db);
    mockedSession.mockResolvedValueOnce(growerSession(org.id, { role: "owner" }));
    const res = await POST(
      asRequest({ title: "Assign non-member", dueAt: new Date().toISOString(), assigneeUserId: crypto.randomUUID() })
    );
    expect(res.status).toBe(400);
  });

  it("creates a manual, org-scoped task on the happy path", async () => {
    const { org } = await seedOrgScaffold(db);
    const ownerUserId = crypto.randomUUID();
    // A real membership so an owner can assign the task to themselves.
    await db.insert(memberships).values({ userId: ownerUserId, organizationId: org.id, role: "owner" });
    mockedSession.mockResolvedValueOnce(growerSession(org.id, { role: "owner", userId: ownerUserId }));

    const res = await POST(
      asRequest({ title: "Real task", dueAt: new Date().toISOString(), assigneeUserId: ownerUserId })
    );
    expect(res.status).toBe(200);
    const created = await res.json();
    expect(created.organizationId).toBe(org.id);
    expect(created.source).toBe("manual");
    expect(created.assigneeUserId).toBe(ownerUserId);

    const [persisted] = await db
      .select()
      .from(tasks)
      .where(and(eq(tasks.organizationId, org.id), eq(tasks.title, "Real task")));
    expect(persisted).toBeTruthy();
    expect(persisted.createdByUserId).toBe(ownerUserId);
  });
});
