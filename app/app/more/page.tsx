import Link from "next/link";

const COMING_SOON = ["Monitoring protocols", "Treatments library", "Reports / export", "Analytics", "Settings", "Account / team"];

export default function MorePage() {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">More</h1>

      <Link href="/app/facilities" className="card card-interactive flex items-center justify-between p-4">
        <span>Sites</span>
        <span className="text-[var(--text-dim)]">→</span>
      </Link>

      <div className="flex flex-col gap-2">
        <h2 className="text-sm font-medium text-[var(--text-dim)]">Coming soon</h2>
        {COMING_SOON.map((item) => (
          <div key={item} className="card flex items-center justify-between p-4 text-[var(--text-dim)]">
            <span>{item}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
