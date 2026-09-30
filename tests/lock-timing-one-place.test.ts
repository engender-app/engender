import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';

/* Lock-timing ticket 01: one screen decides how the journal opens and when
   it asks again. Replaces the lock-on-leave inertness test, whose switch is
   gone from both screens that drew it.

   A source read, the same weak shape that test owned up to: the node tier
   cannot mount a .svelte file (ADR-0016), and what is guarded here is which
   screens mount which control under which condition, which is what a grep
   sees. The walkthrough drives the real timing choice and the lock it
   causes. */

const root = fileURLToPath(new URL('../', import.meta.url));
const read = (path: string) => readFileSync(`${root}${path}`, 'utf8');

function svelteFiles(dir: string, found: { path: string; source: string }[] = []) {
  for (const entry of readdirSync(`${root}${dir}`, { withFileTypes: true })) {
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) svelteFiles(path, found);
    else if (entry.name.endsWith('.svelte')) found.push({ path, source: read(path) });
  }
  return found;
}

const screens = [...svelteFiles('src/routes'), ...svelteFiles('src/lib/components')];
const ACCESS_MODE = read('src/routes/settings/access-mode/+page.svelte');
const ONBOARDING = read('src/routes/onboarding/+page.svelte');

it('no screen still draws a lock-on-leave control', () => {
  const offenders = screens.filter((file) => /lockOnLeave|lock_on_leave/.test(file.source)).map((file) => file.path);
  expect(offenders).toEqual([]);
});

it('the timing is asked in exactly two places: the access-mode screen and setup', () => {
  const mounts = screens.filter((file) => file.source.includes('<LockAfterChoice')).map((file) => file.path);
  expect(mounts.sort()).toEqual(['src/routes/onboarding/+page.svelte', 'src/routes/settings/access-mode/+page.svelte']);
});

it('both places ask it only under a mode with a secret', () => {
  /* The branch that opens right before the mount has to be the secret
     check, so a mode with nothing to ask again shows no question. */
  expect(ACCESS_MODE).toMatch(/\{#if hasSecret\}(?:(?!\{:else\})[\s\S])*<LockAfterChoice/);
  expect(ACCESS_MODE).toContain('let hasSecret = $derived(accessModeHasSecret(current, android));');
  expect(ONBOARDING).toMatch(/\{:else if lockAsks\}(\s*<!--[\s\S]*?-->)?\s*<LockAfterChoice/);
  expect(ONBOARDING).toContain('let lockAsks = $derived(accessModeHasSecret(bootState.accessMode, isAndroid()));');
});

it('the start prompt switch is on the access-mode screen, only under Android screen-lock mode', () => {
  const writers = screens.filter((file) => /prefs\.bioOptIn = /.test(file.source)).map((file) => file.path);
  expect(writers.sort()).toEqual([
    'src/lib/components/AndroidKeyGate.svelte',
    'src/routes/settings/access-mode/+page.svelte'
  ]);
  expect(ACCESS_MODE).toContain("let startPromptApplies = $derived(android && current === 'device-bound');");
  expect(ACCESS_MODE).toMatch(/\{#if startPromptApplies\}[\s\S]*?prefs\.bioOptIn = v;[\s\S]*?\{\/if\}/);
});
