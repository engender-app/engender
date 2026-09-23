import { test } from 'vitest';
import assert from 'node:assert/strict';
import { dateInputValueFromEpochDay, startOfDayTimestamp } from './epochDay';
import { doseInputOfDraft, draftOfDose, draftTimestamp, draftWithDrug, newDoseDraft } from './doseDraft';
import type { DoseEvent, RegimenEpisode } from './types';

const TODAY = 20000;
const NOW = startOfDayTimestamp(TODAY) + 9 * 3600000 + 30 * 60000;

const episode = (drug: string, route: string, dose = 4): RegimenEpisode => ({
  id: `episode-${drug}`, drug, ester: null, dose, doseUnit: 'mg', route, interval: 'weekly',
  startEpochDay: TODAY - 100, endEpochDay: null, endReason: null
} as RegimenEpisode);

const injection = {
  id: 'dose-1', timestamp: NOW - 7 * 86400000, route: 'im', dose: 4, doseUnit: 'mg',
  injectionSite: 'thigh-left', vehicle: 'aqueous', status: 'changed',
  scheduled: { dose: 5, route: 'sc', timestamp: NOW - 7 * 86400000 - 3600000 }, drug: 'estradiol', source: 'manual'
} as unknown as DoseEvent;

test('a dose opened in the editor saves back as the same dose', () => {
  const draft = draftOfDose(injection);
  assert.equal(draft.time, '09:30');
  assert.equal(draftTimestamp(draft.day, draft.time), injection.timestamp);
  assert.deepEqual(doseInputOfDraft(draft), {
    id: 'dose-1', timestamp: injection.timestamp, route: 'im', dose: 4, doseUnit: 'mg',
    injectionSite: 'thigh-left', vehicle: 'aqueous', status: 'changed',
    scheduled: { dose: 5, route: 'sc', timestamp: injection.timestamp - 3600000 }, drug: 'estradiol'
  });
});

test('a new dose states what the regimen, the schedule and the last injection already know', () => {
  const draft = newDoseDraft({
    today: TODAY, now: NOW, activeEpisode: episode('estradiol', 'intramuscular injection'),
    expectedAmount: { dose: 3, doseUnit: 'mg' }, doses: [injection], routeWords: []
  });
  assert.equal(draft.day, dateInputValueFromEpochDay(TODAY));
  assert.equal(draft.route, 'im');
  assert.equal(draft.dose, '3');
  assert.equal(draft.vehicle, 'aqueous');
  assert.equal(draft.drug, 'estradiol');

  const unknown = newDoseDraft({ today: TODAY, now: NOW, activeEpisode: null, expectedAmount: null, doses: [], routeWords: [] });
  assert.deepEqual([unknown.route, unknown.dose, unknown.doseUnit, unknown.vehicle, unknown.drug], ['oral', '', '', 'oil', '']);
});

test('naming a drug brings its episode amount and route, and a drug with no episode only names itself', () => {
  const blank = newDoseDraft({ today: TODAY, now: NOW, activeEpisode: null, expectedAmount: null, doses: [], routeWords: [] });
  const active = [episode('estradiol', 'oral'), episode('progesterone', 'sublingual', 100)];
  const picked = draftWithDrug(blank, active, 'progesterone', []);
  assert.deepEqual([picked.drug, picked.dose, picked.doseUnit, picked.route], ['progesterone', '100', 'mg', 'sublingual']);
  assert.deepEqual(draftWithDrug(blank, active, 'spironolactone', []), { ...blank, drug: 'spironolactone' });
});

test('a site picker nobody tapped refuses the save, and each route carries only its own fields', () => {
  const base = newDoseDraft({ today: TODAY, now: NOW, activeEpisode: null, expectedAmount: null, doses: [], routeWords: [] });
  const draft = { ...base, dose: '2', doseUnit: 'mg' };
  assert.equal(doseInputOfDraft({ ...draft, route: 'im' }), null);
  assert.equal(doseInputOfDraft({ ...draft, route: 'gel' }), null);
  const gel = doseInputOfDraft({ ...draft, route: 'gel', applicationSite: 'upperArm', injectionSite: 'thigh-left' });
  assert.ok(gel && !('injectionSite' in gel) && !('vehicle' in gel));
  const oral = doseInputOfDraft({ ...draft, applicationSite: 'upperArm' });
  assert.ok(oral && !('applicationSite' in oral));
  assert.equal(oral.drug, null);
  assert.equal(oral.scheduled, null);
});
