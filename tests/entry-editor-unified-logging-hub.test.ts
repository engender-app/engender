/* Entry Editor Unified Logging Hub structural and integration verification (Phase 5 Deepening Ticket 04, ADR-0040). */

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
});
