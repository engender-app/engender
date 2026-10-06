import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { appVersion, isReleaseVersion } from './app-version.mjs';
import { firstLoadUrls } from './check-first-load-budget.mjs';

/** Mirrors Paraglide's localStorage, preferredLanguage, baseLocale strategy.
 * @param {unknown} saved
 * @param {readonly string[] | undefined} languages
 */
export function selectLocale(saved, languages) {
  /** @param {unknown} value */
  const canonical = (value) => typeof value === 'string' && ['en', 'pl'].find((locale) => locale === value.toLowerCase());
  const stored = canonical(saved);
  if (stored) return stored;
  for (const language of languages ?? []) {
    const locale = canonical(language) || canonical(language.split('-')[0]);
    if (locale) return locale;
  }
  return 'en';
}

/** @param {string} html */
export function shellParts(html) {
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].filter((match) => match[1].includes('kit.start(app, element)'));
  if (scripts.length !== 1) throw new Error('Locale shell must contain exactly one SvelteKit startup script');
  const startup = scripts[0];
  const entries = [...startup[1].matchAll(/import\("(\/_app\/immutable\/entry\/[^"\s]+\.js)"\)/g)].map((match) => match[1]);
  if (entries.length !== 2 || !entries[0].includes('/start.') || !entries[1].includes('/app.')) throw new Error('Locale shell has an unknown SvelteKit entry contract');
  const hints = [...html.matchAll(/<link\b[^>]*rel="x-modulepreload"[^>]*>/g)].map((match) => match[0]);
  if (!hints.length || html.includes('rel="modulepreload"')) throw new Error('Locale shell must hold all module hints');
  return { startup, entries, hints, urls: firstLoadUrls(html) };
}

/** @param {string} english @param {string} polish */
export function composeShell(english, polish) {
  const en = shellParts(english);
  const pl = shellParts(polish);
  const globals = [en, pl].map((parts) => parts.startup[1].match(/(__sveltekit_\w+)\s*=/)?.[1]);
  if (!globals[0] || globals[0] !== globals[1]) throw new Error('Locale builds must share one SvelteKit version');
  /** @param {string} html */
  const styles = (html) => [...html.matchAll(/<link\b[^>]*rel="stylesheet"[^>]*>/g)].map((match) => match[0]);
  if (JSON.stringify(styles(english)) !== JSON.stringify(styles(polish))) throw new Error('Locale shells must share their startup stylesheets');
  const graphs = { en: { entries: en.entries, hints: en.hints }, pl: { entries: pl.entries, hints: pl.hints } };
  const selector = `\nconst engenderLocaleGraphs = ${JSON.stringify(graphs)};\nlet engenderSavedLocale;\ntry { engenderSavedLocale = localStorage.getItem('PARAGLIDE_LOCALE'); } catch {}\nconst engenderLocale = (${selectLocale.toString()})(engenderSavedLocale, navigator.languages);\ntry { localStorage.setItem('PARAGLIDE_LOCALE', engenderLocale); } catch {}\ndocument.documentElement.lang = engenderLocale;\nconst engenderLocaleGraph = engenderLocaleGraphs[engenderLocale];\ndocument.write(engenderLocaleGraph.hints.join(''));\n`;
  const bootScripts = [...english.matchAll(/<script>([\s\S]*?)<\/script>/g)].filter((match) => match[0] !== en.startup[0]);
  if (bootScripts.length !== 1) throw new Error('Locale shell must contain exactly one boot preference script');
  const boot = selector + bootScripts[0][1];
  let html = english.replace(bootScripts[0][0], `<script>${boot}</script>`);
  for (const hint of en.hints) html = html.replace(hint, '');
  let startup = en.startup[1];
  en.entries.forEach((entry, index) => { startup = startup.replace(`import(${JSON.stringify(entry)})`, `import(engenderLocaleGraph.entries[${index}])`); });
  html = html.replace(en.startup[0], `<script>${startup}</script>`);
  const hashes = [boot, startup].map((script) => `'sha256-${createHash('sha256').update(script).digest('base64')}'`);
  if (!/script-src [^;]+/.test(html)) throw new Error('Locale shell must contain a script-src CSP');
  html = html.replace(/script-src ([^;]+)/, (_, policy) => `script-src ${policy} ${hashes.join(' ')}`);
  return { html, graph: { en: en.urls, pl: pl.urls }, selectorGzipBytes: gzipSync(Buffer.from(selector)).length };
}

/** @param {string} command @param {string[]} args @param {Record<string, string>} env */
function run(command, args, env = {}) {
  const result = spawnSync(command, args, { stdio: 'inherit', env: { ...process.env, ...env } });
  if (result.status !== 0) throw new Error(`${command} failed while building locale assets`);
}

export function buildLocales() {
  const temporary = mkdtempSync(join(tmpdir(), 'engender-locales-'));
  const version = appVersion();
  const buildId = isReleaseVersion(version) ? version : String(Date.now());
  try {
    run('node', ['scripts/prepare-vendor-assets.mjs']);
    run('node', ['node_modules/vite/bin/vite.js', 'build'], { ENGENDER_BUILD_LOCALE: 'en', ENGENDER_BUILD_ID: buildId });
    const english = readFileSync('build/index.html', 'utf8');
    cpSync('build/_app', join(temporary, '_app'), { recursive: true });
    const assets = readdirSync('build/_app/immutable', { recursive: true, withFileTypes: true }).filter((entry) => entry.isFile()).map((entry) => '/' + join(entry.parentPath, entry.name).replace(/^build\//, ''));
    const assetsPath = join(temporary, 'assets.json');
    writeFileSync(assetsPath, JSON.stringify(assets));
    run('node', ['node_modules/vite/bin/vite.js', 'build'], { ENGENDER_BUILD_LOCALE: 'pl', ENGENDER_BUILD_ID: buildId, ENGENDER_PREVIOUS_ASSETS: assetsPath });
    const polish = readFileSync('build/index.html', 'utf8');
    for (const entry of readdirSync(join(temporary, '_app'), { recursive: true, withFileTypes: true }).filter((entry) => entry.isFile())) {
      const source = join(entry.parentPath, entry.name);
      const target = join('build', source.slice(temporary.length + 1));
      if (existsSync(target) && !readFileSync(source).equals(readFileSync(target))) throw new Error(`Locale builds emitted conflicting asset ${target}`);
      if (!existsSync(target)) cpSync(source, target);
    }
    const { html, ...measurement } = composeShell(english, polish);
    writeFileSync('build/index.html', html);
    run('node', ['scripts/release-metadata.mjs']);
    const shell = readFileSync('build/index.html', 'utf8');
    // A demo build's prewarm script and WASM preload arrive here, after the
    // graphs were read, and both locales download them at start.
    const composed = firstLoadUrls(html);
    const added = firstLoadUrls(shell).filter((url) => !composed.includes(url));
    for (const urls of Object.values(measurement.graph)) urls.push(...added.filter((url) => !urls.includes(url)));
    const shellHash = createHash('sha256').update(shell).digest('hex');
    writeFileSync('.svelte-kit/locale-graphs.json', JSON.stringify({ ...measurement, shellHash, demo: process.env.VITE_DEMO === '1' }, null, 2) + '\n');
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) buildLocales();
