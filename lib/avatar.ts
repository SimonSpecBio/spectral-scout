// Pure, no server imports -- shared by server components (lib/team.ts's
// callers) and client components (TeamClient.tsx) alike. Keeping this out
// of lib/team.ts specifically avoids pulling `db` (and therefore `pg`,
// which breaks in the browser bundle) into any client component that just
// wants the initials helper.
export function initialsFor(name: string | null, email: string): string {
  if (name && name.trim()) {
    const parts = name.trim().split(/\s+/);
    return (parts[0][0] + (parts[1]?.[0] ?? "")).toUpperCase();
  }
  return email.slice(0, 2).toUpperCase();
}
