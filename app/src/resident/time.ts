/** Local wall-clock minutes, so `clock()` shows local HH:MM and `ago()` works across days. */
export function localMinute(iso: string | number | Date): number {
  const d = new Date(iso);
  return Math.floor((d.getTime() - d.getTimezoneOffset() * 60000) / 60000);
}

/** Format a minute value as 24-hour HH:MM. */
export function clock(minute: number): string {
  const m = ((Math.round(minute) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

/** "12 min ago" relative to `now`. */
export function ago(now: number, then: number): string {
  const d = Math.max(0, Math.round(now - then));
  if (d < 1) return 'just now';
  if (d < 60) return `${d} min ago`;
  const h = Math.floor(d / 60);
  const r = d % 60;
  return r ? `${h} h ${r} min ago` : `${h} h ago`;
}
