/* The rules the one view over the unprompted registry keeps (phase 6 ticket
   04, merged from two screens onto one by deepening ticket 09 - this file
   was unprompted-views.test.ts, and before that live-tiles-surfaces.test.ts,
   when there were two), at the level a screen's source can be held to -
   mirrors settings-surfaces.test.ts.

   The rows' content is registry.test.ts's business (one per kind, which
   preference each reads); this file holds only what the markup promises:
   that the screen renders the registry rather than hand-written rows, that
   a row carrying a switch is a plain div rather than a control nested in a
   control, that a kind with no notify leaves that slot empty rather than
   drawing a dead switch, and that the notify column - not the whole screen
   - is absent on web rather than shown and inert. */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (path: string) => readFileSync(root + path, 'utf8');
const stripScript = (source: string) => source.replace(/<script[\s\S]*?<\/script>/g, '');

const screen = read('src/routes/settings/notifications/+page.svelte');
const screenMarkup = stripScript(screen);
const row = read('src/lib/unprompted/RegistryRow.svelte');
const redirect = read('src/routes/settings/live-tiles/+page.svelte');

describe('what the merged screen is built from', () => {
  it('draws one row per kind from the registry, not from hand-written markup', () => {
    expect(screen).toContain("from '$lib/unprompted/registry'");
    expect(screenMarkup).toContain('{#each UNPROMPTED_ROWS as row (row.key)}');
    // One {#each}, not the two screens used to run - a kind gets one row now.
    expect(screenMarkup.match(/\{#each\b/g)?.length).toBe(1);
    expect(screenMarkup.match(/<RegistryRow/g)?.length).toBe(1);
  });

  it('draws the row through the component the screen owns alone now', () => {
    expect(screen).toContain("from '$lib/unprompted/RegistryRow.svelte'");
  });

  it('is built out of the kit, with no card left from the old world', () => {
    expect(screenMarkup).not.toMatch(/class="[^"]*\bcard\b/);
    expect(screen).toContain("from '$lib/components/kit/ListCard.svelte'");
  });

  it('hands each row both toggles conditionally, one per question', () => {
    expect(screen).toContain('surface={row.surface');
    expect(screen).toContain('notify={!isWeb && row.notify');
  });

  it('keeps both cascades, unchanged, in the direction each screen it merged already had', () => {
    /* Turning a kind off turns its notification off too (phase 4 features
       ticket 04); turning a notification on turns the kind itself on
       (ticket 04's own other direction). Matched on the assignment rather
       than on a whole statement, so reformatting the line is not a test
       failure. */
    expect(screen).toMatch(/if \(!v && row\.notify\) prefs\[row\.notify\.prefKey\] = false/);
    expect(screen).toMatch(/if \(v && row\.surface\) prefs\[row\.surface\.prefKey\] = true/);
  });

  it('shows the two column heads only where there is a notify column to head', () => {
    const gate = screenMarkup.indexOf('{#if !isWeb}');
    expect(gate).toBeGreaterThanOrEqual(0);
    const heads = screenMarkup.slice(gate, screenMarkup.indexOf('</ListCard>'));
    expect(heads).toContain('m.notif_col_home()');
    expect(heads).toContain('m.notif_col_notify()');
  });

  it('reaches back to Settings, and Settings reaches it', () => {
    expect(screenMarkup).toContain('back="/settings"');
    const settings = stripScript(read('src/routes/settings/+page.svelte'));
    expect(settings).toContain('href="/settings/notifications"');
    expect(settings).not.toContain('href="/settings/live-tiles"');
  });
});

describe('what the row draws', () => {
  it('gives a row that carries a switch no interactive wrapper of its own', () => {
    expect(row).not.toContain('kit/ListRow.svelte');
    expect(row.replace(/<script[\s\S]*?<\/script>/g, '')).toMatch(/<div class="kit-row">/);
  });

  it('leaves a slot with no toggle empty rather than drawing a dead one', () => {
    expect(row).toContain('{#if surface}');
    expect(row).toContain('{#if notify}');
    expect(row).toContain('data-live-tile={surface ? key : undefined}');
    expect(row).toContain('data-notification={notify ? key : undefined}');
  });

  it('reserves each slot the same width whether or not it holds a switch', () => {
    // Otherwise the empty slot on a notify-only or surface-only row would
    // collapse and the two columns would stop lining up down the list.
    expect(row).toContain('flex: 0 0 var(--touch-target)');
  });
});

describe('the notify column on web', () => {
  it('is absent rather than shown and inert (user story 18)', () => {
    /* A browser cannot fire a scheduled notification while the app is
       closed, so a switch there would be a promise the platform does not
       keep - the screen says so instead of drawing dead switches. The Home
       column is unaffected: a live tile is in-app UI, not a notification. */
    expect(screenMarkup).toContain('{#if isWeb}');
    const web = screenMarkup.slice(screenMarkup.indexOf('{#if isWeb}'), screenMarkup.indexOf('{:else}'));
    expect(web).toContain('notif_web_title');
    expect(web).not.toContain('<Switch');
  });

  it('carries quiet hours and the disguise only on the platform that can fire', () => {
    const androidOnly = screenMarkup.slice(screenMarkup.indexOf('{:else}'));
    expect(androidOnly).toContain('data-quiet-hours');
    expect(androidOnly).toContain('prefs.quietHoursEnabled');
    expect(androidOnly).toContain('prefs.hideNotificationTitles');
  });

  it('says that a held notification is held rather than dropped', () => {
    expect(screenMarkup).toContain('notif_quiet_held');
  });

  it('leaves the disguise switch in exactly one place', () => {
    // It governs every registered class now, so a copy left behind on the
    // reminders screen would be two switches writing one preference.
    expect(read('src/routes/settings/reminders/+page.svelte')).not.toContain('hideNotificationTitles');
  });
});

describe('the old address', () => {
  it('redirects rather than 404s (ADR-0043\'s bookmark precedent)', () => {
    expect(redirect).toContain("replaceRoute('/settings/notifications')");
    expect(redirect).not.toContain('UNPROMPTED_ROWS');
    expect(redirect).not.toContain('RegistryRow');
  });
});
