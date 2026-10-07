import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const temp = mkdtempSync(join(tmpdir(), 'engender-count-'));
const received = [];
const upstream = createServer(async (request, response) => {
  let body = '';
  for await (const chunk of request) body += chunk;
  received.push({ url: request.url, headers: request.headers, body, method: request.method });
  response.writeHead(200, { 'Set-Cookie': 'must-not-leave-proxy=1' }).end('ok');
});
await new Promise(resolve => upstream.listen(0, '127.0.0.1', resolve));
const upstreamPort = upstream.address().port;
const reservation = createServer();
await new Promise(resolve => reservation.listen(0, '127.0.0.1', resolve));
const port = reservation.address().port;
await new Promise(resolve => reservation.close(resolve));
const origin = `http://127.0.0.1:${port}`;
const proxy = readFileSync('deploy/nginx/journal-count-proxy.conf', 'utf8')
  .replaceAll('127.0.0.1:8081', `127.0.0.1:${upstreamPort}`);
const routes = readFileSync('deploy/nginx/journal-page-count.conf', 'utf8')
  .replaceAll('include snippets/engender-count-proxy.conf;', proxy);
const dashboard = readFileSync('deploy/nginx/goatcounter-dashboard.conf', 'utf8');
writeFileSync(join(temp, 'nginx.conf'), `events {}\nhttp { server { listen 127.0.0.1:${port}; ${routes}\n${dashboard} } }`);
const container = spawnSync('podman', [
  'run', '--rm', '-d', '--network', 'host',
  '-v', `${temp}/nginx.conf:/etc/nginx/nginx.conf:ro,z`,
  'docker.io/library/nginx:1.27-alpine'
], { encoding: 'utf8' });
assert.equal(container.status, 0, container.stderr);
const id = container.stdout.trim();
try {
  for (let attempt = 0; ; attempt++) {
    try { await fetch(origin + '/gc/count'); break; }
    catch (error) { if (attempt === 40) throw error; await delay(100); }
  }
  for (const [label, site] of [['app', 'app.engender.barankiewicz.dev'], ['website', 'engender.barankiewicz.dev']]) {
    const headers = {
      Origin: `https://${site}`, 'User-Agent': 'Browser/1.0 private-visitor',
      Referer: 'https://app.engender.barankiewicz.dev/search?q=private',
      Cookie: 'visitor=private', Authorization: 'Bearer private',
      'X-Forwarded-For': '203.0.113.9', 'X-Real-IP': '203.0.113.9',
      Forwarded: 'for=203.0.113.9', 'Accept-Language': 'pl', 'X-Purpose': 'private'
    };
    const result = await fetch(`${origin}/_stats/${label}`, { method: 'POST', headers });
    assert.equal(result.status, 200);
    assert.equal(result.headers.get('set-cookie'), null);
    assert.equal(result.headers.get('access-control-allow-origin'), `https://${site}`);
    assert.deepEqual(received.at(-1), {
      method: 'GET', url: `/gc/count?p=/${label}`, body: '', headers: {
        host: 'stats.engender.barankiewicz.dev', connection: 'close', 'content-length': '0',
        'user-agent': 'Engender-count/1.0 anonymous'
      }
    });
    for (const [suffix, options, status] of [
      ['?p=/search&q=private', { method: 'POST', headers }, 400],
      ['', { method: 'POST', headers, body: 'private' }, 413],
      ['', { method: 'POST', headers: { ...headers, Origin: 'https://other.example' } }, 403],
      ['', { method: 'POST', headers: { ...headers, 'User-Agent': 'Googlebot' } }, 204],
      ['', { headers }, 405]
    ]) {
      const count = received.length;
      assert.equal((await fetch(`${origin}/_stats/${label}${suffix}`, options)).status, status);
      assert.equal(received.length, count, 'rejected requests must not reach GoatCounter');
    }
  }
  for (const path of ['/gc/count', '/gc/count/', '/gc/%63ount', '/gc//count', '/gc/count?p=/private']) {
    assert.equal((await fetch(origin + path)).status, 404);
  }
  assert.equal(received.length, 2);
  console.log('Page-count proxy: both labels isolated; visitor details stripped; bypasses refused.');
} finally {
  spawnSync('podman', ['stop', id], { stdio: 'ignore' });
  upstream.closeAllConnections();
  await new Promise(resolve => upstream.close(resolve));
  rmSync(temp, { recursive: true, force: true });
}
