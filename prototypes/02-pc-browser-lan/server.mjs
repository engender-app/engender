import { createServer as createHttpServer } from 'node:http';
import { createServer as createHttpsServer } from 'node:https';
import { readFileSync } from 'node:fs';

const [keyPath, certPath, pcLanAddress] = process.argv.slice(2);
if (!keyPath || !certPath || !pcLanAddress) {
  throw new Error('Usage: node server.mjs <test-key.pem> <test-cert.pem> <pc-lan-ip>');
}

const page = readFileSync(new URL('./probe.html', import.meta.url));
const script = readFileSync(new URL('./probe.js', import.meta.url));
const nginx = readFileSync(new URL('../../deploy/nginx/journal-headers.conf', import.meta.url), 'utf8');
const csp = nginx.match(/add_header Content-Security-Policy "([^"]+)"/)[1];
const signals = new Map();

async function handle(request, response) {
  const url = new URL(request.url, 'http://localhost');
  if (url.pathname === '/signal') {
    const role = url.searchParams.get('role');
    if (role !== 'pc' && role !== 'android') {
      response.writeHead(400).end();
      return;
    }
    if (request.method === 'POST') {
      const chunks = [];
      for await (const chunk of request) chunks.push(chunk);
      signals.set(role, JSON.parse(Buffer.concat(chunks).toString()));
      response.writeHead(204).end();
    } else {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify(signals.get(role === 'pc' ? 'android' : 'pc') ?? null));
    }
    return;
  }
  if (url.pathname === '/event' && request.method === 'POST') {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    process.stdout.write(`${Buffer.concat(chunks).toString()}\n`);
    response.writeHead(204).end();
    return;
  }
  if (url.pathname === '/') {
    response.writeHead(200, {
      'content-type': 'text/html; charset=utf-8',
      'content-security-policy': csp,
      'cache-control': 'no-store'
    });
    response.end(page);
    return;
  }
  if (url.pathname === '/probe.js') {
    response.writeHead(200, { 'content-type': 'text/javascript', 'cache-control': 'no-store' });
    response.end(script);
    return;
  }
  response.writeHead(404).end();
}

createHttpServer(handle).listen(8765, '0.0.0.0');
createHttpsServer({ key: readFileSync(keyPath), cert: readFileSync(certPath) }, handle)
  .listen(8766, '0.0.0.0');
process.stdout.write(`Android: https://${pcLanAddress}:8766/?role=android\nPC: https://localhost:8766/?role=pc\n`);
