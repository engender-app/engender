import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';

/* UI/UX ticket 09: lock on leave cannot challenge anyone in the one mode
   combination with no secret to ask for again (device-bound on the web), so
   the switch must not look like a working control for something that does
   nothing. What the ticket adds beyond the old suffix under the row is
   presentation: the switch renders disabled, and the row itself carries the
   existing setup destination.

   A source read rather than a browser drive, and it is the weak shape
   tests/offline-resources.test.ts already owns up to: the node tier has no
   browser, and the guarded thing is which props a template passes, which is
   exactly what a grep sees and a screenshot does not. The browser tier's
   real proof is the walkthrough's switch flows, which run on journals that
   do have a secret and so exercise the enabled path this test cannot
   reach. */

const root = fileURLToPath(new URL('../', import.meta.url));

const SECURITY = readFileSync(`${root}src/routes/settings/security/+page.svelte`, 'utf8');
const SETTINGS = readFileSync(`${root}src/routes/settings/+page.svelte`, 'utf8');
const SWITCH = readFileSync(`${root}src/lib/components/Switch.svelte`, 'utf8');

/* The lock-on-leave block on the security screen, lifted out so the
   assertions cannot match a switch that belongs to another row. */
function lockRow(source: string): string {
  const start = source.indexOf('key="lock-on-leave"');
  const end = source.indexOf('</ListRow>', start);
  return source.slice(start, end);
}

it('the security screen renders the switch inert exactly where no secret can be asked for', () => {
  const row = lockRow(SECURITY);
  expect(row).toContain('disabled={!hasSecret}');
});

it('the inert row carries the existing setup destination instead of a dead end', () => {
  const row = lockRow(SECURITY);
  expect(row).toContain("href={hasSecret ? undefined : '/settings/access-mode'}");
  /* The row is static only while the switch works, so the destination never
      sits under a working control as well. */
  expect(row).toContain('static={hasSecret}');
});

it('the settings sheet switch goes inert for the same mode combination', () => {
  /* The sheet repeats setup's last question, so it repeats the same honesty:
     suffix under the row, and no working control where none can apply. */
  expect(SETTINGS).toContain('disabled={!hasAccessSecret}');
});

it('the switch component itself passes the state to the platform', () => {
  /* A native disabled button blocks activation and announces itself as
      dimmed, which is the whole mechanism; anything fancier would be a
      second state machine for one boolean. */
  expect(SWITCH).toMatch(/disabled=\{disabled\}|disabled,|\{disabled\}/);
});

it('neither screen finds another way to write the stored preference', () => {
  /* Presentation may not silently change the value: the one write is the
      switch's own handler, which a disabled switch cannot fire. */
  expect(SECURITY.match(/prefs\.lockOnLeave =/g)?.length).toBe(1);
  expect(SETTINGS.match(/prefs\.lockOnLeave =/g)?.length).toBe(1);
});
