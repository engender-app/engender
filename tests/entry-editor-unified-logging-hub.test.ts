/* Entry Editor Unified Logging Hub structural and integration verification (Phase 5 Deepening Ticket 04, ADR-0044). */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (path: string) => readFileSync(root + path, 'utf8');

describe('Entry Editor Unified Logging Hub structure and guards', () => {
  const editor = read('src/lib/components/EntryEditor.svelte');

  it('discloses contextual sections after the chip row and its sections, before the save bar', () => {
    /* Phase 11 ticket 19 put the note first and folded every structured
       question - body map included - into a chip row under it. The cards
       are offers rather than questions (ADR-0044), so they take no chip and
       sit where they did relative to the foot: after whatever the person
       opened, before Save. Until that ticket this asserted "between Note
       and Body Map"; body map is now a chip's section above the cards. */
    const notePos = editor.indexOf('name="note"');
    const chipsPos = editor.indexOf('data-editor-chips');
    const bodyMapPos = editor.indexOf('data-editor-section="body"');
    const saveBarPos = editor.indexOf('<SaveBar>');
    const tryoutPos = editor.indexOf('data-contextual="tryout-felt-sense"');
    const dosePos = editor.indexOf('data-contextual="dose-quick-log"');
    const recoveryPos = editor.indexOf('data-contextual="procedure-recovery"');
    const hrtPos = editor.indexOf('data-contextual="hrt-effects"');
    const cyclePos = editor.indexOf('data-contextual="cycle-event"');

    expect(notePos).toBeGreaterThan(0);
    expect(chipsPos).toBeGreaterThan(notePos);
    expect(bodyMapPos).toBeGreaterThan(chipsPos);
    expect(saveBarPos).toBeGreaterThan(bodyMapPos);

    for (const pos of [tryoutPos, dosePos, recoveryPos, hrtPos, cyclePos]) {
      expect(pos).toBeGreaterThan(bodyMapPos);
      expect(pos).toBeLessThan(saveBarPos);
    }
  });

  it('every section the editor asked before ticket 19 is still asked: mode and gender on the page, the rest from a chip', () => {
    const notePos = editor.indexOf('name="note"');
    const chipsPos = editor.indexOf('data-editor-chips');
    for (const onPage of ['text={m.presentation_label()}', 'text={m.gender_label()}']) {
      const pos = editor.indexOf(onPage);
      expect(pos).toBeGreaterThan(notePos);
      expect(pos).toBeLessThan(chipsPos);
    }
    for (const section of ['tags', 'body', 'photos', 'voice', 'video']) {
      expect(editor).toContain(`data-editor-section="${section}"`);
    }
    /* The mood faces and Save share the sticky bar, and an unmet mood is
       stated on the button rather than toasted after the tap. */
    const saveBarPos = editor.indexOf('<SaveBar>');
    const saveBarEnd = editor.indexOf('</SaveBar>', saveBarPos);
    const moodsPos = editor.indexOf('<MoodPicker bar');
    expect(moodsPos).toBeGreaterThan(saveBarPos);
    expect(moodsPos).toBeLessThan(saveBarEnd);
    expect(editor).toContain('m.entry_pick_mood_to_save()');
    expect(editor).not.toContain('toast(m.entry_needs_mood())');
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
