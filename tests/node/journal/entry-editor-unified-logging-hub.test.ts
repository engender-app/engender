/* Entry Editor Unified Logging Hub structural and integration verification (ADR-0044). */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('../../..', import.meta.url));
const read = (path: string) => readFileSync(root + path, 'utf8');

describe('Entry Editor Unified Logging Hub structure and guards', () => {
  const editor = read('src/lib/components/EntryEditor.svelte');

  it('discloses contextual sections after the chip row and its sections, before the save bar', () => {
    /* Put the note first and folded every structured question - body map included - into a
       chip row under it. The cards are offers rather than questions (ADR-0044), so they
       take no chip and sit where they did relative to the foot: after whatever the person
       opened, before Save. Until this asserted "between Note and Body Map"; body map is now
       a chip's section above the cards. */
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

  it('keeps mode and gender on the page and opens other sections from chips', () => {
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

  it('guards contextual sections behind domain conditions', () => {
    expect(editor).toContain('{#if activeTryout}');
    expect(editor).toContain('{#if scheduleDose &&');
    expect(editor).toContain('{#if recoveringProcedure}');
    expect(editor).toContain('{#if isHrtActive && !effectsQuiet}');
    expect(editor).toContain('cycleTrackingActive');
  });

  it('can star a new entry on any step before the first save', () => {
    /* Before this ticket the star was one of the header's `{#if existing}`
       actions, so a new entry - which never has an id for setEntryStarred
       to write against - could not be starred until after its first save.
       Proven on the source rather than a rendered DOM: the star's own
       markup sits inside <SaveBar>, which this screen always draws, and
       not inside the header's existing-only guard. A new entry's foot is the
       finish control and the way on, so its star is on
       the header's field, behind the stepped guard - checked after this. */
    const saveBarPos = editor.indexOf('<SaveBar>');
    const saveBarEnd = editor.indexOf('</SaveBar>', saveBarPos);
    const starPos = editor.indexOf('data-save-star', saveBarPos);
    expect(saveBarPos).toBeGreaterThan(0);
    expect(starPos).toBeGreaterThan(saveBarPos);
    expect(starPos).toBeLessThan(saveBarEnd);

    const guardOpenBeforeStar = editor.lastIndexOf('{#if existing}', starPos);
    const guardCloseBeforeStar = editor.lastIndexOf('{/if}', starPos);
    expect(guardCloseBeforeStar).toBeGreaterThan(guardOpenBeforeStar);

    const actions = editor.slice(editor.indexOf('{#snippet actions()}'), editor.indexOf('{/snippet}', editor.indexOf('{#snippet actions()}')));
    expect(actions.indexOf('{#if stepped}')).toBeGreaterThanOrEqual(0);
    expect(actions.indexOf('data-save-star')).toBeGreaterThan(actions.indexOf('{#if stepped}'));
  });

  it('a new entry\'s later steps draw marking before writing, with the attachments last', () => {
    const later = (name: string) => {
      const start = editor.indexOf(`{#snippet ${name}()}`);
      return start < 0 ? '' : editor.slice(start, editor.indexOf('{/snippet}', start));
    };
    const parts: [string, string][] = [['marksStep', '{@render modeBlock(true)}'], ['marksStep', '{@render tagPicker()}'],
      ['bodyStep', '{@render bodyPicker()}'], ['bodyStep', '{@render cards()}'],
      ['writingStep', '{@render noteField()}'], ['writingStep', '{@render chipRow(ATTACHMENT_SECTIONS)}'], ['writingStep', '{@render panels(ATTACHMENT_SECTIONS)}']];
    for (const [step, part] of parts) expect(later(step)).toContain(part);
    for (const step of ['marksStep', 'bodyStep', 'writingStep']) {
      const within = parts.filter(([s]) => s === step).map(([, part]) => later(step).indexOf(part));
      expect([...within].sort((a, b) => a - b)).toEqual(within);
    }
    /* The single page draws the same pieces: no second copy of the cards or
       the note exists for the step to drift from. */
    expect(editor.match(/data-contextual="tryout-felt-sense"/g)).toHaveLength(1);
    expect(editor.match(/id="ed-note"/g)).toHaveLength(1);
  });

});
