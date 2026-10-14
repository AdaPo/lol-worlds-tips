// All times arrive as UTC ISO strings and are shown in the browser's timezone,
// formatted for the selected language.
import { i18n, t } from './i18n.svelte.js';

const locale = () => (i18n.lang === 'cs' ? 'cs-CZ' : 'en-GB');

export const dayLabel = (iso) =>
  new Intl.DateTimeFormat(locale(), { weekday: 'short', day: 'numeric', month: 'short' }).format(
    new Date(iso),
  );

export const timeLabel = (iso) =>
  new Intl.DateTimeFormat(locale(), { hour: '2-digit', minute: '2-digit' }).format(new Date(iso));

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
  const [ud, uh, um, us] = ['unit.d', 'unit.h', 'unit.m', 'unit.s'].map((k) => t(k));
  if (d > 0) return `${d}${ud} ${h}${uh}`;
  if (h > 0) return `${h}${uh} ${m}${um}`;
  return `${m}${um} ${String(s % 60).padStart(2, '0')}${us}`;
}
