// Usage: npm run makeadmin -- <name> [--revoke]
import { openDb } from '../server/db.js';

try {
  process.loadEnvFile();
} catch {
  // No .env file; rely on the real environment.
}

const [name, flag] = process.argv.slice(2);
if (!name) {
  console.error('Usage: npm run makeadmin -- <name> [--revoke]');
  process.exit(1);
}

const db = openDb(process.env.DB_PATH ?? './data/app.db');
const isAdmin = flag === '--revoke' ? 0 : 1;
// The organizer account is hidden from the leaderboard by default; revoking
// admin leaves the hidden flag alone (change it on the admin page).
const sql = isAdmin
  ? 'UPDATE users SET is_admin = 1, hidden = 1 WHERE lower(name) = lower(?)'
  : 'UPDATE users SET is_admin = 0 WHERE lower(name) = lower(?)';
const { changes } = db.prepare(sql).run(name);

if (changes === 0) {
  console.error(`No user named "${name}"`);
  process.exit(1);
}
console.log(`${name} is ${isAdmin ? 'now' : 'no longer'} an admin`);
