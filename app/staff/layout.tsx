import { redirect } from "next/navigation";
import { requireStaffSession } from "@/lib/session";

export default async function StaffLayout({ children }: { children: React.ReactNode }) {
  const session = await requireStaffSession();
  if (!session) redirect("/");

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <header className="mb-8 font-semibold">Spectral Scout — Staff</header>
      {children}
    </div>
  );
}
