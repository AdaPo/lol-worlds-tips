// Remembers view settings (which tab, which things are hidden) in this browser.
// All settings live in one localStorage entry. Nothing here may ever throw:
// storage can be blocked (private mode), full, or hold junk from an old version,
// and the page must still work with the defaults.
const KEY = 'prefs';

function readAll() {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

// The saved value, or `fallback` if nothing valid is saved. A saved value must
// have the same type as the fallback and, when `allowed` is given, be one of them.
export function loadPref(name, fallback, allowed) {
  const value = readAll()[name];
  if (typeof value !== typeof fallback) return fallback;
  if (allowed && !allowed.includes(value)) return fallback;
  return value;
}

export function savePref(name, value) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...readAll(), [name]: value }));
  } catch {
    // Not critical: the setting just won't be remembered.
  }
}
