/* The rules the two views over the unprompted registry keep (phase 6 ticket
   04, extending ticket 51's single screen - this file was
   live-tiles-surfaces.test.ts when there was one view), at the level a
   screen's source can be held to - mirrors settings-surfaces.test.ts.

   The rows' content is registry.test.ts's business (one per kind, which view
   draws it, which preference each reads); this file holds only what the
   markup promises: that each screen renders the registry rather than
   hand-written rows, that a row carrying a Switch is a plain div rather than
   a control nested in a control, and that the notifications view is absent
   on web rather than shown and inert. */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (path: string) => readFileSync(root + path, 'utf8');
const stripScript = (source: string) => source.replace(/<script[\s\S]*?<\/script>/g, '');

const surfaces = read('src/routes/settings/live-tiles/+page.svelte');
const surfacesMarkup = stripScript(surfaces);
const notifications = read('src/routes/settings/notifications/+page.svelte');
const notificationsMarkup = stripScript(notifications);
const row = read('src/lib/unprompted/RegistryRow.svelte');

describe('what the surfaces view is built from', () => {
  it('draws its rows from the registry, not from hand-written markup', () => {
    expect(surfaces).toContain("from '$lib/unprompted/registry'");
    expect(surfacesMarkup).toContain('{#each SURFACE_ROWS as row (row.key)}');
    /* One RegistryRow, one {#each}: a kind added to the array needs no edit
       here. */
    expect(surfacesMarkup.match(/<RegistryRow/g)?.length).toBe(1);
  });

  it('draws the row through the component both views share', () => {
    /* One registry behind two views is only half true if each view writes
       the row out itself. */
    expect(surfaces).toContain("from '$lib/unprompted/RegistryRow.svelte'");
    expect(surfacesMarkup).toContain('handle="live-tile"');
    expect(row).toContain('data-live-tile={handle === \'live-tile\' ? key : undefined}');
  });

  it('gives rows that carry a switch no interactive wrapper of their own', () => {
    expect(row).not.toContain('kit/ListRow.svelte');
    expect(row.replace(/<script[\s\S]*?<\/script>/g, '')).toMatch(/<div class="kit-row"/);
  });

  it('has handed the notification sub-toggles over to the notifications view', () => {
    /* Ticket 04: one switch per question, on the screen that asks it. A
       second copy of `wrappedNotificationsEnabled` here would be the "four
       schedulers, four screens" problem the registry exists to end, only
       within one feature. */
    expect(surfaces).not.toContain('data-live-tile-notify');
    expect(surfaces).not.toContain('notify.subtitle()');
    /* The one thing it still does with `notify` is the cascade: turning a
       kind off turns its notification off too, so nothing fires for a kind
       that is off whichever screen the person is standing on. Matched on the
       assignment rather than on a whole statement, so reformatting the line
       is not a test failure. */
    expect(surfaces).toMatch(/row\.notify\)\s*prefs\[row\.notify\.prefKey\] = false/);
  });

  it('reaches back to Settings', () => {
    expect(surfacesMarkup).toContain('back="/settings"');
  });
});

describe('what the notifications view is built from', () => {
  it('draws its rows from the same registry, filtered to what fires', () => {
    expect(notifications).toContain("from '$lib/unprompted/registry'");
    expect(notificationsMarkup).toContain('{#each NOTIFICATION_ROWS as row (row.key)}');
    expect(notificationsMarkup.match(/<RegistryRow/g)?.length).toBe(1);
  });

  it('gives every row the handle the walkthrough grips (ADR-0029)', () => {
    expect(notificationsMarkup).toContain('handle="notification"');
    expect(row).toContain("data-notification={handle === 'notification' ? key : undefined}");
  });

  it('is built out of the kit, with no card left from the old world', () => {
    // The line feature-screens.test.ts holds for every screen on its list,
    // which this one joined (phase 6 ticket 04).
    expect(notificationsMarkup).not.toMatch(/class="[^"]*\bcard\b/);
    expect(notifications).toContain("from '$lib/components/kit/ListCard.svelte'");
  });

  it('is absent on web rather than shown and inert', () => {
    /* User story 18. A browser cannot fire a scheduled notification while
       the app is closed, so every switch here would be a promise the
       platform does not keep - the screen says so instead of drawing six
       dead switches and a quiet-hours window over notifications that cannot
       happen. */
    expect(notificationsMarkup).toContain('{#if isWeb}');
    const web = notificationsMarkup.slice(
      notificationsMarkup.indexOf('{#if isWeb}'),
      notificationsMarkup.indexOf('{:else}')
    );
    expect(web).not.toContain('<Switch');
    expect(web).not.toContain('<RegistryRow');
    expect(web).toContain('notif_web_title');
  });

  it('carries quiet hours and the disguise, the two rules that cross every kind', () => {
    expect(notificationsMarkup).toContain('data-quiet-hours');
    expect(notificationsMarkup).toContain('prefs.quietHoursEnabled');
    expect(notificationsMarkup).toContain('prefs.hideNotificationTitles');
  });

  it('says that a held notification is held rather than dropped', () => {
    expect(notificationsMarkup).toContain('notif_quiet_held');
  });

  it('reaches back to Settings, and Settings reaches it', () => {
    expect(notificationsMarkup).toContain('back="/settings"');
    const settings = stripScript(read('src/routes/settings/+page.svelte'));
    expect(settings).toContain('href="/settings/notifications"');
  });

  it('leaves the disguise switch in exactly one place', () => {
    // It governs every registered class now, so a copy left behind on the
    // reminders screen would be two switches writing one preference.
    expect(read('src/routes/settings/reminders/+page.svelte')).not.toContain('hideNotificationTitles');
  });
});
