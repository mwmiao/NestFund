'use client';

/** A labelled on/off switch that saves its form as soon as it changes (the form's server action does the saving). */
export function ToggleRow({ name, defaultChecked, label, hint }: { name: string; defaultChecked: boolean; label: string; hint: string }) {
  return (
    <label className="flex min-h-14 cursor-pointer items-start gap-4 py-3">
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium">{label}</span>
        <span className="muted mt-0.5 block text-xs">{hint}</span>
      </span>
      <span className="relative mt-0.5 inline-flex h-7 w-12 shrink-0 items-center">
        <input type="checkbox" name={name} defaultChecked={defaultChecked} role="switch" className="peer sr-only" onChange={(e) => e.currentTarget.form?.requestSubmit()} />
        <span className="absolute inset-0 rounded-full bg-raised ring-1 ring-inset ring-line transition peer-checked:bg-brand-600 peer-focus-visible:ring-2 peer-focus-visible:ring-brand-500" />
        <span className="absolute left-0.5 h-6 w-6 rounded-full bg-white shadow transition peer-checked:translate-x-5" />
      </span>
    </label>
  );
}
