import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, createWriteStream, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { launchChromium } from '../browser-harness.mjs';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const output = resolve(process.argv[2] ?? join(repo, '.claude/android-upgrade-kit', String(Date.now())));
mkdirSync(output, { recursive: true });
const run = (command, args, options = {}) => execFileSync(command, args, { encoding: 'utf8', timeout: 600000, maxBuffer: 32 * 1024 * 1024, ...options });
const git = (...args) => run('git', args, { cwd: repo }).trim();
if (git('status', '--porcelain')) throw new Error('Commit the candidate before rebuilding the installed-upgrade kit');
const revision = git('rev-parse', 'HEAD');
const released = git('rev-parse', 'v1.0.0-rc.1^{commit}');
const { beginAndroidTier } = await import('../../scripts/android-tier-evidence.mjs');
const sourceStart = beginAndroidTier(repo);
const sdk = process.env.ANDROID_HOME ?? process.env.ANDROID_SDK_ROOT ?? join(process.env.HOME, 'Android/Sdk');
if (!process.env.JAVA_HOME) throw new Error('Set JAVA_HOME to JDK 21 before building the installed-upgrade kit');
const sources = [];
const manifest = { expectedVersion: Math.max(...[...readFileSync(join(repo, 'src/lib/data/sqlite/migrations.ts'), 'utf8').matchAll(/version:\s*(\d+)/g)].map((match) => Number(match[1]))),
  fixture: 'fixture.engender', sourceStart, upgradeApks: {} };
const sha256 = (path) => createHash('sha256').update(readFileSync(path)).digest('hex');
function source(name, ref) {
  const worktree = join(output, `${name}-source`);
  git('worktree', 'add', '--detach', worktree, ref); sources.push(worktree);
  writeFileSync(join(worktree, 'android/local.properties'), `sdk.dir=${sdk}\n`);
  const log = run('npm', ['ci', '--offline'], { cwd: worktree });
  writeFileSync(join(output, `${name}-npm.log`), log);
  return worktree;
}
function build(worktree, name, sourceRevision, patch = null) {
  const versionName = name === 'previous' ? '1.0.0-rc.1' : '1.1.0-upgrade.40';
  const versionCode = name === 'previous' ? 1000000501 : 1001000740;
  const packageId = 'dev.engender.app.test.upgrade40';
  const gradlePath = join(worktree, 'android/app/build.gradle');
  const originalGradle = readFileSync(gradlePath, 'utf8');
  writeFileSync(gradlePath, originalGradle.replace('applicationId "dev.engender.app"', `applicationId "${packageId}"`));
  const migrationsPath = join(worktree, 'src/lib/data/sqlite/migrations.ts');
  const migrations = readFileSync(migrationsPath, 'utf8');
  if (patch) {
    const table = patch === 'loss-migration' ? 'milestone' : 'measurement';
    const statement = 'ALTER TABLE roadmap_check ADD COLUMN hidden INTEGER NOT NULL DEFAULT 0;';
    if (!migrations.includes(statement)) throw new Error('Retained testing-06 failure recipe no longer applies');
    writeFileSync(migrationsPath, migrations.replace(statement, `${statement} DELETE FROM ${table} WHERE id = (SELECT MIN(id) FROM ${table});`));
  }
  const env = { ...process.env, NODE_ENV: 'production', ANDROID_HOME: sdk, ANDROID_SDK_ROOT: sdk, ENGENDER_VERSION: versionName, ENGENDER_VERSION_CODE: String(versionCode) };
  let log = '';
  try {
    log += run('npm', ['run', 'build'], { cwd: worktree, env });
    log += run('npx', ['cap', 'sync', 'android'], { cwd: worktree, env });
    log += run('./gradlew', [':app:assembleDebug', '--offline', '--no-daemon', '--max-workers=2'], { cwd: join(worktree, 'android'), env });
    const path = join(output, `${name}.apk`);
    cpSync(join(worktree, 'android/app/build/outputs/apk/debug/app-debug.apk'), path);
    manifest.upgradeApks[name] = { path: `${name}.apk`, sha256: sha256(path), sourceRevision, versionName, versionCode, packageId, patch };
  } catch (error) {
    log += `${error.stdout ?? ''}${error.stderr ?? ''}\n${error.stack ?? error}\n`; throw error;
  } finally {
    writeFileSync(join(output, `${name}-build.log`), log);
    writeFileSync(migrationsPath, migrations); writeFileSync(gradlePath, originalGradle);
  }
}
try {
  const previous = source('previous', released);
  build(previous, 'previous', released);
  const fixtureDir = join(previous, 'tests/long-journal/fixture-archive'); mkdirSync(fixtureDir, { recursive: true });
  cpSync(join(repo, 'tests/android-tier/installed-upgrade-fixture'), fixtureDir, { recursive: true });
  cpSync(join(fixtureDir, 'gen.ts.template'), join(fixtureDir, 'gen.ts'));
  const server = await createServer({ configFile: join(previous, 'tests/long-journal/long-journal.vite.config.ts'), root: fixtureDir,
    server: { host: '127.0.0.1', port: 0, fs: { strict: false } } });
  await server.listen();
  const browser = await launchChromium();
  const sink = createWriteStream(join(output, manifest.fixture));
  try {
    const page = await browser.newPage();
    await page.exposeFunction('sink', (base64) => new Promise((done, reject) => sink.write(Buffer.from(base64, 'base64'), (error) => error ? reject(error) : done())));
    await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/index.html`);
    await page.locator('body[data-fixture-archive-ready]').waitFor({ state: 'attached', timeout: 180000 });
    const result = await page.evaluate(() => window.__fixtureArchiveResult);
    if (result.error || result.userVersion !== 88 || !result.archiveBytes) throw new Error(`Released fixture failed: ${JSON.stringify(result)}`);
    await new Promise((done) => sink.end(done));
    writeFileSync(join(output, 'fixture.json'), JSON.stringify({ ...result, sha256: sha256(join(output, manifest.fixture)), sourceRevision: released }, null, 2));
  } finally { sink.destroy(); await browser.close(); await server.close(); }
  const candidate = source('candidate', revision);
  build(candidate, 'healthy', revision);
  build(candidate, 'rowDeleting', revision, 'loss-migration-measurement');
  build(candidate, 'failing', revision, 'loss-migration');
  writeFileSync(join(output, 'manifest.json'), JSON.stringify(manifest, null, 2));
  console.log(join(output, 'manifest.json'));
} finally {
  for (const worktree of sources) git('worktree', 'remove', '--force', worktree);
}
