import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../server/app.js';
import { openDb } from '../server/db.js';

describe('serving the built frontend', () => {
  let dir;
  let db;
  let app;

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'worlds-web-'));
    mkdirSync(join(dir, 'assets'));
    writeFileSync(join(dir, 'index.html'), '<!doctype html><title>Worlds tipovačka</title>');
    writeFileSync(join(dir, 'manifest.webmanifest'), '{"name":"Worlds tipovačka"}');
    writeFileSync(join(dir, 'assets', 'index-abc123.js'), 'console.log(1)');
    db = openDb(':memory:');
    app = await buildApp({
      db,
      config: { inviteCode: 'c', adminToken: 't', authRateLimitMax: 100, logger: false, webDist: dir },
    });
  });

  afterEach(async () => {
    await app.close();
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });

  const get = (url) => app.inject({ method: 'GET', url });

  it('serves index.html and revalidates it on every visit', async () => {
    const res = await get('/');
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('Worlds tipovačka');
    expect(res.headers['cache-control']).toBe('no-cache');
  });

  it('caches hashed assets for a year', async () => {
    const res = await get('/assets/index-abc123.js');
    expect(res.statusCode).toBe(200);
    expect(res.headers['cache-control']).toBe('public, max-age=31536000, immutable');
  });

  it('serves the manifest as a web manifest', async () => {
    const res = await get('/manifest.webmanifest');
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toMatch(/manifest\+json|application\/json/);
    expect(res.headers['cache-control']).toBe('no-cache');
  });

  it('falls back to index.html for app routes, but not for the API', async () => {
    const page = await get('/leaderboard');
    expect(page.statusCode).toBe(200);
    expect(page.body).toContain('Worlds tipovačka');

    const api = await get('/api/nope');
    expect(api.statusCode).toBe(404);
    expect(api.json()).toEqual({ error: 'Not found' });
  });
});
