/* The rules the two reminders screens keep for platform honesty (phase 11
   ticket 13), at the level a screen's source can be held to - mirrors
   settings-surfaces.test.ts and unprompted-view.test.ts.

   A stored reminder is a rule in the journal, and only Android can fire it
   (ADR-0063, CONTEXT.md's Reminder). The web build still lists, edits and
   deletes the rows, so the one thing these screens may not do is let a
   browser reader mistake saved data for a schedule that will ring. */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (path: string) => readFileSync(root + path, 'utf8');
const stripScript = (source: string) => source.replace(/<script[\s\S]*?<\/script>/g, '');

const list = read('src/routes/settings/reminders/+page.svelte');
const listMarkup = stripScript(list);
const detail = read('src/routes/settings/reminders/[id]/+page.svelte');
const detailMarkup = stripScript(detail);

describe('the reminders list on web', () => {
  it('hands the archive explanation a direct Export/import link', () => {
    /* The limitation notice is where a web reader learns the data moves in
       an encrypted export; the link is the task itself, not a second
       explanation of it. Bounded at the Android check-in block because the
       web branch carries an inner {:else} of its own (the empty state). */
    const web = listMarkup.slice(listMarkup.indexOf('{#if isWeb}'), listMarkup.indexOf('data-checkin'));
    expect(web).toContain('key="reminders-web"');
    expect(web).toContain('m.rem_web_list_note()');
    expect(web).toContain('m.rem_web_note()');
    expect(web).toContain("href: '/settings/export'");
    expect(web).toContain('m.export_import()');
  });
});

describe('the reminder editor on web', () => {
  it('says the saved schedule will not ring here, before Save', () => {
    /* The limitation sits above the save bar, so it is read before the one
       action that commits the record. */
    const note = detailMarkup.indexOf('key="reminder-web"');
    expect(note).toBeGreaterThanOrEqual(0);
    expect(note).toBeLessThan(detailMarkup.indexOf('<SaveBar>'));
    expect(detailMarkup).toContain('m.rem_web_save_note()');
  });

  it('promises no exact alarms or reboot survival on web', () => {
    /* "Exact alarms survive reboots" is Android delivery copy; a browser
       reader must never see it over a Save button. One occurrence, in the
       Android branch that follows the web notice. */
    expect(detailMarkup.match(/m\.rem_alarm_note\(\)/g)?.length).toBe(1);
    const saveNote = detailMarkup.indexOf('m.rem_web_save_note()');
    const android = detailMarkup.slice(detailMarkup.indexOf('{:else}', saveNote));
    expect(android).toContain('m.rem_alarm_note()');
    expect(android).toContain('m.rem_alarm_note_link()');
  });

  it('labels the next occurrence as stored data, not as a scheduled ring', () => {
    expect(detailMarkup).toContain('{#if isWeb}');
    expect(detailMarkup).toContain('m.rem_next_web(');
    expect(detailMarkup).toContain('m.rem_next(');
  });
});

describe('the reminders list on Android', () => {
  it('keeps the denied and battery explanations, one notice per permission', () => {
    /* Ticket 13 moves nothing on Android: each denied permission keeps its
       own request action, and the battery note keeps its own link. Ticket
       41 split the one shared notice in two, so each says only what its
       own refusal costs and leaves with the collapse kit Notice owns. The
       slice starts at the Android check-in block, the first markup past
       the web/Android branch, not at the first {:else} (the empty
       state's). */
    const android = listMarkup.slice(listMarkup.indexOf('data-checkin'));
    expect(android).toContain("{#if status === 'unreadable'}");
    expect(android).toContain("{#if status.notifications === 'denied'}");
    expect(android).toContain('key="reminders-notifications-off"');
    expect(android).toContain('m.rem_notifications_off_title()');
    expect(android).toContain('onclick: requestNotifications');
    expect(android).toContain("{#if status.exactAlarms === 'denied'}");
    expect(android).toContain('key="reminders-inexact"');
    expect(android).toContain('m.rem_inexact_title()');
    expect(android).toContain('m.rem_inexact_body()');
    expect(android).toContain('onclick: requestExactAlarms');
    expect(android).toContain('m.rem_battery_body()');
    expect(android).toContain('openBatterySettings');
  });

  it('re-reads permission status whenever the screen comes back to the front', () => {
    /* Ticket 41 (U30): the way out of a refusal is Android's settings
       screen, so a status read once at mount stays "denied" after the grant.
       watchStatus owns the visibility listener, its teardown and the
       refused-read rule (src/lib/permissions/watchStatus.test.ts). */
    expect(list).toContain("from '$lib/permissions/watchStatus'");
    expect(list).toMatch(/watchStatus<AndroidReminderStatus \| 'unreadable'>\(\{[\s\S]*?read: \(\) => androidReminders\.getStatus\(\)/);
    expect(list).toContain("unreadable: 'unreadable'");
    expect(list).not.toContain("addEventListener('visibilitychange'");
  });

  it('says it could not check when Android refuses the read, and offers another try', () => {
    /* Ticket 41's spec review: a refused read is neither a grant nor a
       refusal, so it gets its own notice rather than "Notifications are
       off" over a permission that may be on. */
    const android = listMarkup.slice(listMarkup.indexOf('data-checkin'));
    const unknown = android.slice(android.indexOf("{#if status === 'unreadable'}"), android.indexOf('{:else}', android.indexOf("{#if status === 'unreadable'}")));
    expect(unknown).toContain('key="reminders-permissions-unknown"');
    expect(unknown).toContain('m.perm_status_unknown_title()');
    expect(unknown).toContain('m.rem_status_unknown_body()');
    expect(unknown).toContain('statusWatch?.refresh()');
    expect(unknown).not.toContain('rem_notifications_off');
    expect(unknown).not.toContain('rem_inexact');
  });
});

/* Functional audit ticket 08. The check-in had a switch here and a second
   one on /settings/notifications, both writing `checkInEnabled`; the
   reminders screen keeps it beside the time and the pause, and the other
   screen links here. And the notifications screen's Reminders switch gates
   every row on this list, so this list says when it is off rather than
   showing every row switched on while nothing rings. */
const notifications = read('src/routes/settings/notifications/+page.svelte');
const notificationsMarkup = stripScript(notifications);

describe('the check-in in one place', () => {
  it('has its switch on the reminders screen and nowhere else', () => {
    const android = listMarkup.slice(listMarkup.indexOf('data-checkin'));
    expect(android.match(/prefs\.checkInEnabled = v/g)?.length).toBe(1);
    /* The notifications screen draws the registry's check-in row as a link
       to this screen, and its generic notify switch skips that row. */
    const checkIn = notificationsMarkup.slice(notificationsMarkup.indexOf("{#if row.key === 'check-in'}"));
    expect(notificationsMarkup).toContain("{#if row.key === 'check-in'}");
    expect(checkIn).toContain('href="/settings/reminders"');
    expect(checkIn.slice(0, checkIn.indexOf('{:else}'))).not.toContain('<Switch');
  });

  it('pauses the check-in until a date on the check-in row', () => {
    const block = listMarkup.slice(listMarkup.indexOf('data-checkin'), listMarkup.indexOf('</ReadReserve>', listMarkup.indexOf('data-checkin')));
    expect(block).toContain('<DatePicker');
    expect(block).toContain('m.checkin_pause_label()');
    expect(list).toContain('prefs.checkInPausedThrough =');
  });
});

describe('the notifications master switch, on the reminders screen', () => {
  it('says so when reminders are switched off, with the way back', () => {
    const android = listMarkup.slice(listMarkup.indexOf('data-checkin'));
    const off = android.slice(android.indexOf('{#if !prefs.remindersEnabled'));
    expect(android).toContain('{#if !prefs.remindersEnabled');
    expect(off).toContain('key="reminders-switched-off"');
    expect(off).toContain('m.rem_switched_off_title()');
    expect(off).toContain("href: '/settings/notifications'");
  });
});
