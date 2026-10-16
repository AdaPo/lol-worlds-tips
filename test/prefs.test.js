import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadPref, savePref } from '../web/src/lib/prefs.js';

// A stand-in for the browser's localStorage.
function fakeStorage(initial = {}) {
  const data = { ...initial };
  return {
    data,
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => {
      data[k] = String(v);
    },
  };
}

describe('remembered view settings', () => {
  let storage;
  beforeEach(() => {
    storage = fakeStorage();
    vi.stubGlobal('localStorage', storage);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('gives the default when nothing is saved', () => {
    expect(loadPref('a.hide', true)).toBe(true);
    expect(loadPref('a.tab', 'all', ['all', 'open'])).toBe('all');
  });

  it('remembers a saved value, including false', () => {
    savePref('a.hide', false);
    savePref('a.tab', 'open');
    expect(loadPref('a.hide', true)).toBe(false); // false is a real choice, not "missing"
    expect(loadPref('a.tab', 'all', ['all', 'open'])).toBe('open');
  });

  it('keeps settings independent of each other', () => {
    savePref('x', true);
    savePref('y', false);
    savePref('x', false);
    expect(loadPref('x', true)).toBe(false);
    expect(loadPref('y', true)).toBe(false);
  });

  it('ignores a saved value of the wrong type', () => {
    storage.data.prefs = JSON.stringify({ 'a.hide': 'yes', 'a.tab': 7 });
    expect(loadPref('a.hide', true)).toBe(true);
    expect(loadPref('a.tab', 'all')).toBe('all');
  });

  it('ignores a saved choice that is no longer allowed', () => {
    storage.data.prefs = JSON.stringify({ 'a.tab': 'archived' });
    expect(loadPref('a.tab', 'all', ['all', 'open', 'finished'])).toBe('all');
  });

  it('survives junk or a hand-edited entry', () => {
    for (const junk of ['{not json', 'null', '"text"', '42', '[1,2]', '']) {
      storage.data.prefs = junk;
      expect(loadPref('a.hide', true)).toBe(true);
      savePref('a.hide', false); // and can still save over it
      expect(loadPref('a.hide', true)).toBe(false);
    }
  });

  it('never throws when storage is blocked', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    });
    expect(loadPref('a.hide', true)).toBe(true);
    expect(() => savePref('a.hide', false)).not.toThrow();
  });

  it('never throws when localStorage does not exist at all', () => {
    vi.stubGlobal('localStorage', undefined);
    expect(loadPref('a.hide', true)).toBe(true);
    expect(() => savePref('a.hide', false)).not.toThrow();
  });
});
