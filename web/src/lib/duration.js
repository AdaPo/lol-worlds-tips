// Formats a number of seconds for the "locks in" countdown. Pure, so it is easy
// to test. `units` are the labels: { d, h, m, s }.
//   over a day  -> "2d 3h 12m"
//   over an hour -> "3h 12m"
//   otherwise    -> "12m 05s"
export function formatCountdown(totalSeconds, units) {
  const d = Math.floor(totalSeconds / 86400);
  const h = Math.floor((totalSeconds % 86400) / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (d > 0) return `${d}${units.d} ${h}${units.h} ${m}${units.m}`;
  if (h > 0) return `${h}${units.h} ${m}${units.m}`;
  return `${m}${units.m} ${String(s).padStart(2, '0')}${units.s}`;
}
