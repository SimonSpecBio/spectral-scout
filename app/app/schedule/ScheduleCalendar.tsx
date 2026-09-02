"use client";

import Link from "next/link";
import { useState } from "react";
import { initialsFor } from "@/lib/avatar";
import { URGENCY_COLOR, type TaskUrgency } from "@/lib/colors";

export interface ScheduleTaskRow {
  id: string;
  title: string;
  type: string;
  dueAt: string; // ISO -- Dates aren't a valid RSC prop, serialized by the server page
  assigneeUserId: string | null;
  areaName: string | null;
  facilityName: string | null;
  pestSpecies: string | null;
  urgency: TaskUrgency;
  href: string;
}

const WEEKDAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];
// Most-urgent-first -- a day showing both an overdue and a scheduled task
// should read as overdue, not an average of the two.
const URGENCY_RANK: TaskUrgency[] = ["overdue", "due_soon", "scheduled", "snoozed", "done"];

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function dayLabel(date: Date): string {
  const now = new Date();
  if (sameDay(date, now)) return "Today";
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (sameDay(date, tomorrow)) return "Tomorrow";
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (sameDay(date, yesterday)) return "Yesterday";
  return date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

// Real month-grid replacing the old day-grouped list (Airtable ticket C4)
// -- the list itself wasn't the problem, so tapping a day reuses that exact
// row style for the day-detail view below the grid instead of rewriting it.
export default function ScheduleCalendar({
  rows,
  members,
  currentUserId,
}: {
  rows: ScheduleTaskRow[];
  members: { userId: string; name: string | null; email: string }[];
  currentUserId: string;
}) {
  const [who, setWho] = useState<"everyone" | "me" | "overdue">("everyone");
  const today = new Date();
  const [visibleMonth, setVisibleMonth] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [selectedDate, setSelectedDate] = useState(() => new Date(today.getFullYear(), today.getMonth(), today.getDate()));

  const memberById = new Map(members.map((m) => [m.userId, m]));

  const filtered = rows.filter((r) => {
    if (who === "me") return r.assigneeUserId === currentUserId;
    if (who === "overdue") return r.urgency === "overdue";
    return true;
  });

  const tasksByDay = new Map<string, ScheduleTaskRow[]>();
  for (const r of filtered) {
    const d = new Date(r.dueAt);
    const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    tasksByDay.set(key, [...(tasksByDay.get(key) ?? []), r]);
  }
  const keyFor = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

  // Leading/trailing days from adjacent months fill the grid to a whole
  // number of weeks (4-6 rows depending on the month), grayed out below.
  const firstOfMonth = visibleMonth;
  const firstWeekday = firstOfMonth.getDay();
  const daysInMonth = new Date(firstOfMonth.getFullYear(), firstOfMonth.getMonth() + 1, 0).getDate();
  const gridStart = new Date(firstOfMonth);
  gridStart.setDate(gridStart.getDate() - firstWeekday);
  const totalCells = Math.ceil((firstWeekday + daysInMonth) / 7) * 7;
  const cells: Date[] = Array.from({ length: totalCells }, (_, i) => {
    const d = new Date(gridStart);
    d.setDate(d.getDate() + i);
    return d;
  });

  function worstUrgency(dayRows: ScheduleTaskRow[]): TaskUrgency {
    return URGENCY_RANK.find((u) => dayRows.some((r) => r.urgency === u)) ?? "scheduled";
  }

  function changeMonth(delta: number) {
    setVisibleMonth((m) => new Date(m.getFullYear(), m.getMonth() + delta, 1));
  }

  const selectedDayRows = (tasksByDay.get(keyFor(selectedDate)) ?? []).sort(
    (a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime()
  );

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Schedule</h1>
        <Link href="/app/schedule/new" className="text-sm text-[var(--accent)]">
          + Assign
        </Link>
      </div>

      <div className="flex gap-2">
        {(["everyone", "me", "overdue"] as const).map((w) => (
          <button
            key={w}
            type="button"
            onClick={() => setWho(w)}
            className={`rounded-full px-3 py-1.5 text-sm capitalize ${
              who === w ? "bg-[var(--accent)] text-[var(--on-accent)]" : "card text-[var(--text-dim)]"
            }`}
          >
            {w}
          </button>
        ))}
      </div>

      <div className="card flex flex-col gap-3 p-3.5">
        <div className="flex items-center justify-between">
          <button type="button" onClick={() => changeMonth(-1)} className="px-2 text-sm text-[var(--text-dim)]">
            ←
          </button>
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">{visibleMonth.toLocaleDateString(undefined, { month: "long", year: "numeric" })}</span>
            <button
              type="button"
              onClick={() => {
                setVisibleMonth(new Date(today.getFullYear(), today.getMonth(), 1));
                setSelectedDate(new Date(today.getFullYear(), today.getMonth(), today.getDate()));
              }}
              className="label-mono rounded-md border border-[var(--border)] px-2 py-0.5 text-[var(--text-dim)]"
            >
              Today
            </button>
          </div>
          <button type="button" onClick={() => changeMonth(1)} className="px-2 text-sm text-[var(--text-dim)]">
            →
          </button>
        </div>

        <div className="grid grid-cols-7 gap-1">
          {WEEKDAY_LABELS.map((l, i) => (
            <div key={i} className="label-mono py-1 text-center text-[var(--text-faint)]">
              {l}
            </div>
          ))}
          {cells.map((d, i) => {
            const dayRows = tasksByDay.get(keyFor(d)) ?? [];
            const inMonth = d.getMonth() === visibleMonth.getMonth();
            const isSelected = sameDay(d, selectedDate);
            const isToday = sameDay(d, today);
            return (
              <button
                key={i}
                type="button"
                onClick={() => setSelectedDate(d)}
                className="flex flex-col items-center gap-1 rounded-md py-1.5 text-xs"
                style={{
                  background: isSelected ? "var(--accent)" : "transparent",
                  color: isSelected ? "var(--on-accent)" : inMonth ? "var(--text)" : "var(--text-faint)",
                  border: isToday && !isSelected ? "1px solid var(--accent)" : "1px solid transparent",
                }}
              >
                <span>{d.getDate()}</span>
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ background: dayRows.length > 0 ? (isSelected ? "var(--on-accent)" : URGENCY_COLOR[worstUrgency(dayRows)]) : "transparent" }}
                />
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <div className="label-mono">{dayLabel(selectedDate).toUpperCase()}</div>
        {selectedDayRows.length === 0 ? (
          <div className="card p-6 text-sm text-[var(--text-dim)]">Nothing on the schedule.</div>
        ) : (
          <div className="flex flex-col gap-2">
            {selectedDayRows.map((task) => {
              const assignee = task.assigneeUserId ? memberById.get(task.assigneeUserId) : null;
              return (
                <Link
                  key={task.id}
                  href={task.href}
                  className="card flex items-center gap-3 p-3.5"
                  style={{ borderLeft: `3px solid ${URGENCY_COLOR[task.urgency]}` }}
                >
                  <div className="flex-1">
                    <div className="text-sm">{task.title}</div>
                    <div className="label-mono">
                      {[task.pestSpecies, task.areaName ?? task.facilityName].filter(Boolean).join(" · ").toUpperCase() || task.type.toUpperCase()}
                      {task.urgency === "overdue" && " · OVERDUE"}
                    </div>
                  </div>
                  {assignee && (
                    <span
                      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px]"
                      style={{ background: "var(--chip-bg)", color: "var(--text-dim)" }}
                    >
                      {initialsFor(assignee.name, assignee.email)}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
