import { beforeEach, describe, expect, it } from 'vitest';
import { journalWithBuiltIns } from '../journal/test-support';
import type { Journal } from '../journal/journal';
import { assembleClinicianDossier } from './clinicianSummaryData';

let journal: Journal;

beforeEach(async () => {
  const support = await journalWithBuiltIns();
  journal = support.journal;

  // Seed test data across areas
  await journal.regimen.upsertEpisode({
    drug: 'Estradiol Valerate',
    ester: null,
    dose: 4,
    doseUnit: 'mg',
    route: 'im',
    interval: 'every 7 days',
    startEpochDay: 19000,
    endEpochDay: null
  });

  await journal.doses.upsertDose({
    timestamp: 19000 * 86400 * 1000 + 10 * 3600 * 1000,
    drug: 'Estradiol Valerate',
    dose: 4,
    doseUnit: 'mg',
    route: 'im',
    status: 'taken',
    injectionSite: 'thigh-left',
    vehicle: 'oil'
  });

  // Future episode that should not be marked as current for range 19000-19010
  await journal.regimen.upsertEpisode({
    drug: 'Progesterone',
    ester: null,
    dose: 100,
    doseUnit: 'mg',
    route: 'oral',
    interval: 'daily',
    startEpochDay: 19050,
    endEpochDay: null
  });

  await journal.labs.upsertResult({
    epochDay: 19005,
    analyte: 'estradiol',
    value: 180,
    unit: 'pg/mL',
    provider: 'LabCorp',
    drawTime: '09:30'
  });

  await journal.sideEffects.upsertSideEffect({
    epochDay: 19002,
    name: 'Mild fatigue',
    severity: 2
  });

  await journal.cycleEvents.upsertCycleEvent({
    epochDay: 19003,
    kind: 'spotting'
  });

  await journal.checklists.addToStandaloneChecklist('Discuss lab results and dosage');
});

describe('assembleClinicianDossier', () => {
  it('assembles complete clinical dossier with default inclusion', async () => {
    const dossier = await assembleClinicianDossier(journal, {
      fromEpochDay: 19000,
      toEpochDay: 19010,
      demographics: {
        name: 'Alex Doe',
        dob: '1995-05-15',
        pronouns: 'they/them'
      }
    });

    expect(dossier.fromEpochDay).toBe(19000);
    expect(dossier.toEpochDay).toBe(19010);

    // Demographics
    expect(dossier.demographics).toEqual({
      name: 'Alex Doe',
      dob: '1995-05-15',
      pronouns: 'they/them'
    });

    // Regimen - current excludes future episode starting at 19050
    expect(dossier.regimen).not.toBeNull();
    expect(dossier.regimen!.current).toHaveLength(1);
    expect(dossier.regimen!.current[0].drug).toBe('Estradiol Valerate');
    expect(dossier.regimen!.doses).toHaveLength(1);

    // Exposure
    expect(dossier.exposure).not.toBeNull();
    expect(dossier.exposure!.doseTotals).toHaveLength(1);

    // Labs
    expect(dossier.labs).not.toBeNull();
    expect(dossier.labs!).toHaveLength(1);
    expect(dossier.labs![0].analyte).toBe('estradiol');

    // Side Effects
    expect(dossier.sideEffects).not.toBeNull();
    expect(dossier.sideEffects!).toHaveLength(1);

    // Cycle Events
    expect(dossier.cycleEvents).not.toBeNull();
    expect(dossier.cycleEvents!).toHaveLength(1);
    expect(dossier.cycleEvents![0].kind).toBe('spotting');

    // Appointment Prep
    expect(dossier.appointmentPrep).not.toBeNull();
    expect(dossier.appointmentPrep!).toHaveLength(1);
  });

  it('redacts unselected sections by setting them to null', async () => {
    const dossier = await assembleClinicianDossier(journal, {
      fromEpochDay: 19000,
      toEpochDay: 19010,
      inclusion: {
        demographics: false,
        sideEffects: false,
        appointmentPrep: false,
        cycleEvents: false
      }
    });

    expect(dossier.demographics).toBeNull();
    expect(dossier.sideEffects).toBeNull();
    expect(dossier.cycleEvents).toBeNull();
    expect(dossier.appointmentPrep).toBeNull();

    // Still includes what was left true
    expect(dossier.regimen).not.toBeNull();
    expect(dossier.exposure).not.toBeNull();
    expect(dossier.labs).not.toBeNull();
  });

  it('resolves pronouns from active pronoun tryout if unset in demographics', async () => {
    await journal.tryouts.upsertTryout({
      kind: 'pronouns',
      label: 'she/her',
      startEpochDay: 18990,
      endEpochDay: null
    });

    const dossier = await assembleClinicianDossier(journal, {
      fromEpochDay: 19000,
      toEpochDay: 19010,
      demographics: {
        name: 'Alicja'
      }
    });

    expect(dossier.demographics?.pronouns).toBe('she/her');
  });
});
