// All times arrive as UTC ISO strings and are shown in the browser's timezone.
const dayFmt = new Intl.DateTimeFormat(undefined, {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
});
const timeFmt = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' });

export const dayLabel = (iso) => dayFmt.format(new Date(iso));
export const timeLabel = (iso) => timeFmt.format(new Date(iso));

export function dayKey(iso) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

// "2d 3h", "3h 12m", "12m 05s", or null once the time has passed.
export function countdown(iso, now) {
  const s = Math.floor((Date.parse(iso) - now) / 1000);
  if (s <= 0) return null;
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m ${String(s % 60).padStart(2, '0')}s`;
}
