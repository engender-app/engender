import { test } from 'vitest';
import assert from 'node:assert/strict';
import {
  drawInstant,
  drawUpperBound,
  labTimingFor,
  seriesComparability,
  selectTimingDose,
  type CandidateDose
} from './labTiming';
import { startOfDayTimestamp, timestampAtLocalTime } from './epochDay';
import type { LabResult, LabTiming, RegimenEpisode } from './types';

const DAY = 20000;

const at = (epochDay: number, time: string) => timestampAtLocalTime(epochDay, time);

test('a draw with a recorded time measures to that instant; one without has none', () => {
  assert.equal(drawInstant({ epochDay: DAY, drawTime: '07:40' }), at(DAY, '07:40'));
  assert.equal(drawInstant({ epochDay: DAY, drawTime: null }), null);
});

test('the dose cut-off is the draw itself when timed, the end of the draw day when not', () => {
  assert.equal(drawUpperBound({ epochDay: DAY, drawTime: '07:40' }), at(DAY, '07:40'));
  assert.equal(drawUpperBound({ epochDay: DAY, drawTime: null }), startOfDayTimestamp(DAY + 1) - 1);
});

test('an oral dose gives hours since that dose', () => {
  const timing = labTimingFor(
    { epochDay: DAY, drawTime: '08:00' },
    { timestamp: at(DAY - 1, '20:00'), route: 'oral' }
  );
  assert.deepEqual(timing, { route: 'oral', hoursSinceDose: 12 });
});

test('the hours figure keeps its fraction, because sublingual peaks inside two hours', () => {
  const timing = labTimingFor(
    { epochDay: DAY, drawTime: '09:30' },
    { timestamp: at(DAY, '08:00'), route: 'sublingual' }
  );
  assert.deepEqual(timing, { route: 'sublingual', hoursSinceDose: 1.5 });
});

test('patch and gel are hours routes too, not day-of-interval ones', () => {
  for (const route of ['patch', 'gel'] as const) {
    const timing = labTimingFor({ epochDay: DAY, drawTime: '10:00' }, { timestamp: at(DAY, '06:00'), route });
    assert.deepEqual(timing, { route, hoursSinceDose: 4 });
  }
});

test('an injection gives day-of-interval, counting the injection day as day 1', () => {
  for (const route of ['im', 'sc'] as const) {
    assert.deepEqual(labTimingFor({ epochDay: DAY, drawTime: '09:00' }, { timestamp: at(DAY, '07:00'), route }), {
      route,
      dayOfInterval: 1
    });
    assert.deepEqual(labTimingFor({ epochDay: DAY, drawTime: '09:00' }, { timestamp: at(DAY - 4, '07:00'), route }), {
      route,
      dayOfInterval: 5
    });
  }
});

/* The two halves of "no misleading figure". An injection's position is a
   count of days and survives a draw nobody timed; an hours figure does not
   exist without one, and 0 or "since midnight" would both be inventions. */
test('an untimed draw still places an injection in its interval', () => {
  assert.deepEqual(labTimingFor({ epochDay: DAY, drawTime: null }, { timestamp: at(DAY - 2, '07:00'), route: 'im' }), {
    route: 'im',
    dayOfInterval: 3
  });
});

/* The trough-then-inject pattern: blood drawn in the morning, the injection
   given later the same day. With no draw time nothing records which came
   first, and the two readings are not a rounding apart - they are "day 1"
   and "day 15", which is the whole meaning of the figure. */
test('an untimed draw sharing its day with the dose has no figure to give', () => {
  assert.equal(labTimingFor({ epochDay: DAY, drawTime: null }, { timestamp: at(DAY, '19:00'), route: 'im' }), null);
});

test('a timed draw is ordered against a same-day dose normally', () => {
  assert.deepEqual(labTimingFor({ epochDay: DAY, drawTime: '20:00' }, { timestamp: at(DAY, '19:00'), route: 'im' }), {
    route: 'im',
    dayOfInterval: 1
  });
});

test('an untimed draw has no hours figure rather than a made-up one', () => {
  assert.equal(labTimingFor({ epochDay: DAY, drawTime: null }, { timestamp: at(DAY, '07:00'), route: 'oral' }), null);
});

test('a draw with no dose before it has no timing context at all', () => {
  assert.equal(labTimingFor({ epochDay: DAY, drawTime: '08:00' }, null), null);
});

// ---------------------------------------------------------------------------
// selectTimingDose
// ---------------------------------------------------------------------------

const episode = (over: Partial<RegimenEpisode> = {}): RegimenEpisode => ({
  id: 'e',
  drug: 'estradiol',
  ester: null,
  dose: 2,
  doseUnit: 'mg',
  route: 'oral',
  interval: 'daily',
  startEpochDay: DAY - 100,
  endEpochDay: null,
  ...over
});

const dose = (over: Partial<CandidateDose> = {}): CandidateDose => ({
  timestamp: at(DAY - 1, '20:00'),
  route: 'oral',
  drug: null,
  ...over
});

test('a concurrent non-hormone dose never supplies an estradiol draw its timing', () => {
  /* Two concurrent episodes name their doses' drug explicitly (types.ts) -
     that's what breaks the tie a drug-less dose could not resolve here. */
  const episodes = [episode({ drug: 'estradiol' }), episode({ id: 'e2', drug: 'sertraline' })];
  const doses = [
    dose({ timestamp: at(DAY, '07:00'), drug: 'sertraline' }),
    dose({ timestamp: at(DAY - 1, '20:00'), drug: 'estradiol' })
  ];
  assert.deepEqual(selectTimingDose('estradiol', doses, episodes), doses[1]);
});

test('a concurrent second hormone still counts when it names the same curve drug', () => {
  const episodes = [episode({ drug: 'estradiol' })];
  const doses = [dose({ timestamp: at(DAY, '07:00'), drug: 'estradiol valerate' })];
  assert.deepEqual(selectTimingDose('estradiol', doses, episodes), doses[0]);
});

test('no dose of the right drug at all yields null, same as no dose whatsoever', () => {
  const episodes = [episode({ drug: 'sertraline' })];
  const doses = [dose({ timestamp: at(DAY, '07:00'), drug: 'sertraline' })];
  assert.equal(selectTimingDose('estradiol', doses, episodes), null);
  assert.equal(selectTimingDose('estradiol', [], episodes), null);
});

/* A journal that never logged a regimen episode has nothing for
   attributeDrug to resolve a drug-less dose against - `{ drug: null,
   ambiguous: false }`, its pre-existing "nothing to attribute" case - and
   that is not the same as a dose attributed to some other drug. Losing this
   would break every journal that logs doses without ever logging an episode. */
test('a dose with no episode to attribute it against still supplies timing', () => {
  assert.deepEqual(selectTimingDose('estradiol', [dose()], []), dose());
});

/* The other half: when two concurrent episodes for different drugs leave a
   drug-less dose ambiguous (regimenEpisode.ts), that is not an honest match
   either, and is excluded on the same footing as the case above - not
   treated as a positive attribution to the analyte's own drug. */
test('a dose left ambiguous by concurrent episodes does not supply timing', () => {
  const episodes = [episode({ drug: 'estradiol' }), episode({ id: 'e2', drug: 'sertraline' })];
  assert.equal(selectTimingDose('estradiol', [dose()], episodes), null);
});

test('an analyte with no curve drug draws no timing, whatever the doses say', () => {
  const episodes = [episode({ drug: 'estradiol' })];
  const doses = [dose({ timestamp: at(DAY, '07:00') })];
  assert.equal(selectTimingDose('prolactin', doses, episodes), null);
  assert.equal(selectTimingDose('vitamin d', doses, episodes), null);
});

// ---------------------------------------------------------------------------
// Comparability
// ---------------------------------------------------------------------------

const result = (over: Partial<LabResult> = {}): LabResult => ({
  id: 'r',
  epochDay: DAY,
  analyte: 'estradiol',
  value: 400,
  unit: 'pmol/L',
  note: '',
  drawTime: null,
  provider: '',
  timing: null,
  ...over
});

const timed = (timing: LabTiming, provider = ''): LabResult => result({ timing, provider });

test('a series whose points agree on every axis is not flagged', () => {
  assert.deepEqual(
    seriesComparability([
      timed({ route: 'im', dayOfInterval: 7 }, 'Diagnostyka'),
      timed({ route: 'im', dayOfInterval: 7 }, 'Diagnostyka')
    ]),
    []
  );
});

test('a single point has nothing to disagree with', () => {
  assert.deepEqual(seriesComparability([timed({ route: 'im', dayOfInterval: 7 }, 'Diagnostyka')]), []);
});

test('different interval positions are flagged', () => {
  assert.deepEqual(
    seriesComparability([timed({ route: 'im', dayOfInterval: 3 }), timed({ route: 'im', dayOfInterval: 10 })]),
    ['position']
  );
});

test('different routes are flagged, and take their position with them', () => {
  assert.deepEqual(
    seriesComparability([timed({ route: 'im', dayOfInterval: 3 }), timed({ route: 'oral', hoursSinceDose: 3 })]),
    ['position', 'route']
  );
});

test('different providers are flagged', () => {
  assert.deepEqual(
    seriesComparability([
      timed({ route: 'im', dayOfInterval: 7 }, 'Diagnostyka'),
      timed({ route: 'im', dayOfInterval: 7 }, 'ALAB')
    ]),
    ['provider']
  );
});

/* Two draws half an hour either side of the same hour are the same position
   as far as this flag is concerned. Comparing the raw fraction would flag
   every series of oral results that exists, which would make the flag mean
   nothing. */
test('hours figures within the same hour count as the same position', () => {
  assert.deepEqual(
    seriesComparability([
      timed({ route: 'oral', hoursSinceDose: 11.7 }),
      timed({ route: 'oral', hoursSinceDose: 12.2 })
    ]),
    []
  );
  assert.deepEqual(
    seriesComparability([
      timed({ route: 'oral', hoursSinceDose: 8.1 }),
      timed({ route: 'oral', hoursSinceDose: 12.2 })
    ]),
    ['position']
  );
});

/* Not knowing is not disagreeing, on either axis. Every result logged before
   this feature existed has no timing and no provider, and a flag that fired
   on those would be on permanently and say nothing about comparability. */
test('a point with no timing does not disagree with one that has it', () => {
  assert.deepEqual(seriesComparability([timed({ route: 'im', dayOfInterval: 7 }), result()]), []);
});

test('a blank provider does not disagree with a named one', () => {
  assert.deepEqual(
    seriesComparability([timed({ route: 'im', dayOfInterval: 7 }, 'Diagnostyka'), timed({ route: 'im', dayOfInterval: 7 })]),
    []
  );
});

test('providers are compared as typed, with no matching across spellings', () => {
  assert.deepEqual(
    seriesComparability([
      timed({ route: 'im', dayOfInterval: 7 }, 'Diagnostyka'),
      timed({ route: 'im', dayOfInterval: 7 }, 'diagnostyka')
    ]),
    ['provider']
  );
});

test('surrounding whitespace on a provider is not a disagreement', () => {
  assert.deepEqual(
    seriesComparability([
      timed({ route: 'im', dayOfInterval: 7 }, 'Diagnostyka'),
      timed({ route: 'im', dayOfInterval: 7 }, '  Diagnostyka ')
    ]),
    []
  );
});
