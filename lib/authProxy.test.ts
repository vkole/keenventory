import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { setupTestOwner } from './authTestSupport';

test('Render edge addresses separate login rate limits and forwarded chains cannot bypass them', async () => {
  const folder = mkdtempSync(path.join(tmpdir(), 'keenventory-proxy-'));
  const names = ['RENDER', 'KEENVENTORY_DATA_DIR', 'BETTER_AUTH_URL', 'BETTER_AUTH_SECRET'];
  const previous = names.map((name) => process.env[name]);
  process.env.RENDER = 'true';
  process.env.KEENVENTORY_DATA_DIR = folder;
  let db: { close(): void } | undefined;
  try {
    const owner = await setupTestOwner();
    db = (await import('./db')).db;
    const auth = await (await import('./auth')).authentication();
    const attempt = (ip: string, forwarded: string, header = 'cf-connecting-ip') => auth.handler(new Request('http://localhost/api/auth/sign-in/email', {
      method: 'POST',
      headers: { origin: 'http://localhost', 'content-type': 'application/json', [header]: ip, 'x-forwarded-for': forwarded },
      body: JSON.stringify({ email: owner.email, password: 'Wrong-password-123' }),
    }));
    for (let i = 0; i < 5; i++)
      assert.equal((await attempt('198.51.100.10', `192.0.2.${i + 1}, 10.0.0.1`)).status, 401);
    assert.equal((await attempt('198.51.100.10', '203.0.113.99, 10.0.0.1')).status, 429);
    assert.equal((await attempt('198.51.100.11', '203.0.113.99, 10.0.0.1')).status, 401);
    assert.equal((await attempt('198.51.100.12', '203.0.113.99, 10.0.0.1', 'true-client-ip')).status, 401);
  } finally {
    db?.close();
    names.forEach((name, index) => {
      if (previous[index] === undefined) delete process.env[name];
      else process.env[name] = previous[index];
    });
    rmSync(folder, { recursive: true, force: true });
  }
});
