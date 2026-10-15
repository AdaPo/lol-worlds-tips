// Groups matches into one block per day. Every day appears exactly once, so the
// group keys are unique (the list renderer needs that).
//
// Order:
//   - days that still have a match to play, soonest day first;
//     inside a day: upcoming/live by time, then that day's finished matches
//   - days with only finished matches, latest day first (latest match first)
//
// keyOf(startTime) -> unique day key, labelOf(startTime) -> text for the heading.
export function groupByDay(matches, keyOf, labelOf) {
  const byTime = (a, b) => Date.parse(a.startTime) - Date.parse(b.startTime);
  const days = new Map();

  for (const m of matches) {
    const key = keyOf(m.startTime);
    if (!days.has(key)) {
      days.set(key, {
        key,
        label: labelOf(m.startTime),
        time: Date.parse(m.startTime),
        upcoming: [],
        finished: [],
      });
    }
    days.get(key)[m.state === 'completed' ? 'finished' : 'upcoming'].push(m);
  }

  const list = [...days.values()];
  for (const d of list) {
    d.upcoming.sort(byTime);
    d.finished.sort((a, b) => byTime(b, a));
    d.items = [...d.upcoming, ...d.finished];
  }

  const active = list.filter((d) => d.upcoming.length > 0).sort((a, b) => a.time - b.time);
  const past = list.filter((d) => d.upcoming.length === 0).sort((a, b) => b.time - a.time);
  return [...active, ...past].map(({ key, label, items }) => ({ key, label, items }));
}
