// All times arrive as UTC ISO strings and are shown in the browser's timezone,
// formatted for the selected language.
import { formatCountdown } from './duration.js';
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

// "2d 3h 12m", "3h 12m", "12m 05s", or null once the time has passed.
export function countdown(iso, now) {
  const seconds = Math.floor((Date.parse(iso) - now) / 1000);
  if (seconds <= 0) return null;
  return formatCountdown(seconds, {
    d: t('unit.d'),
    h: t('unit.h'),
    m: t('unit.m'),
    s: t('unit.s'),
  });
}
