/* Print parity for the "since last appointment" range (ticket 19, What to
   Build #3 and its own Acceptance Criteria: "Everything shown in the range
   reaches the print"). The screen has no separate print path - it hides
   its controls under `.no-print` and prints whatever `.dossier-output`
   already renders on screen - so this is a contract test over the source,
   the same style ClinicianSummaryDossier.test.ts already uses for a
   component this suite cannot mount: it proves the one element that
   carries the range's content is never marked `no-print` and never hidden
   under `@media print`, and that the shortcut this ticket adds writes into
   the same two fields the range is already read from - nothing about "the
   range" forks into an on-screen-only value the print side does not see. */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('../../../../', import.meta.url));
const page = readFileSync(root + '/src/routes/settings/clinician-summary/+page.svelte', 'utf8');

/** The nearest `class="..."` attribute value that names `className` as one
    of its classes, wherever in the attribute it falls. */
function classAttrFor(source: string, className: string): string {
  const match = source.match(new RegExp(`class="([^"]*\\b${className}\\b[^"]*)"`));
  if (!match) throw new Error(`no element with class "${className}" found`);
  return match[1];
}

describe('clinician summary print parity', () => {
  it('drives the dossier from the same startInput/endInput the range control fields bind', () => {
    expect(page).toContain('bind:value={startInput}');
    expect(page).toContain('bind:value={endInput}');
    expect(page).toContain(
      'let range = $derived(\n    customInclusiveRange(epochDayFromDateInputValue(startInput), epochDayFromDateInputValue(endInput))\n  );'
    );
  });

  it('the since-last-appointment shortcut sets the same two fields, not a separate range', () => {
    expect(page).toContain('function useSinceLastAppointment()');
    expect(page).toContain('startInput = dateInputValueFromEpochDay(appointmentDate);');
    expect(page).toContain('endInput = todayInput;');
  });

  it('the dossier output is never marked no-print', () => {
    expect(classAttrFor(page, 'dossier-output')).not.toContain('no-print');
  });

  it('the dossier output has no @media print override that hides it', () => {
    const printBlock = page.slice(page.indexOf('@media print'));
    expect(printBlock).not.toMatch(/\.dossier-output\s*{[^}]*display:\s*none/);
  });

  it('every range control - including the new shortcut - is marked no-print', () => {
    expect(classAttrFor(page, 'cd-endpoints')).toContain('no-print');
    expect(classAttrFor(page, 'cd-since-appointment')).toContain('no-print');
  });
});
