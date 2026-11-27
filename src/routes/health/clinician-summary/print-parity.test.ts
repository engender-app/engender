/* Check print parity in source. The appointment shortcut sets the same
   two range fields used on screen. .dossier-output stays visible in
   print and the controls sheet carries no-print on its whole body,
   including when open during printing. */
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
    // Neither carries its own `no-print` any more - one wrap
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

/* Print preparation stays attached to its chosen scope. The action moves into the
   frame-hosted foot ($lib/components/SaveBar.svelte, the arrangement built so nothing sits
   under a pinned bar at any scroll position), with the scope it prints stated beside it, so
   a long preview never separates the reader from either. */
describe('the print foot', () => {
  it('shares included items between summaries and states the range only in the print foot', () => {
    expect(page).toContain('let scopeText = $derived.by(');
    expect(page).toContain('m.clinician_summary_scope({');
    expect(page).toContain('m.clinician_summary_scope_no_drugs(');
    expect(page).toContain('includedSections.map(clinicianSummarySectionName).join');
    expect(page).toContain('includedDrugNames.join');
    expect(page).toContain('m.clinician_summary_settings_row({ scope: settingsScope })');
    expect(page).toContain('drugNames.length > 0 ? `${sectionsScope}. ${drugsScope}` : sectionsScope');
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
