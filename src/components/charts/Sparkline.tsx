/** Tiny server-rendered trend line (no JS). Renders nothing with fewer than two points. */
export function Sparkline({ values, className = 'h-10 w-full', color = 'currentColor' }: { values: number[]; className?: string; color?: string }) {
  const pts = values.filter(Number.isFinite);
  if (pts.length < 2) return null;
  const min = Math.min(...pts);
  const max = Math.max(...pts);
  const span = max - min || 1;
  const d = pts.map((v, i) => `${((i / (pts.length - 1)) * 100).toFixed(2)},${(36 - ((v - min) / span) * 32).toFixed(2)}`).join(' ');
  return (
    <svg viewBox="0 0 100 40" preserveAspectRatio="none" className={className} aria-hidden>
      <polyline points={d} fill="none" stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}
