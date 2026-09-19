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
   range" forks into an on-screen-only value the print side does not see.

   Ticket 08 moved every control named below into the controls sheet, which
   this screen opens rather than scrolls to. They lost their own individual
   `no-print` there for one on the sheet's whole body instead
   (`$lib/print/print.ts`'s own note on why a print that happens to catch
   the sheet open still needs one) - so what this file checks about them
   changed shape without their being any less print-safe. */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('../../../../', import.meta.url));
const page = readFileSync(root + '/src/routes/health/clinician-summary/+page.svelte', 'utf8');

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

  it('every range control - including the new shortcut - sits inside the controls sheet\'s one no-print wrap', () => {
    // Neither carries its own `no-print` any more (ticket 08) - one wrap
    // around the whole sheet body does it for all of them.
    expect(classAttrFor(page, 'cd-endpoints')).not.toContain('no-print');
    expect(classAttrFor(page, 'cd-since-appointment')).not.toContain('no-print');

    const sheetStart = page.indexOf('<Sheet ');
    const wrapStart = page.indexOf('<div class="no-print">', sheetStart);
    const wrapEnd = page.indexOf('cd-endpoints', sheetStart);
    if (sheetStart === -1 || wrapStart === -1 || wrapEnd === -1 || wrapStart > wrapEnd) {
      throw new Error('cd-endpoints is not inside the sheet\'s no-print wrap');
    }
  });

  it('the settings row that opens the sheet is itself no-print', () => {
    expect(classAttrFor(page, 'settings-row-wrap')).toContain('no-print');
  });
});

/* Ticket 34: print preparation stays attached to its chosen scope. The
   action moves into the frame-hosted foot ($lib/components/SaveBar.svelte,
   the arrangement carpet 26 built so nothing sits under a pinned bar at
   any scroll position), with the scope it prints stated beside it, so a
   long preview never separates the reader from either. */
describe('the print foot (ticket 34)', () => {
  it('the action summary and the settings row read one shared scope, not two recomputations', () => {
    /* One derived composes range, selected section names and selected drugs;
       the row wraps it in its own affordance tail. Two separately written sentences
       about the same dossier could drift after an inclusion change - one
       cannot. */
    expect(page).toContain('let scopeText = $derived.by(');
    expect(page).toContain('m.clinician_summary_scope({');
    expect(page).toContain('m.clinician_summary_scope_no_drugs(');
    expect(page).toContain('includedSections.map(clinicianDossierPartName).join');
    expect(page).toContain('includedDrugNames.join');
    expect(page).toContain('m.clinician_summary_settings_row({ scope: scopeText })');
  });

  it('the print action lives in the foot, with its scope line beside it', () => {
    const footStart = page.indexOf('<SaveBar');
    const print = page.indexOf('data-summary-print');
    const footEnd = page.indexOf('</SaveBar>');
    expect(footStart).toBeGreaterThan(-1);
    expect(print).toBeGreaterThan(footStart);
    expect(print).toBeLessThan(footEnd);
  });

  it('nothing in the foot prints - the scope line and the button are both screen-only', () => {
    const foot = page.slice(page.indexOf('<SaveBar'), page.indexOf('</SaveBar>'));
    expect(foot).toMatch(/class="small muted summary-scope no-print"/);
    expect(foot).toMatch(/class="btn btn-primary no-print"/);
  });

  it('the old full-width in-flow print button under the preview is gone', () => {
    expect(page).not.toMatch(/class="btn btn-primary btn-block summary-print/);
  });
});
