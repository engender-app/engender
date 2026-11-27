/* Check the view renders filtered registry rows and prompt toggles.
   Switch rows use plain wrappers to avoid nested controls. Kinds
   without notifications have an empty slot. On web omit the notify
   column and retain the screen. registry.test.ts covers row content. */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';


const root = fileURLToPath(new URL('../../..', import.meta.url));
const read = (path: string) => readFileSync(root + path, 'utf8');
const stripScript = (source: string) => source.replace(/<script[\s\S]*?<\/script>/g, '');

const screen = read('src/routes/settings/notifications/+page.svelte');
const screenMarkup = stripScript(screen);
const row = read('src/lib/unprompted/RegistryRow.svelte');
const editor = read('src/lib/components/TodayEditor.svelte');
const wear = read('src/routes/body/wear/+page.svelte');

describe('what the merged screen is built from', () => {
  it('draws relevant registry kinds, not hand-written rows', () => {
    expect(screen).toContain("from '$lib/unprompted/registry'");
    expect(screen).toMatch(/const ROWS = UNPROMPTED_ROWS\.filter\(\(row\) => !isLiveTileKind\(row\.key\)\)/);
    expect(screen).toContain('isWeb ? ROWS.filter((row) => row.surface) : ROWS');
    expect(screen).toContain('homeRows = $derived(visibleRows.filter((row) => row.surface))');
    expect(screen).toContain('notifyRows = $derived(visibleRows.filter((row) => !row.surface))');
    // One {#each} per registry card, and one over the remaining prompts.
    expect(screenMarkup.match(/\{#each\b/g)?.length).toBe(3);
    expect(screenMarkup.match(/<RegistryRow/g)?.length).toBe(2);
  });

  it('leaves the live tiles to the editor that arranges them, by filtering rather than by a second list', () => {
    /* The kinds are named in one place (`LIVE_TILE_ORDER`) and this screen
       asks that place, so a fourteenth tile cannot arrive switchable in two
       surfaces at once. */
    expect(screen).toContain("import { isLiveTileKind } from '$lib/data/liveTiles'");
    expect(editor).toContain("from '$lib/data/liveTiles'");
    expect(editor).toContain('{#each LIVE_TILE_DRAW_ORDER as kind (kind)}');
    expect(editor).toContain('data-edit-tile={kind}');
  });

  it('offers no agenda kind switches beside the tiles (functional-audit ticket 14)', () => {
    /* The agenda draws every kind ADR-0067 admits; the five switches and
       the preference behind them are gone. */
    expect(editor).not.toContain('data-edit-kind');
    expect(editor).not.toContain('agendaKinds');
    expect(editor).not.toContain('DAY_AHEAD_MARK_KINDS');
  });

  it('carries remaining prompts under a heading', () => {
    expect(screenMarkup).toContain('m.notif_prompts_heading()');
    for (const key of ['guided-prompts']) {
      expect(screen).toContain(`key: '${key}'`);
    }
    expect(screen).not.toContain("key: 'wear-duration-cue'");
    expect(wear).toContain('prefs.wearDurationCueEnabled = v');
    // Functional audit ticket 34 moved the roadmap's milestone prompt onto
    // the roadmap screen, next to the ticks it is about.
    expect(screen).not.toContain('roadmapMilestoneSyncEnabled');
    // A plain div for the same reason every other switch row here is one.
    expect(screenMarkup).toMatch(/<div class="kit-row" data-prompt=\{prompt\.key\}>/);
  });

  it('draws the row through the component the screen owns alone now', () => {
    expect(screen).toContain("from '$lib/unprompted/RegistryRow.svelte'");
  });

  it('is built out of the kit, with no card left from the old world', () => {
    expect(screenMarkup).not.toMatch(/class="[^"]*\bcard\b/);
    expect(screen).toContain("from '$lib/components/kit/ListCard.svelte'");
  });

  it('hands each row both toggles conditionally, one per question', () => {
    expect(screen).toContain('surface={isSurfaceRow(row)');
    expect(screen).toContain('notify={!isWeb && row.notify');
  });

  it('keeps both cascades, unchanged, in the direction each screen it merged already had', () => {
    /* Turning a kind off turns its notification off too; turning a notification on turns the kind itself on
       (ticket 04's own other direction). Matched on the assignment rather
       than on a whole statement, so reformatting the line is not a test
       failure. */
    expect(screen).toMatch(/if \(!v && row\.notify\) prefs\[row\.notify\.prefKey\] = false/);
    expect(screen).toMatch(/if \(v && isSurfaceRow\(row\)\) prefs\.surfaceOverrides = withSurface\(prefs\.surfaceOverrides, row\.key, true\)/);
  });

  it('puts every switch on the trailing edge, Home switches and notify switches in cards of their own', () => {
    /* No row carries both switches since FA 13 took the Wrapped and On
       this day notifications, so a Show column and a Notify column left
       the Home switches one 48px slot in from the edge while the
       notification switches sat on it (Alicja at FA 08's sign-off: "the
       sliders need to be aligned vertically"). Two headed cards say which
       question a switch answers instead of a column position. */
    expect(screenMarkup).not.toContain('registry-heads');
    const home = screenMarkup.indexOf('{#each homeRows as row (row.key)}');
    const notify = screenMarkup.indexOf('{#each notifyRows as row (row.key)}');
    expect(home).toBeGreaterThanOrEqual(0);
    expect(notify).toBeGreaterThan(home);
    expect(screenMarkup).toContain('m.notif_section_home()');
    expect(screenMarkup).toContain('m.notif_section_notify()');
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

  it('draws a slot only for a switch it has, so every switch sits on the trailing edge', () => {
    // An empty slot held 48px and pushed a lone switch in from the edge.
    expect(row).toMatch(/\{#if surface\}\s*<span class="kit-row-toggle" data-live-tile=\{key\}>/);
    expect(row).toMatch(/\{#if notify\}\s*<span class="kit-row-toggle" data-notification=\{key\}>/);
    expect(row).not.toContain('notifyColumn');
  });

  it('keeps each slot at the touch target, whatever the switch measures', () => {
    expect(row).toContain('flex: 0 0 var(--touch-target)');
  });
});

describe('the notify column on web', () => {
  it('is absent rather than shown and inert (user story 18)', () => {
    /* A browser cannot fire a scheduled notification while the app is
       closed, so a switch there would be a promise the platform does not
       keep. The screen is titled for in-app notices on the web instead of
       carrying a notice that repeats it (pre-release human 18). The show
       column and the four prompts are unaffected: a notice, a card and a
       nudge are in-app UI, not notifications. */
    expect(screenMarkup).toContain('notificationsTitle()');
    expect(screenMarkup).not.toContain('notif_web_title');
    expect(screenMarkup).toContain('notify={!isWeb && row.notify');
  });

  it('keeps phone-only controls on the platform that can fire (ticket 13)', () => {
    /* Quiet hours, hidden titles and the denied-permission notice follow
       the notify column out on web, under one gate after the prompts. */
    const tail = screenMarkup.slice(screenMarkup.indexOf('m.notif_prompts_heading()'));
    expect(tail).toContain('{#if !isWeb}');
    expect(tail).toContain('data-quiet-hours');
    expect(tail).toContain('prefs.hideNotificationTitles');
    expect(tail).toContain('retro_notify_capabilities_title');
  });
});

describe('what only Android carries', () => {
  it('leaves the disguise switch in exactly one place', () => {
    // It governs every registered class now, so a copy left behind on the
    // reminders screen would be two switches writing one preference.
    expect(read('src/routes/settings/reminders/+page.svelte')).not.toContain('hideNotificationTitles');
  });

  it('says what Android notification history keeps when titles are shown (last-audit UI 39)', () => {
    /* Testing 07 found a dismissed reminder's title in the Pixel's
       notification history with hiding off. History is an Android setting,
       off unless turned on, and AOSP prunes it after one day
       (NotificationHistoryDatabase.HISTORY_RETENTION_DAYS = 1), so the
       sentence is conditional on history and names that period. The app
       deletes nothing there, so it must not say it does. */
    const hideRow = screenMarkup.slice(screenMarkup.indexOf('data-hide-titles'));
    expect(hideRow).toContain('m.rem_hide_titles_sub()');
    const en = (JSON.parse(read('messages/en.json')) as Record<string, string>).rem_hide_titles_sub;
    const pl = (JSON.parse(read('messages/pl.json')) as Record<string, string>).rem_hide_titles_sub;
    // Titles reach history only while hiding is off, so the sentence says both.
    expect(en).toMatch(/With this off, Android's notification history, if on,/);
    expect(en).toContain('about a day');
    expect(pl).toMatch(/Gdy opcja jest wyłączona, historia powiadomień Androida, jeśli działa,/);
    expect(pl).toContain('mniej więcej dobę');
    for (const text of [en, pl]) {
      expect(text).not.toMatch(/Hide sensitive titles|Ukryj wrażliwe tytuły/);
      expect(text).not.toMatch(/delet|clear|eras|remov|usuw|usun|kasuj|czyś|czyszcz/i);
    }
  });
});

describe('the notifications permission notice', () => {
  it('re-reads permission status whenever the screen comes back to the front', () => {
    /* Last-audit UI ticket 41 (U30): granting notifications in Android's
       settings and swiping back left the denied notice up until the screen
       was left and opened again. watchStatus owns the listener, its
       teardown and the refused-read rule (watchStatus.test.ts). */
    expect(screen).toContain("from '$lib/permissions/watchStatus'");
    expect(screen).toMatch(/watchStatus<AndroidReminderStatus \| 'unreadable'>\(\{[\s\S]*?read: \(\) => androidReminders\.getStatus\(\)/);
    expect(screen).toContain("unreadable: 'unreadable'");
    // A refused read says it could not check, not that notifications are off.
    const unknown = screenMarkup.slice(screenMarkup.indexOf("{#if notifyStatus === 'unreadable' && anyNotifyOn}"), screenMarkup.indexOf('key="notify-denied"'));
    expect(unknown).toContain('key="notify-unknown"');
    expect(unknown).toContain('m.perm_status_unknown_title()');
    expect(unknown).toContain('m.notif_status_unknown_body()');
    expect(unknown).toContain('statusWatch?.refresh()');
    expect(screen).not.toContain("addEventListener('visibilitychange'");
  });
});
