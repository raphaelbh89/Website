import { spawn } from 'node:child_process';
import { once } from 'node:events';
import assert from 'node:assert/strict';
const children = [];
function launch(args, env = {}) {
  const child = spawn(process.execPath, args, {
    env: {
      ...process.env,
      NODE_ENV: 'production',
      NEXT_TELEMETRY_DISABLED: '1',
      COOKIE_SECRET: 'smoke-test-production-cookie-secret-32-chars-min!',
      ...env,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.on('data', chunk => { output = (output + chunk).slice(-5000); });
  child.stderr.on('data', chunk => { output = (output + chunk).slice(-5000); });
  children.push(child);
  return { child, output: () => output };
}
async function waitFor(url, proc) {
  for (let attempt = 0; attempt < 80; attempt++) {
    if (proc.child.exitCode !== null) throw new Error('Server exited: ' + proc.output());
    try { return await fetch(url, { signal: AbortSignal.timeout(1000) }); } catch { /* waiting for bind */ }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw new Error('Server did not start: ' + proc.output());
}
try {
  const api = launch(['apps/api/dist/server.js'], { API_PORT: '14000', API_HOST: '127.0.0.1', DATABASE_URL: 'postgresql://invalid:invalid@127.0.0.1:1/unavailable' });
  assert.equal((await waitFor('http://127.0.0.1:14000/health/live', api)).status, 200);
  const ready = await fetch('http://127.0.0.1:14000/health/ready');
  assert.equal(ready.status, 503);
  assert.deepEqual(await ready.json(), { status: 'not_ready' });
  if (process.env.TEST_DATABASE_URL) {
    const healthy = launch(['apps/api/dist/server.js'], { API_PORT: '14001', API_HOST: '127.0.0.1', DATABASE_URL: process.env.TEST_DATABASE_URL });
    assert.equal((await waitFor('http://127.0.0.1:14001/health/ready', healthy)).status, 200);
    console.info('PASS: production API readiness against migrated PostgreSQL.');
  }
  for (const [app, port, label] of [['web', '13000', 'Public renderer'], ['admin', '13001', 'Admin CMS']]) {
    const proc = launch(['apps/' + app + '/node_modules/next/dist/bin/next', 'start', 'apps/' + app, '--hostname', '127.0.0.1', '--port', port]);
    const response = await waitFor('http://127.0.0.1:' + port, proc);
    assert.equal(response.status, 200);
    assert.ok((await response.text()).includes(label));
  }
  console.info('PASS: production API liveness, unavailable DB readiness, web and admin HTTP.');
} finally {
  await Promise.all(children.map(async child => {
    if (child.exitCode === null) { const exited = once(child, 'exit'); child.kill(); await exited; }
  }));
}
