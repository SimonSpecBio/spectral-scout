// Sibling "new-X" forms each reinvented label placement -- placeholder-as-
// label, a label wrapping a right-aligned input, or a separate label-mono
// span above a full-width input -- and marked required fields
// inconsistently. One component, three layouts matching the three
// legitimate shapes those forms actually need (stack for a full-width
// field, row for a compact right-aligned value like a stepper input,
// compact for a field that's deliberately unlabeled visually, e.g. a
// placeholder-only quick-add bar) so every field still gets a real label
// and consistent required marking, without forcing unrelated layouts to
// look alike.
export default function FormField({
  label,
  required,
  layout = "stack",
  children,
}: {
  label: string;
  required?: boolean;
  layout?: "stack" | "row" | "compact";
  children: React.ReactNode;
}) {
  const marker = required ? <span style={{ color: "var(--danger)" }}> *</span> : null;

  if (layout === "compact") {
    return (
      <label className="contents">
        <span className="sr-only">{label}</span>
        {children}
      </label>
    );
  }

  if (layout === "row") {
    return (
      <label className="flex items-center justify-between text-sm text-[var(--text-dim)]">
        <span>
          {label}
          {marker}
        </span>
        {children}
      </label>
    );
  }

  return (
    <label className="flex flex-col gap-1.5">
      <span className="label-mono">
        {label}
        {marker}
      </span>
      {children}
    </label>
  );
}
