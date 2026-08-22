import { requireGrowerSession } from "@/lib/session";
import SearchClient from "./SearchClient";

export default async function SearchPage() {
  const session = await requireGrowerSession();
  if (!session) return null;

  return (
    <div className="mx-auto flex max-w-md flex-col gap-6">
      <h1 className="text-2xl font-semibold">Search</h1>
      <SearchClient />
    </div>
  );
}
