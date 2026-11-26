/* The rules the two reminders screens keep (phase 11 ticket 13, reshaped by
   pre-release human 18). A stored reminder is a rule in the journal, and only
   Android can fire it (ADR-0063, CONTEXT.md's Reminder), so the screens are
   Android-only: the web has no branch of them left, and
   reminders-android-only.test.ts holds the redirect. Mirrors
   settings-surfaces.test.ts and unprompted-view.test.ts. */

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

describe('the reminders screens carry no web branch', () => {
  it('draw one platform only, with none of the old web notices or labels', () => {
    for (const source of [list, detail]) {
      expect(source).not.toContain('isWeb');
      expect(source).not.toMatch(/rem_web_|rem_next_web/);
    }
  });

  it('keeps the alarm note and the plain next-occurrence line in the editor', () => {
    /* One occurrence each, no longer behind a platform check. */
    expect(detailMarkup.match(/m\.rem_alarm_note\(\)/g)?.length).toBe(1);
    expect(detailMarkup.match(/m\.rem_alarm_note_link\(\)/g)?.length).toBe(1);
    expect(detailMarkup).toContain('m.rem_next(');
  });
});

describe('the reminders list on Android', () => {
  it('keeps the denied and battery explanations, one notice per permission', () => {
    /* Ticket 13 moves nothing on Android: each denied permission keeps its
       own request action, and the battery note keeps its own link. Ticket
       41 split the one shared notice in two, so each says only what its
       own refusal costs and leaves with the collapse kit Notice owns. The
       slice starts at the check-in block. */
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

describe('deleting a reminder, from its editor on Android', () => {
  it('offers Delete on a stored reminder the person made, and never on a new one', () => {
    expect(detailMarkup).toMatch(/\{#if !detail\.isNew && detail\.record && !detail\.record\.autoSource\}[\s\S]*data-delete-reminder/);
    expect(detailMarkup.match(/data-delete-reminder/g)?.length).toBe(1);
  });

  it('asks first, with the shared confirm sheet and the undo hint', () => {
    expect(detailMarkup).toContain('<ConfirmDeleteSheet');
    expect(detailMarkup).toContain('m.rem_delete_q(');
    expect(detailMarkup).toContain('m.delete_undo_hint()');
  });

  it('deletes undoably, offers Undo and goes back to the list', () => {
    expect(detail).toMatch(/undoable\(\(j\) => j\.reminders\.deleteReminder\(/);
    expect(detail).toContain('offerUndo(');
    expect(detail).toMatch(/offerUndo\([\s\S]*detail\.discard\(\)[\s\S]*replaceRoute\('\/settings\/reminders'\)/);
  });
});
