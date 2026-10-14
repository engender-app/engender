import { test } from 'vitest';
import assert from 'node:assert/strict';
import { dateInputValueFromEpochDay, epochDayFromTimestamp, startOfDayTimestamp, timestampAtLocalTime } from './epochDay';
import { doseInputOfDraft, draftOfDose, draftTimestamp, draftWithDrug, newDoseDraft } from './doseDraft';
import type { DoseEvent, RegimenEpisode } from './types';

const TODAY = 20000;
const NOW = startOfDayTimestamp(TODAY) + 9 * 3600000 + 30 * 60000;

const episode = (drug: string, route: string, dose = 4): RegimenEpisode => ({
  id: `episode-${drug}`, drug, ester: null, dose, doseUnit: 'mg', route, interval: 'weekly',
  startEpochDay: TODAY - 100, endEpochDay: null, endReason: null
} as RegimenEpisode);

const injection = {
  id: 'dose-1', timestamp: timestampAtLocalTime(TODAY - 7, '09:30'), route: 'im', dose: 4, doseUnit: 'mg',
  injectionSite: 'thigh-left', vehicle: 'aqueous', status: 'changed',
  scheduled: { dose: 5, route: 'sc', timestamp: timestampAtLocalTime(TODAY - 7, '09:30') - 3600000 }, drug: 'estradiol', source: 'manual'
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

/* The two days the clocks change (after-release ticket 01, L03-03). A typed
   time is a wall-clock time, and adding hours to local midnight lands an
   hour off on both: 23 hours in the spring day, 25 in the autumn one. Run
   with TZ=Europe/Warsaw to exercise it; in a zone with no DST the readback
   is trivially right. */
for (const day of ['2026-03-29', '2026-10-25', '2026-07-15']) {
  test(`a dose typed at 10:00 on ${day} reads back 10:00`, () => {
    const saved = new Date(draftTimestamp(day, '10:00'));
    assert.deepEqual([saved.getHours(), saved.getMinutes()], [10, 0]);
    assert.equal(dateInputValueFromEpochDay(epochDayFromTimestamp(saved.getTime())), day);
  });
}

test('an empty time field still saves the start of the day rather than nothing', () => {
  const saved = new Date(draftTimestamp('2026-10-25', ''));
  assert.deepEqual([saved.getHours(), saved.getMinutes()], [0, 0]);
});

test('saved doses trim unit and drug without dropping topical route or site', () => {
  const base = newDoseDraft({ today: TODAY, now: NOW, activeEpisode: null, expectedAmount: null, doses: [], routeWords: [] });
  for (const route of ['oral', 'sublingual', 'gel', 'patch'] as const) {
    const saved = doseInputOfDraft({ ...base, route, dose: '2', doseUnit: ' mg ', drug: ' estradiol ', applicationSite: 'upperArm' });
    assert.deepEqual(saved, {
      id: undefined, timestamp: NOW, dose: 2, doseUnit: 'mg', status: 'taken', scheduled: null,
      drug: 'estradiol', route, ...((route === 'gel' || route === 'patch') ? { applicationSite: 'upperArm' } : {})
    });
  }
  assert.equal(doseInputOfDraft({ ...base, route: 'nasal' as never, dose: '2' }), null);
});

test('new draft preserves scheduled defaults and prefers the expected unit over the episode unit', () => {
  const known = { today: TODAY, now: NOW, activeEpisode: null, expectedAmount: null, doses: [], routeWords: [] };
  const blank = newDoseDraft(known);
  assert.deepEqual([blank.status, blank.scheduledRoute, blank.scheduledTime, blank.drug], ['taken', 'oral', '09:30', '']);
  const expected = newDoseDraft({ ...known, activeEpisode: episode('estradiol', 'oral'), expectedAmount: { dose: 1, doseUnit: 'g' } });
  assert.equal(expected.doseUnit, 'g');
  assert.equal(newDoseDraft({ ...known, activeEpisode: episode('estradiol', 'oral') }).doseUnit, 'mg');
});

test('editing an unscheduled dose keeps its route and time as changed-dose defaults', () => {
  const unscheduled = { ...injection, scheduled: null } as DoseEvent;
  const draft = draftOfDose(unscheduled);
  assert.deepEqual([draft.scheduledDose, draft.scheduledRoute, draft.scheduledTime], ['4', 'im', '09:30']);
  assert.deepEqual(doseInputOfDraft({ ...draft, status: 'changed' })?.scheduled,
    { dose: 4, route: 'im', timestamp: unscheduled.timestamp });
});

test('editor defaults preserve missing injection vehicle and drug when saved', () => {
  const event = { ...injection, vehicle: null, drug: null, scheduled: null } as DoseEvent;
  const draft = draftOfDose(event);
  assert.deepEqual([draft.vehicle, draft.drug], ['oil', '']);
  const saved = doseInputOfDraft(draft);
  assert.ok(saved && 'vehicle' in saved);
  assert.equal(saved.vehicle, 'oil');
  assert.equal(saved.drug, null);
});

test('editor times pad single-digit minutes before saving a changed dose', () => {
  const event = { ...injection, timestamp: startOfDayTimestamp(TODAY) + 9 * 3600000 + 5 * 60000, scheduled: null } as DoseEvent;
  const draft = draftOfDose(event);
  assert.deepEqual([draft.time, draft.scheduledTime], ['09:05', '09:05']);
  assert.equal(doseInputOfDraft(draft)?.timestamp, event.timestamp);
});

test('blank scheduled amount stays blank until a changed dose uses the actual amount', () => {
  const draft = newDoseDraft({ today: TODAY, now: NOW, activeEpisode: null, expectedAmount: null, doses: [], routeWords: [] });
  assert.equal(draft.scheduledDose, '');
  assert.equal(doseInputOfDraft({ ...draft, dose: '2', status: 'changed' })?.scheduled?.dose, 2);
});
