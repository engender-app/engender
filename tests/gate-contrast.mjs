/* Every piece of type on every gate, measured against what is actually
   behind it (redesign ticket 34, DIRECTION.md rules 11 and 15).

   The gates took the field this ticket, so every one of them now draws its
   title on one of the flag's colours instead of on the page - which is
   exactly the case rule 11's table cannot answer on its own, and the case
   setup's own walker was written for one ticket earlier. The measurement is
   shared with it (tests/contrast-walk.mjs); what is here is the walk.

   Off the gate fixture rather than the app, for the reason
   tests/gates-gallery.mjs gives: four of the five gates are boot states
   rather than URLs, and there is no address that produces them on demand.
   The components are the real ones and the stylesheets are the app's own.

   Run: node tests/gate-contrast.mjs [--palettes trans,agender] [--themes light,dark]
   Needs no build - the fixture is served by vite from source. Writes
   .claude/gate-contrast.json and prints the worst ratio per scene. */
import { createServer } from 'vite';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromium } from './browser-harness.mjs';
import { MEASURE } from './contrast-walk.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const flag = (name, fallback) => {
  const at = argv.indexOf(`--${name}`);
  return at >= 0 ? argv[at + 1] : fallback;
};
const PALETTES = flag(
  'palettes',
  'trans,nonbinary,genderfluid,bisexual,lesbian,pansexual,rainbow,agender'
).split(',');
const THEMES = flag('themes', 'light,dark').split(',');

/* Every gate, and the module's own two screens. The recovery scenes are
   included: they are gates a person meets on the worst day they will have
   with this app, and the one thing that must not also be hard to read. */
const SCENES = flag(
  'scenes',
  [
    'access-choice',
    'access-change',
    'unlock-pin',
    'unlock-passphrase',
    'unlock-biometric',
    'session-pin',
    'session-passphrase',
    'session-biometric',
    'session-device',
    'converting',
    'conversion-refused',
    'android-key',
    'android-key-no-lock',
    'android-key-invalidated',
    'device-recovery',
    'schema-too-new',
    'recovery-entry',
    'post-recovery'
  ].join(',')
).split(',');

const outFile = resolve(here, '../.claude/gate-contrast.json');
await mkdir(dirname(outFile), { recursive: true });

const fixture = await createServer({
  configFile: `${here}/browser-tier/browser-tier.vite.config.ts`,
  server: { port: 0 }
});
await fixture.listen();
const browser = await launchChromium();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
page.on('pageerror', (e) => console.error('page error:', e.message));
await page.goto(`http://localhost:${fixture.config.server.port}/gates.html`, {
  waitUntil: 'networkidle'
});
await page.waitForSelector('body[data-gates-ready]', { state: 'attached' });

const select = async (label, value) => {
  await page.selectOption(`select[aria-label="${label}"]`, value);
  await page.waitForTimeout(200);
};

const findings = {};
let worst = { ratio: Infinity };
let measured = 0;

for (const scene of SCENES) {
  await select('Scene', scene);
  for (const palette of PALETTES) {
    await select('Palette', palette);
    for (const theme of THEMES) {
      await select('Theme', theme);
      const results = await page.evaluate(MEASURE, '.screen-gate');
      /* A scene that measures nothing is a scene this walk cannot see, and
         it would otherwise pass by reporting an infinite ratio. The one that
         legitimately does is `access-change`: the module drawn as a settings
         card rather than inside a gate, which is not a gate and has no
         `.screen-gate` to walk. Anything else here means a gate stopped
         being one. */
      if (!results.length) {
        console.log(`NOTHING MEASURED  ${scene} ${palette} ${theme}: no .screen-gate on the page`);
        findings[`${scene}-${palette}-${theme}`] = { lowest: null, failed: [], empty: true };
        continue;
      }
      measured += results.length;
      const failed = results.filter((m) => m.ratio < m.floor);
      const low = results.reduce((a, b) => (b.ratio < a.ratio ? b : a), { ratio: Infinity });
      findings[`${scene}-${palette}-${theme}`] = { lowest: low, failed };
      if (low.ratio < worst.ratio) worst = { ...low, where: `${scene} ${palette} ${theme}` };
      for (const f of failed) {
        console.log(
          `UNDER FLOOR  ${scene} ${palette} ${theme}: ${f.what} "${f.text}" ${f.ratio}:1 ` +
            `against a ${f.floor}:1 floor (${f.size}px/${f.weight})`
        );
      }
    }
  }
  const lows = PALETTES.flatMap((p) =>
    THEMES.map((t) => findings[`${scene}-${p}-${t}`]?.lowest?.ratio).filter((r) => r !== undefined && r !== null)
  );
  console.log(
    lows.length
      ? `${scene}: worst ${Math.min(...lows)}:1 across ${lows.length} palette/theme pairs`
      : `${scene}: not a gate on this page, nothing measured`
  );
}

await writeFile(outFile, JSON.stringify({ worst, findings }, null, 2));
const under = Object.values(findings).filter((f) => f.failed.length).length;
const empty = Object.entries(findings).filter(([, f]) => f.empty).map(([k]) => k);
console.log(
  `\n${measured} pieces of type measured. Worst anywhere: ${worst.ratio}:1 on ${worst.where} ` +
    `(${worst.what} "${worst.text}", ${worst.size}px/${worst.weight}, floor ${worst.floor})`
);
console.log(under ? `${under} scene/palette pairs under the floor` : 'every gate clears its floor');
if (empty.length) console.log(`${empty.length} pairs measured nothing: ${empty.slice(0, 4).join(', ')}...`);
await page.close();
await browser.close();
await fixture.close();
