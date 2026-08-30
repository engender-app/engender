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

  it('renders cumulative exposure section', () => {
    expect(dossierComponent).toContain('{#if dossier.exposure}');
    expect(dossierComponent).toContain('data-dossier-section="exposure"');
    expect(dossierComponent).toContain('m.exposure_dose_totals_title()');
    expect(dossierComponent).toContain('m.exposure_route_days_title()');
    expect(dossierComponent).toContain('m.exposure_regimen_days_title()');
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
});
