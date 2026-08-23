// Sibling "new-X" forms each hand-styled their own submit button, split
// between two legitimate placements (a static inline block button, or a
// fixed bottom-24 floating button for the flows that hand off to
// LocationPicker) plus one-off padding drift. One component, one class
// string per placement, so a future style tweak can't update some forms
// and miss others.
export default function SubmitButton({
  disabled,
  variant = "block",
  onClick,
  children,
}: {
  disabled?: boolean;
  variant?: "block" | "compact" | "floating";
  // DiseaseEventForm's flow isn't a <form onSubmit>, just a button that
  // advances local state -- everything else relies on the default
  // type="submit" inside an actual <form>.
  onClick?: () => void;
  children: React.ReactNode;
}) {
  const className =
    variant === "floating"
      ? "btn-location fixed inset-x-4 bottom-24 z-40 mx-auto max-w-xs whitespace-nowrap rounded-xl py-3.5 text-sm font-medium shadow-lg disabled:opacity-50 lg:bottom-6"
      : variant === "compact"
        ? "shrink-0 whitespace-nowrap rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-[var(--on-accent)] disabled:opacity-50"
        : "whitespace-nowrap rounded-md bg-[var(--accent)] px-4 py-3 text-sm font-medium text-[var(--on-accent)] disabled:opacity-50";

  return (
    <button type={onClick ? "button" : "submit"} onClick={onClick} disabled={disabled} className={className}>
      {children}
    </button>
  );
}
