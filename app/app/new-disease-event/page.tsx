import Link from "next/link";
import { buildPickerFacilities } from "@/lib/location-picker-data";
import { requireGrowerSession } from "@/lib/session";
import DiseaseEventForm from "./DiseaseEventForm";

export default async function NewDiseaseEventPage() {
  const session = await requireGrowerSession();
  if (!session) return null;

  const pickerFacilities = await buildPickerFacilities(session.organizationId!);

  if (pickerFacilities.length === 0) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="text-2xl font-semibold">New disease event</h1>
        <div className="card p-6 text-[var(--text-dim)]">
          No sites yet.{" "}
          <Link href="/app/facilities" className="text-[var(--accent)]">
            Add your first site
          </Link>{" "}
          first.
        </div>
      </div>
    );
  }

  return <DiseaseEventForm facilities={pickerFacilities} />;
}
