/* Verifies production hosting rules against the real nginx config from
   deploy/nginx (phase 2 ticket 05). It boots nginx in a container with the
   built app mounted as /srv/current, then checks headers, cache policy, SPA
   fallback, release metadata, and a cold install followed by an offline start. */
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { createReporter, launchPersistentChromium } from '../browser-harness.mjs';

function walk(path, files = []) {
  for (const entry of readdirSync(path, { withFileTypes: true })) {
    const full = join(path, entry.name);
    if (entry.isDirectory()) walk(full, files);
    else files.push(full);
  }
  return files;
}

function run(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed: ${result.stderr || result.stdout}`);
  }
  return result.stdout.trim();
}

function assertDockerAvailable() {
  const probe = spawnSync('docker', ['info'], { encoding: 'utf8' });
  if (probe.status === 0) return;

  const detail = (probe.stderr || probe.stdout || '').trim();
  throw new Error(
    `Docker is required for verify:hosting and this shell cannot use it. ` +
      `Start Docker and make sure this user can access /var/run/docker.sock (for example by joining the docker group). ` +
      `${detail}`
  );
}

function ensureBuild() {
  const required = ['build/index.html', 'build/service-worker.js', 'build/_app/version.json', 'build/release.json'];
  const missing = required.filter((path) => !existsSync(path));
  if (missing.length) {
    throw new Error(`Missing build output (${missing.join(', ')}). Run npm run build first.`);
  }
}

async function waitForHttp(origin, attempts = 30) {
  for (let i = 0; i < attempts; i += 1) {
    try {
      const response = await fetch(`${origin}/`, { redirect: 'manual' });
      if (response.status === 200) return;
    } catch {}
    await delay(250);
  }
  throw new Error(`nginx did not answer on ${origin}`);
}

function choosePort() {
  const value = 18080 + Math.floor(Math.random() * 2000);
  return value;
}

const { ok, fail, finish } = createReporter();
let containerId = '';
let containerUp = false;
const tempRoot = mkdtempSync(join(tmpdir(), 'gd-hosting-'));

const stopContainer = () => {
  if (!containerUp || !containerId) return;
  spawnSync('docker', ['rm', '-f', containerId], { encoding: 'utf8' });
  containerUp = false;
};

try {
  assertDockerAvailable();
  ensureBuild();

  const snippets = join(tempRoot, 'snippets');
  const confd = join(tempRoot, 'conf.d');
  const current = join(tempRoot, 'current');
  mkdirSync(snippets, { recursive: true });
  mkdirSync(confd, { recursive: true });

  cpSync('build', current, { recursive: true });
  cpSync('deploy/nginx/journal-headers.conf', join(snippets, 'gender-diary-journal-headers.conf'));
  cpSync('deploy/nginx/journal-site.conf', join(snippets, 'gender-diary-journal-site.conf'));

  writeFileSync(
    join(confd, 'default.conf'),
    [
      'server {',
      '    listen 8080;',
      '    server_name app.genderdiary.barankiewicz.dev;',
      '    root /srv/current;',
      '    include /etc/nginx/snippets/gender-diary-journal-site.conf;',
      '}'
    ].join('\n') + '\n'
  );

  const port = choosePort();
  containerId = run('docker', [
    'run',
    '--rm',
    '-d',
    '-p',
    `127.0.0.1:${port}:8080`,
    '-v',
    `${snippets}:/etc/nginx/snippets:ro,z`,
    '-v',
    `${confd}:/etc/nginx/conf.d:ro,z`,
    '-v',
    `${current}:/srv/current:ro,z`,
    'nginx:1.27-alpine'
  ]);
  containerUp = true;

  const origin = `http://127.0.0.1:${port}`;
  await waitForHttp(origin);

  const rootResponse = await fetch(`${origin}/`);
  if (rootResponse.status === 200) ok('nginx serves the app shell from the hosted origin');
  else fail('nginx serves the app shell from the hosted origin', `status ${rootResponse.status}`);

  const rootHeaders = {
    coop: rootResponse.headers.get('cross-origin-opener-policy'),
    coep: rootResponse.headers.get('cross-origin-embedder-policy'),
    csp: rootResponse.headers.get('content-security-policy') ?? '',
    cache: rootResponse.headers.get('cache-control')
  };

  if (rootHeaders.coop === 'same-origin' && rootHeaders.coep === 'require-corp') {
    ok('the hosted shell response carries COOP and COEP');
  } else {
    fail('the hosted shell response carries COOP and COEP', JSON.stringify(rootHeaders));
  }

  if (rootHeaders.csp.includes("connect-src 'self'") && rootHeaders.csp.includes("default-src 'self'")) {
    ok('the hosted shell response carries the restrictive CSP transport policy');
  } else {
    fail('the hosted shell response carries the restrictive CSP transport policy', rootHeaders.csp || 'missing');
  }

  if (rootHeaders.cache?.includes('no-cache')) ok('the shell is update-aware cached (no-cache)');
  else fail('the shell is update-aware cached (no-cache)', rootHeaders.cache || 'missing');

  const immutable = walk('build/_app/immutable')
    .map((file) => `/${relative('build', file)}`)
    .find((path) => path.endsWith('.js'));
  if (!immutable) throw new Error('No immutable JavaScript asset in build/_app/immutable');

  const immutableResponse = await fetch(`${origin}${immutable}`);
  const immutableCache = immutableResponse.headers.get('cache-control') ?? '';
  if (immutableResponse.status === 200 && immutableCache.includes('immutable') && immutableCache.includes('31536000')) {
    ok('hashed assets are served immutable');
  } else {
    fail('hashed assets are served immutable', `${immutableResponse.status} ${immutableCache}`);
  }

  const manifestResponse = await fetch(`${origin}/manifest.webmanifest`);
  const manifestType = manifestResponse.headers.get('content-type') ?? '';
  if (manifestResponse.status === 200 && manifestType.includes('application/manifest+json')) {
    ok('the manifest is served with installable content type');
  } else {
    fail('the manifest is served with installable content type', `${manifestResponse.status} ${manifestType}`);
  }

  const fallbackResponse = await fetch(`${origin}/entry/new/today`);
  const fallbackText = await fallbackResponse.text();
  if (fallbackResponse.status === 200 && fallbackText.includes('<!doctype html>')) {
    ok('unknown paths fall back to the SPA document');
  } else {
    fail('unknown paths fall back to the SPA document', `status ${fallbackResponse.status}`);
  }

  const releaseResponse = await fetch(`${origin}/release.json`);
  const release = await releaseResponse.json();
  const builtVersion = JSON.parse(readFileSync('build/_app/version.json', 'utf8')).version;
  if (
    releaseResponse.status === 200 &&
    typeof release.version === 'string' &&
    release.buildId === builtVersion &&
    Number.isInteger(release.schemaMax)
  ) {
    ok('the hosted origin exposes release metadata for deploy and rollback checks');
  } else {
    fail('the hosted origin exposes release metadata for deploy and rollback checks', JSON.stringify(release));
  }

  const profile = mkdtempSync(join(tempRoot, 'profile-'));
  let browser;
  const requests = [];

  try {
    browser = await launchPersistentChromium(profile);
    const page = browser.pages()[0] ?? (await browser.newPage());
    page.on('request', (request) => requests.push(request.url()));

    await page.goto(origin, { waitUntil: 'networkidle' });
    await page.waitForSelector('#journal-passphrase', { timeout: 15000 });
    await page.fill('#journal-passphrase', 'hosting verify passphrase');
    await page.fill('#journal-passphrase-confirm', 'hosting verify passphrase');
    await page.click('[data-passphrase-submit]');
    await page.waitForSelector('.app[data-boot="ready"]', { timeout: 30000 });

    const cdp = await browser.newCDPSession(page);
    const { installabilityErrors } = await cdp.send('Page.getInstallabilityErrors');
    if (installabilityErrors.length === 0) ok('cold installability passes on the hosted origin');
    else fail('cold installability passes on the hosted origin', JSON.stringify(installabilityErrors));

    const workerReady = await page.waitForFunction(
      async () => (await navigator.serviceWorker.getRegistration())?.active?.state === 'activated',
      null,
      { timeout: 30000 }
    );
    if (workerReady) ok('the hosted origin installs an active service worker');

    await browser.close();
    browser = await launchPersistentChromium(profile, { offline: true });
    const offline = browser.pages()[0] ?? (await browser.newPage());
    offline.on('request', (request) => requests.push(request.url()));
    await offline.goto(origin);
    await offline.waitForSelector('#journal-passphrase', { timeout: 30000 });
    await offline.fill('#journal-passphrase', 'hosting verify passphrase');
    await offline.click('[data-passphrase-submit]');
    await offline.waitForSelector('.app[data-boot="ready"]', { timeout: 30000 });
    ok('a cold install relaunches offline from the hosted origin');
  } catch (error) {
    fail('hosted-origin install and offline relaunch', error instanceof Error ? error.message : String(error));
  } finally {
    await browser?.close();
    rmSync(profile, { recursive: true, force: true });
  }

  const offOrigin = requests.filter((url) => {
    if (!/^https?:/i.test(url)) return false;
    return new URL(url).origin !== origin;
  });
  if (offOrigin.length === 0) {
    ok('hosted-origin runtime sends no unexpected requests to other origins');
  } else {
    fail('hosted-origin runtime sends no unexpected requests to other origins', offOrigin.join(', '));
  }
} catch (error) {
  fail('verify:hosting', error instanceof Error ? error.message : String(error));
} finally {
  stopContainer();
  rmSync(tempRoot, { recursive: true, force: true });
}

const failures = finish('HOSTING VERIFICATION PASSES');
process.exit(failures ? 1 : 0);
