/** Shown while a page renders on the server (e.g. a slow NAS), instead of a frozen screen. */
export default function Loading() {
  return (
    <div aria-busy="true" aria-live="polite" className="space-y-4">
      <div className="skeleton h-8 w-48" />
      <div className="skeleton h-36 w-full !rounded-card" />
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="skeleton h-48 !rounded-card" />
        <div className="skeleton h-48 !rounded-card" />
      </div>
    </div>
  );
}
