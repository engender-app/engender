import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('../../..', import.meta.url));
const dossierComponent = readFileSync(
  root + '/src/lib/components/ClinicianSummaryDossier.svelte',
  'utf8'
);
const printCss = readFileSync(
  root + '/src/lib/styles/clinician-print.css',
  'utf8'
);

describe('ClinicianSummaryDossier component contract', () => {
  it('defines Props interface with ClinicianDossier', () => {
    expect(dossierComponent).toContain('interface Props');
    expect(dossierComponent).toContain('dossier: ClinicianDossier');
  });

  it('renders patient demographics section when present', () => {
    expect(dossierComponent).toContain('{#if dossier.demographics}');
    expect(dossierComponent).toContain('data-dossier-section="demographics"');
    expect(dossierComponent).toContain('m.clinician_summary_name_label()');
    expect(dossierComponent).toContain('m.clinician_summary_pronouns_label()');
    expect(dossierComponent).toContain('m.clinician_summary_dob_label()');
  });

  it('renders regimen and dosage history section with tables', () => {
    expect(dossierComponent).toContain('{#if dossier.regimen}');
    expect(dossierComponent).toContain('data-dossier-section="regimen"');
    expect(dossierComponent).toContain('m.clinician_summary_current_regimen()');
    expect(dossierComponent).toContain('m.clinician_summary_past_regimen()');
    expect(dossierComponent).toContain('m.clinician_summary_dose_history()');
  });

  it('prints an ended episode\'s end reason as a clause on its own date range, when one is set (ticket 43)', () => {
    expect(dossierComponent).toContain('m.clinician_summary_regimen_end_reason(');
    expect(dossierComponent).toContain('ep.endReason');
  });

  /* Ticket 67: restores the record-linking ticket 09's rewrite dropped when
     the flat, static rows became a printed table. */
  it('links every regimen and dose row back to its own record', () => {
    expect(dossierComponent).toContain('href={`/care/regimen#${ep.id}`}');
    expect(dossierComponent).toContain('href={`/care/doses#${dose.id}`}');
    expect(dossierComponent).toContain('class="dossier-row-link"');
  });

  /* Phase 11 ticket 11: a dose a schedule wrote on the person's behalf is
     marked where it leaves the device, and the mark is explained in words
     rather than left as a symbol a reader has to guess at. */
  it('marks an auto-logged dose in the dose table and explains the mark in a legend', () => {
    expect(dossierComponent).toContain("dose.source === 'schedule'");
    expect(dossierComponent).toContain('data-dose-auto-logged');
    expect(dossierComponent).toContain('data-dossier-auto-logged-legend');
    expect(dossierComponent).toContain('m.clinician_summary_auto_logged_legend()');
  });

  it('prints the auto-logged legend rather than hiding it with the screen-only notes', () => {
    // `.dossier-truncate-note` is `.no-print` in the markup; this one is a
    // fact about the rows a clinician is reading and has no such class.
    expect(printCss).toContain('.dossier-footnote {');
    expect(dossierComponent).toContain('class="dossier-footnote"');
    expect(dossierComponent).not.toContain('class="dossier-footnote no-print"');
  });

  it('renders cumulative exposure section', () => {
    expect(dossierComponent).toContain('{#if dossier.exposure}');
    expect(dossierComponent).toContain('data-dossier-section="exposure"');
    expect(dossierComponent).toContain('m.exposure_dose_totals_title()');
    expect(dossierComponent).toContain('m.exposure_route_days_title()');
    expect(dossierComponent).toContain('m.exposure_regimen_days_title()');
  });

  it('labels route and regimen days with explicit medication-days unit and concurrency note', () => {
    expect(dossierComponent).toContain('data-dossier-route-days-note');
    expect(dossierComponent).toContain('m.exposure_route_days_note()');
    expect(dossierComponent).toContain('m.exposure_medication_days_count(');
    expect(dossierComponent).toContain('data-dossier-regimen-days-note');
    expect(dossierComponent).toContain('m.exposure_regimen_days_note()');
  });

  it('renders lab results with post-dose timing badge', () => {
    expect(dossierComponent).toContain('{#if dossier.labs}');
    expect(dossierComponent).toContain('data-dossier-section="labs"');
    expect(dossierComponent).toContain('m.clinician_summary_timing_header()');
    expect(dossierComponent).toContain('class="dossier-timing-badge"');
  });

  it('renders side effects and cycle events sections', () => {
    expect(dossierComponent).toContain('{#if dossier.sideEffects}');
    expect(dossierComponent).toContain('data-dossier-section="sideEffects"');
    expect(dossierComponent).toContain('{#if dossier.cycleEvents}');
    expect(dossierComponent).toContain('data-dossier-section="cycleEvents"');
    expect(dossierComponent).toContain('cycleEventKindName(event.kind)');
  });

  it('renders a side effect left blank as "not specified", never a bare severity of null', () => {
    expect(dossierComponent).toContain('effect.severity === null');
    expect(dossierComponent).toContain('m.clinician_summary_not_set()');
  });

  it('renders appointment prep consultation questions', () => {
    expect(dossierComponent).toContain('{#if dossier.appointmentPrep}');
    expect(dossierComponent).toContain('data-dossier-section="appointmentPrep"');
  });

  it('includes clinical disclaimer', () => {
    expect(dossierComponent).toContain('m.clinician_summary_disclaimer()');
  });
});

describe('clinician-print.css contract', () => {
  it('defines clean layout rules for screen and print', () => {
    expect(printCss).toContain('.clinician-dossier');
    expect(printCss).toContain('.dossier-table');
    expect(printCss).toContain('@media print');
  });

  it('contains break-inside avoid and break-after avoid for orphan prevention', () => {
    expect(printCss).toContain('break-inside: avoid');
    expect(printCss).toContain('break-after: avoid');
    expect(printCss).toContain('page-break-inside: avoid');
  });

  it('enforces high-contrast monochrome styles in print mode', () => {
    expect(printCss).toContain('color: #000000');
    expect(printCss).toContain('background: #ffffff');
  });

  it('drops the row-link affordance in print, without removing the link itself', () => {
    expect(printCss).toContain('.dossier-row-link');
    const printBlock = printCss.slice(printCss.indexOf('@media print'));
    expect(printBlock).toMatch(/\.dossier-row-link\s*{[^}]*text-decoration:\s*none/);
  });
});

/* Ticket 08: every section's table shows its first rows on screen and every
   row in print. The floor is 12 (the ticket's own proposal, kept - see the
   component's own comment on PREVIEW_ROW_FLOOR for why). */
describe('ClinicianSummaryDossier preview truncation (ticket 08)', () => {
  it('sets the row floor to twelve', () => {
    expect(dossierComponent).toContain('const PREVIEW_ROW_FLOOR = 12;');
  });

  /* One `dossier-row-overflow` mark per table this dossier draws - current
     regimen, past regimen, dose log, the three exposure tables, labs, side
     effects, cycle events, appointment prep, procedures and finished areas.
     A count rather than one assertion per table so a table added later that
     forgets the mark fails loudly instead of silently passing everything
     else. */
  it('marks every table row past the floor as an overflow row, on all twelve of the dossier\'s tables', () => {
    const marks = dossierComponent.match(/class:dossier-row-overflow={i >= PREVIEW_ROW_FLOOR}/g) ?? [];
    expect(marks.length).toBe(12);
  });

  it('reports a table\'s overflow through the same helper everywhere, one call per table', () => {
    const calls = dossierComponent.match(/overflowCount\(/g) ?? [];
    // Once per table to compute the count, once more to render the note.
    expect(calls.length).toBe(24);
  });

  it('renders the truncation note through one shared snippet, screen-only', () => {
    expect(dossierComponent).toContain('{#snippet truncateNote(hidden: number)}');
    expect(dossierComponent).toContain('m.clinician_summary_section_truncated({ count: hidden })');
    expect(dossierComponent).toContain('class="dossier-truncate-note no-print"');
  });

  it('hides an overflow row until print, where it becomes a real table row', () => {
    expect(printCss).toContain('.dossier-row-overflow');
    expect(printCss).toMatch(/\.dossier-row-overflow\s*{\s*display:\s*none;\s*}/);
    const printBlock = printCss.slice(printCss.indexOf('@media print'));
    expect(printBlock).toMatch(/\.dossier-row-overflow\s*{[^}]*display:\s*table-row/);
  });
});
