/* Entry Editor Unified Logging Hub structural and integration verification (Phase 5 Deepening Ticket 04, ADR-0044). */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (path: string) => readFileSync(root + path, 'utf8');

describe('Entry Editor Unified Logging Hub structure and guards', () => {
  const editor = read('src/lib/components/EntryEditor.svelte');

  it('discloses contextual sections between Note and Body Map', () => {
    const notePos = editor.indexOf('name="note"');
    const bodyMapPos = editor.indexOf('text={m.body_map_label()}');
    const tryoutPos = editor.indexOf('data-contextual="tryout-felt-sense"');
    const dosePos = editor.indexOf('data-contextual="dose-quick-log"');
    const recoveryPos = editor.indexOf('data-contextual="procedure-recovery"');
    const hrtPos = editor.indexOf('data-contextual="hrt-effects"');
    const cyclePos = editor.indexOf('data-contextual="cycle-event"');

    expect(notePos).toBeGreaterThan(0);
    expect(bodyMapPos).toBeGreaterThan(notePos);

    expect(tryoutPos).toBeGreaterThan(notePos);
    expect(tryoutPos).toBeLessThan(bodyMapPos);

    expect(dosePos).toBeGreaterThan(notePos);
    expect(dosePos).toBeLessThan(bodyMapPos);

    expect(recoveryPos).toBeGreaterThan(notePos);
    expect(recoveryPos).toBeLessThan(bodyMapPos);

    expect(hrtPos).toBeGreaterThan(notePos);
    expect(hrtPos).toBeLessThan(bodyMapPos);

    expect(cyclePos).toBeGreaterThan(notePos);
    expect(cyclePos).toBeLessThan(bodyMapPos);
  });

  it('guards contextual sections behind device preferences and domain conditions', () => {
    expect(editor).toContain('prefs.entryTryoutPromptEnabled && activeTryout');
    expect(editor).toContain('prefs.entryDoseQuickLogEnabled && scheduleDose');
    expect(editor).toContain('prefs.entryProcedureRecoveryEnabled && recoveringProcedure');
    expect(editor).toContain('prefs.entryHrtEffectsEnabled && isHrtActive');
    expect(editor).toContain('cycleTrackingActive');
  });

  it('the star sits on the save bar, for a new entry as well as an existing one (ticket 18)', () => {
    /* Before this ticket the star was one of the header's `{#if existing}`
       actions, so a new entry - which never has an id for setEntryStarred
       to write against - could not be starred until after its first save.
       Proven on the source rather than a rendered DOM: the star's own
       markup sits inside <SaveBar>, which this screen always draws, and
       not inside the header's existing-only guard. */
    const saveBarPos = editor.indexOf('<SaveBar>');
    const saveBarEnd = editor.indexOf('</SaveBar>', saveBarPos);
    const starPos = editor.indexOf('data-save-star');
    expect(saveBarPos).toBeGreaterThan(0);
    expect(starPos).toBeGreaterThan(saveBarPos);
    expect(starPos).toBeLessThan(saveBarEnd);

    const guardOpenBeforeStar = editor.lastIndexOf('{#if existing}', starPos);
    const guardCloseBeforeStar = editor.lastIndexOf('{/if}', starPos);
    expect(guardCloseBeforeStar).toBeGreaterThan(guardOpenBeforeStar);
  });

  it('a pending star applies once a new entry has an id to write it against', () => {
    const savePos = editor.indexOf('async function saveEntry()');
    const upsertPos = editor.indexOf('journal.entries.upsertEntry(entryDraft.toUpsert())', savePos);
    const applyPos = editor.indexOf('entryId == null && starred', savePos);
    expect(upsertPos).toBeGreaterThan(savePos);
    expect(applyPos).toBeGreaterThan(upsertPos);
    expect(editor).toContain('journal.entries.setEntryStarred(id, true)');
  });
});
