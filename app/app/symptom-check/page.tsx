import { redirect } from "next/navigation";
import { isHomeGrower } from "@/lib/grower-type";
import { requireGrowerSession } from "@/lib/session";
import SymptomCheckPageClient from "./SymptomCheckPageClient";

// Home-grower-only pre-ID severity triage popup (lib/symptom-tree.ts) --
// guided taps, not AI/photo-ML. Commercial accounts already have the
// Recommended-protocols panel and don't need a "should I worry?" gate in
// front of logging a real event, so this route simply doesn't exist for
// them.
export default async function SymptomCheckPage() {
  const session = await requireGrowerSession();
  if (!session) return null;
  if (!isHomeGrower(session.growerType)) redirect("/app");

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-6">
      <h1 className="text-2xl font-semibold">Should I worry?</h1>
      <SymptomCheckPageClient />
    </div>
  );
}
