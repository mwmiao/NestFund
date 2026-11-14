export interface SummarySeries {
  key: string;
  name: string;
}
export interface SeriesPoint {
  x: string;
  value: number;
}
export interface SeriesStats {
  name: string;
  first: SeriesPoint;
  last: SeriesPoint;
  min: SeriesPoint;
  max: SeriesPoint;
}

/** Start, end, lowest and highest value of each series, skipping rows where the series has no number. */
export function seriesStats(data: Record<string, string | number>[], xKey: string, series: SummarySeries[]): SeriesStats[] {
  const out: SeriesStats[] = [];
  for (const s of series) {
    const pts: SeriesPoint[] = data
      .filter((row) => typeof row[s.key] === 'number' && Number.isFinite(row[s.key] as number))
      .map((row) => ({ x: String(row[xKey]), value: row[s.key] as number }));
    if (!pts.length) continue;
    const by = (pick: (a: number, b: number) => boolean) => pts.reduce((best, p) => (pick(p.value, best.value) ? p : best));
    out.push({ name: s.name, first: pts[0], last: pts[pts.length - 1], min: by((a, b) => a < b), max: by((a, b) => a > b) });
  }
  return out;
}

/** The largest positive slices of a donut, biggest first. */
export function topSlices(data: { name: string; value: number }[], n = 5) {
  return data.filter((d) => d.value > 0).sort((a, b) => b.value - a.value).slice(0, n);
}
