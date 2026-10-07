/* Verifies production hosting rules against the real nginx config from
   deploy/nginx (phase 2 ticket 05). It builds the self-hosting image from
   deploy/self-host, which installs those rules unchanged, boots it with the
   built app mounted as /srv/engender, then checks headers, cache policy, SPA
   fallback, release metadata, and a cold install followed by an offline start.
   It also runs nginx -t over the bare-nginx template in deploy/self-host. */
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { createReporter, launchPersistentChromium } from '../browser-harness.mjs';
import { startContainer, templateCheckArgs } from './container.mjs';

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

const IMAGE = 'engender-hosting-verify';

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
  const interfacesBefore = readdirSync('/sys/class/net').sort();
  ensureBuild();

  /* The self-hosting image (phase 13 self-hosting ticket 01) carries the same
     two snippets production installs, so serving through it checks the
     production rules and the image in one run. What neither covers is TLS,
     which is certbot's on the box and the reverse proxy's in front of the
     image. */
  const current = join(tempRoot, 'current');
  cpSync('build', current, { recursive: true });
  run('docker', ['build', '--quiet', '-t', IMAGE, '-f', 'deploy/self-host/Dockerfile', 'deploy']);

  /* The bare-nginx template, with its certificate placeholders pointed at a
     throwaway self-signed pair, has to be a config nginx accepts. */
  const certs = join(tempRoot, 'certs');
  const template = join(tempRoot, 'engender.conf');
  mkdirSync(certs);
  cpSync('deploy/self-host/engender.conf', template);
  run('openssl', [
    'req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1', '-subj', '/CN=journal.example.org',
    '-keyout', join(certs, 'privkey.pem'), '-out', join(certs, 'fullchain.pem')
  ]);
  const templateCheck = spawnSync(
    'docker',
    templateCheckArgs(IMAGE, template, certs),
    { encoding: 'utf8' }
  );
  if (templateCheck.status === 0) ok('the bare-nginx template passes nginx -t once its placeholders are filled');
  else fail('the bare-nginx template passes nginx -t once its placeholders are filled', templateCheck.stderr);

  const hosted = await startContainer(IMAGE, current, tempRoot, run);
  containerId = hosted.containerId;
  containerUp = true;
  const interfacesAfter = readdirSync('/sys/class/net').sort();
  if (JSON.stringify(interfacesBefore) === JSON.stringify(interfacesAfter)) {
    ok('hosting setup leaves host network interfaces unchanged');
  } else {
    fail('hosting setup leaves host network interfaces unchanged', JSON.stringify({ before: interfacesBefore, after: interfacesAfter }));
  }

  const origin = hosted.origin;
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

  /* The OCR engine's own policy (phase 5 performance ticket 01). It used to
     fall through to `location /` and its no-cache, so every shell install
     revalidated 27 MB of files that change only when a dependency upgrade
     changes them. */
  const ocrResponse = await fetch(`${origin}/tesseract/tesseract-core.wasm`);
  const ocrCache = ocrResponse.headers.get('cache-control') ?? '';
  if (ocrResponse.status === 200 && ocrCache.includes('max-age=2592000') && !ocrCache.includes('no-cache')) {
    ok('the on-demand OCR assets are served with a month of cache rather than revalidated');
  } else {
    fail('the on-demand OCR assets are served with a long max-age', `${ocrResponse.status} ${ocrCache || 'no cache-control'}`);
  }

  for (const manifest of ['manifest', 'manifest-pl', 'manifest-notes', 'manifest-notes-pl']) {
    const manifestResponse = await fetch(`${origin}/${manifest}.webmanifest`);
    const manifestType = manifestResponse.headers.get('content-type') ?? '';
    const label = `${manifest}.webmanifest is served with installable content type`;
    if (manifestResponse.status === 200 && manifestType.includes('application/manifest+json')) ok(label);
    else fail(label, `${manifestResponse.status} ${manifestType}`);
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
  let page;
  let stage = 'welcome';
  const requests = [];

  try {
    browser = await launchPersistentChromium(profile);
    page = browser.pages()[0] ?? (await browser.newPage());
    page.on('request', (request) => requests.push(request));
    page.on('pageerror', (error) => console.error('Hosted page error:', error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') console.error('Hosted console error:', message.text());
    });

    const waitFor = async (label, selector, timeout = 30000) => {
      stage = label;
      console.log(`Hosted wait: ${label} (${selector}) at ${page.url()}`);
      await page.waitForSelector(selector, { timeout });
    };
    const advanceTo = async (selector) => {
      for (let step = 0; step < 12 && !(await page.locator(selector).isVisible()); step++) {
        await waitFor(`setup step ${step + 1}`, '[data-next]');
        await page.waitForFunction(() => document.querySelectorAll('[data-setup-question]').length === 1);
        const question = await page.locator('[data-setup-question]').innerText();
        console.log(`Hosted setup: ${question}`);
        await page.locator('[data-next]').click();
        stage = `setup transition after ${question}`;
        await page.waitForFunction(({ question, selector }) => {
          const headings = document.querySelectorAll('[data-setup-question]');
          return document.querySelector(selector) || (headings.length === 1 && headings[0].textContent.trim() !== question);
        }, { question, selector });
      }
      await waitFor(`setup reached ${selector}`, selector, 15000);
    };

    const PASSPHRASE = 'hosting verify passphrase';
    await page.goto(origin, { waitUntil: 'networkidle' });
    await waitFor('welcome on cold install', '[data-next]', 60000);
    await advanceTo('[data-access-modes]');
    stage = 'access mode';
    await page.locator('[data-list-row="passphrase"]').click();
    await page.waitForSelector('[data-access-chosen="passphrase"]');
    await page.click('[data-access-continue]');
    await page.waitForSelector('[data-access-secret="passphrase"]');
    await page.fill('#am-passphrase', PASSPHRASE);
    await page.fill('#am-passphrase-confirm', PASSPHRASE);
    await page.click('[data-access-submit]');
    await waitFor('journal created after passphrase', '.app[data-boot="ready"]');

    stage = 'finish setup';
    await waitFor('setup after access mode', '[data-next]', 60000);
    await advanceTo('[data-finish]');
    await page.locator('[data-finish]').click();
    await page.waitForSelector('[data-home-hello]', { timeout: 15000 });

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
    stage = 'offline relaunch';
    browser = await launchPersistentChromium(profile, { offline: true });
    const offline = browser.pages()[0] ?? (await browser.newPage());
    page = offline;
    offline.on('request', (request) => requests.push(request));
    await offline.goto(origin);
    await offline.waitForSelector('#journal-passphrase', { timeout: 30000 });
    await offline.fill('#journal-passphrase', 'hosting verify passphrase');
    await offline.click('[data-passphrase-submit]');
    await offline.waitForSelector('.app[data-boot="ready"]', { timeout: 30000 });
    ok('a cold install relaunches offline from the hosted origin');
  } catch (error) {
    fail(`hosted-origin install and offline relaunch (${stage})`, error instanceof Error ? error.message : String(error));
    if (page && !page.isClosed()) {
      console.error('Hosted page at failure:', page.url(), await page.locator('body').innerText().catch(() => 'unavailable'));
      mkdirSync('ci-logs', { recursive: true });
      await page.screenshot({ path: 'ci-logs/hosting-failure.png' }).catch(() => {});
    }
  } finally {
    await browser?.close();
    rmSync(profile, { recursive: true, force: true });
  }

  const offOrigin = requests.filter((request) => {
    // Exclude navigation requests: a user clicking a link to another origin
    // should not be flagged as a violation. Only runtime requests (fetch, xhr)
    // from the app itself should be checked.
    if (request.isNavigationRequest?.()) return false;

    const url = request.url();
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
