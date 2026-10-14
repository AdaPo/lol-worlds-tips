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
const { changes } = db
  .prepare('UPDATE users SET is_admin = ? WHERE lower(name) = lower(?)')
  .run(isAdmin, name);

if (changes === 0) {
  console.error(`No user named "${name}"`);
  process.exit(1);
}
console.log(`${name} is ${isAdmin ? 'now' : 'no longer'} an admin`);
