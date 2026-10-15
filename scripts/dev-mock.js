// Starts the app on the mock database, with a fake match clock.
//   npm run seed:mock   then   npm run dev:mock
import { basename } from 'node:path';
import { startMockSimulator } from './mock-simulator.js';

const dbPath = process.env.DB_PATH ?? './data/mock.db';
if (!basename(dbPath).includes('mock')) {
  console.error(`Refusing to run the mock clock on "${dbPath}": the file name must contain "mock".`);
  process.exit(1);
}

process.env.DB_PATH = dbPath;
process.env.PORT ??= '3001';
process.env.INVITE_CODE ??= 'mock';
process.env.ADMIN_TOKEN ??= 'mock-admin-token';
process.env.ESPORTS_API_KEY = ''; // never sync real matches into the fake data

startMockSimulator(dbPath);
await import('../server/index.js');
