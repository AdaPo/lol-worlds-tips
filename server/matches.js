// SQLite's datetime('now') gives "2026-10-15 14:32:05" (UTC, no zone marker).
// The API sends proper ISO 8601 so browsers parse it as UTC.
export function sqliteToIso(value) {
  return value ? new Date(`${value.replace(' ', 'T')}Z`).toISOString() : null;
}

// Sets locked_at the first time a match is locked (started or no longer
// 'unstarted'). It is never cleared, so a later start_time change from the
// sync job cannot reopen a match whose picks were already visible.
export function lockStartedMatches(db, now = new Date()) {
  const iso = now.toISOString();
  db.prepare(
    `UPDATE matches SET locked_at = ?
     WHERE locked_at IS NULL AND (start_time <= ? OR state != 'unstarted')`,
  ).run(iso, iso);
}
