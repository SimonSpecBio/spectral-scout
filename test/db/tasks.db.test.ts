// @vitest-environment node
import { and, eq } from "drizzle-orm";
import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/db", async () => {
  const { getTestDb } = await import("../helpers/test-db");
  return { db: await getTestDb() };
});

import { getOrgTasks, getTask, maybeScheduleKeepAnEyeRecheck } from "@/lib/tasks";
import { tasks } from "@/db/schema";
import { getTestDb, seedOrgScaffold, type TestDb } from "../helpers/test-db";

let db: TestDb;

beforeAll(async () => {
  db = await getTestDb();
});

const recheckParams = (o: { organizationId: string; facilityId: string; facilityAreaId: string }) => ({
  ...o,
  pestEventId: null,
  pestSpecies: null,
  locationLabel: "Bay 3",
  metricKind: "density" as const,
  value: 5,
  threshold: 20,
  x: null,
  y: null,
});

describe("maybeScheduleKeepAnEyeRecheck", () => {
  it("does nothing for a clean (zero) reading", async () => {
    const { org, facility, area } = await seedOrgScaffold(db);
    const result = await maybeScheduleKeepAnEyeRecheck({
      ...recheckParams({ organizationId: org.id, facilityId: facility.id, facilityAreaId: area.id }),
      value: 0,
    });
    expect(result).toBeNull();
  });

  it("does nothing when the reading is already at or over threshold (alerting owns that case)", async () => {
    const { org, facility, area } = await seedOrgScaffold(db);
    const result = await maybeScheduleKeepAnEyeRecheck({
      ...recheckParams({ organizationId: org.id, facilityId: facility.id, facilityAreaId: area.id }),
      value: 25,
      threshold: 20,
    });
    expect(result).toBeNull();
  });

  it("schedules exactly one keep-an-eye recheck for a sub-threshold positive reading", async () => {
    const { org, facility, area } = await seedOrgScaffold(db);
    const created = await maybeScheduleKeepAnEyeRecheck(
      recheckParams({ organizationId: org.id, facilityId: facility.id, facilityAreaId: area.id })
    );
    expect(created).not.toBeNull();
    expect(created!.type).toBe("monitor");
    expect(created!.source).toBe("auto_trigger");
    expect(created!.status).toBe("open");

    const rows = await db
      .select()
      .from(tasks)
      .where(and(eq(tasks.organizationId, org.id), eq(tasks.facilityAreaId, area.id)));
    expect(rows).toHaveLength(1);
  });

  it("does not stack a second open recheck for the same area", async () => {
    const { org, facility, area } = await seedOrgScaffold(db);
    const params = recheckParams({ organizationId: org.id, facilityId: facility.id, facilityAreaId: area.id });

    const first = await maybeScheduleKeepAnEyeRecheck(params);
    const second = await maybeScheduleKeepAnEyeRecheck(params);

    expect(first).not.toBeNull();
    // A grower scouting the same bay every few days must not accumulate a
    // stack of duplicate "keep an eye on" follow-ups for one ongoing situation.
    expect(second).toBeNull();

    const openAutoTriggers = await db
      .select()
      .from(tasks)
      .where(
        and(
          eq(tasks.organizationId, org.id),
          eq(tasks.facilityAreaId, area.id),
          eq(tasks.status, "open"),
          eq(tasks.source, "auto_trigger"),
          eq(tasks.type, "monitor")
        )
      );
    expect(openAutoTriggers).toHaveLength(1);
  });
});

describe("org-scoped task reads", () => {
  it("getOrgTasks returns only the caller's organization's tasks", async () => {
    const a = await seedOrgScaffold(db);
    const b = await seedOrgScaffold(db);
    await maybeScheduleKeepAnEyeRecheck(
      recheckParams({ organizationId: a.org.id, facilityId: a.facility.id, facilityAreaId: a.area.id })
    );
    await maybeScheduleKeepAnEyeRecheck(
      recheckParams({ organizationId: b.org.id, facilityId: b.facility.id, facilityAreaId: b.area.id })
    );

    const aTasks = await getOrgTasks(a.org.id);
    expect(aTasks).toHaveLength(1);
    expect(aTasks.every((r) => r.task.organizationId === a.org.id)).toBe(true);
  });

  it("getTask refuses to return another organization's task", async () => {
    const a = await seedOrgScaffold(db);
    const b = await seedOrgScaffold(db);
    const bTask = await maybeScheduleKeepAnEyeRecheck(
      recheckParams({ organizationId: b.org.id, facilityId: b.facility.id, facilityAreaId: b.area.id })
    );
    expect(bTask).not.toBeNull();

    // orgA asking for orgB's task id by guessing/leaking it must get nothing.
    expect(await getTask(a.org.id, bTask!.id)).toBeNull();
    // The real owner still reads it.
    expect(await getTask(b.org.id, bTask!.id)).not.toBeNull();
  });
});
