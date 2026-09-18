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
       explanation of it. */
    const web = listMarkup.slice(listMarkup.indexOf('{#if isWeb}'), listMarkup.indexOf('{:else}'));
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
  it('keeps the granted, denied and battery explanations where they were', () => {
    /* Ticket 13 moves nothing on Android: the denied notice keeps its two
       request actions, and the battery note keeps its own link. */
    const android = listMarkup.slice(listMarkup.indexOf('{:else}'));
    expect(android).toContain("status.notifications === 'denied' || status.exactAlarms === 'denied'");
    expect(android).toContain('m.rem_capabilities_title()');
    expect(android).toContain('requestNotifications');
    expect(android).toContain('requestExactAlarms');
    expect(android).toContain('m.rem_battery_body()');
    expect(android).toContain('openBatterySettings');
  });
});
