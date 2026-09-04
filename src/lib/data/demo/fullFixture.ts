/* The "fill every feature" persona (phase 5 ticket 36).

   The persona (persona.ts) writes entries, moods, tags, photos, milestones,
   reminders, labs and tally events - which is what most of the app is
   reviewed against, and what the walkthrough asserts specific facts about
   (150 days of entries, five estradiol results, and so on). Everything else
   the More hub links to - regimen, measurements, sizes, hair progress, hair
   removal, roadmap, letters, tryouts, personal effects, wear sessions,
   cycle events, side effects, surgery, appointment prep, stock, voice -
   stayed empty, which is the gap ticket 25's sign-off review ran into
   (Alicja, 2026-08-26: "add a ticket for expanding the long journal
   fixture so that all features can be checked before final sign off of
   redesign - regimens, curves, everything needs to be filled out").

   Layered on top of the persona rather than replacing it, through a second
   demo-bar control (controls.ts's resetDemoFull) - the persona's own reset
   stays exactly as it was, so a reviewer can still see every one of these
   screens in its designed empty state, and the walkthrough's assumptions
   about the persona never see this module at all. */

import type { Journal } from '../journal/journal';
import { todayEpochDay, weekdayOfEpochDay } from '../epochDay';
import { demoPhoto } from './journal-seed';
import { demoNow } from './demoClock';
import { demoAudioBytes } from '../demoAudioBytes';
import { BUILT_IN_PERSONAL_EFFECT_TYPES } from '../vocabulary/builtins';
import { GARMENT_CATEGORIES } from '../garmentCategories';
import { HAIR_REMOVAL_AREAS } from '../hairRemovalAreas';
import { POLISH_PACK, ROADMAP_TRACKS } from '../roadmap';

function rng(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export async function seedFullFixture(journal: Journal, today: number = todayEpochDay()): Promise<void> {
  const now = demoNow(today);
  const r = rng(90210);
  const pick = <T>(from: readonly T[]): T => from[Math.floor(r() * from.length)];
  const between = (low: number, high: number) => low + Math.floor(r() * (high - low + 1));

  // Regimen: two concurrently active episodes, an injectable estradiol run
  // and an oral progesterone one overlapping it - the shape ticket 38's
  // concurrent-episode handling exists for, with real doses on both so the
  // adherence view and the hormone curve both have something to read.
  const estradiolStart = today - 500;
  const estradiolEpisodeId = await journal.regimen.upsertEpisode({
    drug: 'Estradiol valerate',
    ester: 'valerate',
    dose: 4,
    doseUnit: 'mg',
    route: 'im',
    interval: 'weekly',
    startEpochDay: estradiolStart,
    endEpochDay: null
  });
  await journal.doses.upsertSchedule({
    episodeId: estradiolEpisodeId,
    recurrence: { kind: 'weekdays', weekdays: [0] },
    dosesPerDay: 1,
    doseAmounts: [{ dose: 4, doseUnit: 'mg' }]
  });
  const injectionSites = ['thigh-left', 'thigh-right', 'deltoid-left', 'deltoid-right', 'ventrogluteal-left', 'ventrogluteal-right'] as const;
  let injectionCount = 0;
  for (let day = estradiolStart; day <= today; day++) {
    if (weekdayOfEpochDay(day) !== 0) continue;
    if (r() < 0.07) continue;
    await journal.doses.upsertDose({
      timestamp: (day * 24 + 19) * 3_600_000,
      route: 'im',
      dose: 4,
      doseUnit: 'mg',
      status: 'taken',
      drug: 'Estradiol valerate',
      injectionSite: injectionSites[injectionCount % injectionSites.length],
      vehicle: 'oil'
    });
    injectionCount++;
  }

  const progesteroneStart = today - 300;
  const progesteroneEpisodeId = await journal.regimen.upsertEpisode({
    drug: 'Progesterone',
    ester: null,
    dose: 100,
    doseUnit: 'mg',
    route: 'oral',
    interval: 'daily',
    startEpochDay: progesteroneStart,
    endEpochDay: null
  });
  await journal.doses.upsertSchedule({
    episodeId: progesteroneEpisodeId,
    recurrence: { kind: 'everyNDays', everyNDays: 1 },
    dosesPerDay: 1,
    doseAmounts: [{ dose: 100, doseUnit: 'mg' }]
  });
  for (let day = progesteroneStart; day <= today; day++) {
    if (r() < 0.08) continue;
    await journal.doses.upsertDose({
      timestamp: (day * 24 + 22) * 3_600_000,
      route: 'oral',
      dose: 100,
      doseUnit: 'mg',
      status: 'taken',
      drug: 'Progesterone'
    });
  }

  // Measurements, sizes, hair progress and hair removal: a year each, at
  // an irregular cadence rather than an evenly spaced one - the one shape
  // every chart already handles.
  const trackingStart = today - 365;
  const measurementTypes = ['waist', 'hips', 'chest', 'underbust'] as const;
  const measurementBase = { waist: 78, hips: 92, chest: 88, underbust: 74 };
  for (let day = trackingStart; day <= today; day++) {
    if (r() < 0.94) continue;
    const type = pick(measurementTypes);
    const unit = type === 'waist' && r() < 0.15 ? 'in' : 'cm';
    const base = measurementBase[type];
    const value = unit === 'in' ? Math.round(base / 2.54) : base + Math.round((r() - 0.5) * 6);
    await journal.measurements.upsertMeasurement({ type, epochDay: day, value, unit });
  }
  // A guaranteed second unit on waist - the random 15% above makes it rare
  // enough that a run can land on zero or one 'in' reading, which draws as
  // "two measurements make a trend, add another" rather than a trend.
  await journal.measurements.upsertMeasurement({ type: 'waist', epochDay: today - 200, value: 31, unit: 'in' });
  await journal.measurements.upsertMeasurement({ type: 'waist', epochDay: today - 40, value: 30, unit: 'in' });

  for (let day = trackingStart; day <= today; day++) {
    if (r() < 0.97) continue;
    await journal.sizeRecords.upsertRecord({
      epochDay: day,
      category: pick(GARMENT_CATEGORIES),
      size: pick(['XS', 'S', 'M', 'L', '32', '34', '36', '8', '10']),
      brand: pick(['', 'Zara', "Levi's", 'H&M', 'Uniqlo']),
      fitNote: pick(['', 'true to size', 'runs small', 'runs large'])
    });
  }

  const hairStages = ['1', '2', '2a', '3', '3v', '3a', '4', '4a'];
  let hairPhotoCount = 0;
  for (let day = trackingStart, i = 0; day <= today; day += between(60, 140), i++) {
    await journal.hairProgress.upsertStage({ epochDay: day, scale: 'norwood_hamilton', stage: hairStages[i % hairStages.length] });
    if (r() < 0.4) {
      await journal.hairProgress.addPhoto(day, await demoPhoto(4000 + hairPhotoCount));
      hairPhotoCount++;
    }
  }

  let hairRemovalPhotoCount = 0;
  for (let day = trackingStart; day <= today; day++) {
    if (r() < 0.95) continue;
    const sessionId = await journal.hairRemoval.upsertSession({
      epochDay: day,
      area: pick(HAIR_REMOVAL_AREAS),
      method: pick(['laser', 'electrolysis', 'other'] as const),
      painRating: between(1, 5),
      cost: r() < 0.7 ? `${between(150, 450)} PLN` : '',
      provider: r() < 0.7 ? 'Klinika Laserowa' : ''
    });
    if (r() < 0.25) {
      await journal.hairRemoval.addPhoto(sessionId, await demoPhoto(5000 + hairRemovalPhotoCount));
      hairRemovalPhotoCount++;
    }
  }

  // Roadmap: a few ticks across every track, plus one custom goal.
  for (const track of ROADMAP_TRACKS) {
    for (const goal of POLISH_PACK.goals.filter((g) => g.track === track)) {
      if (r() < 0.65) continue;
      await journal.roadmap.setGoalStatus(POLISH_PACK.key, goal.key, r() < 0.85 ? 'checked' : 'not-my-path');
    }
  }
  const customGoal = await journal.roadmap.addCustomGoal('social', 'Tell my sister');
  await journal.roadmap.setCustomGoalStatus(customGoal.id, 'checked');

  // Letters: two already unlockable, two still sealed.
  await journal.letters.addLetter({ epochDay: today - 400, text: 'Dear future me, HRT starts next month.', unlockEpochDay: today - 200 });
  await journal.letters.addLetter({ epochDay: today - 150, text: 'One year in and the mirror is different now.', unlockEpochDay: today - 5 });
  await journal.letters.addLetter({ epochDay: today - 20, text: 'For the day the court hearing is scheduled.', unlockEpochDay: today + 45 });
  await journal.letters.addLetter({ epochDay: today - 3, text: 'For five years from now.', unlockEpochDay: today + 1800 });

  // Tryouts: dated inside the persona's own 150-day entry window, so the
  // detail route has real entries to read back by date overlap.
  const tryoutSpecs: { kind: 'name' | 'pronouns' | 'style' | 'garment' | 'makeup' | 'presentation_step'; label: string; startEpochDay: number; endEpochDay: number | null }[] = [
    { kind: 'name', label: 'Alex', startEpochDay: today - 120, endEpochDay: today - 60 },
    { kind: 'pronouns', label: 'she/her', startEpochDay: today - 100, endEpochDay: null },
    { kind: 'style', label: 'layered look', startEpochDay: today - 40, endEpochDay: today - 10 }
  ];
  for (const spec of tryoutSpecs) {
    const tryoutId = await journal.tryouts.upsertTryout({
      kind: spec.kind,
      label: spec.label,
      description: spec.kind === 'name' ? null : `Notes on trying out ${spec.label}.`,
      startEpochDay: spec.startEpochDay,
      endEpochDay: spec.endEpochDay
    });
    await journal.tryouts.addPhoto(tryoutId, spec.startEpochDay + 5, await demoPhoto(6000 + spec.startEpochDay));
    await journal.feltSense.add({ tryoutId }, { epochDay: spec.startEpochDay + 3, mood: between(2, 5) });
  }

  // Personal effects: several feminizing markers, plus one non-default
  // category switched on so its disclosure group has something in it too.
  await journal.effectCategories.setCategoryEnabled('genital_sexual', true);
  const effectTypes = BUILT_IN_PERSONAL_EFFECT_TYPES.filter((t) => t.direction === 'feminizing').filter((_, i) => i % 3 === 0);
  for (const [i, type] of effectTypes.entries()) {
    /* Clamped to the seed's own last day. The unclamped progression runs
       past it - 30 + 45 * 11 is 495 days into a 500-day run, so the twelfth
       marker landed 25 days ahead of the fixture's own "today" and wrote a
       "first noticed" day in the future. Harmless while `today` was the real
       clock, because every read of it is bounded by today; not harmless once
       a seed can be anchored earlier (returnGap.ts), where that one row was
       the newest write in the journal and closed the five-week gap the whole
       seed exists to create. */
    await journal.personalEffects.upsertMarker({
      effect: type.key,
      firstNoticedEpochDay: Math.min(today, estradiolStart + 30 + i * 45)
    });
  }

  // Wear sessions: a year, irregular, most backfilled with a duration and
  // one still running so the live timer state is reachable too.
  for (let day = trackingStart; day <= today - 1; day++) {
    if (r() < 0.55) continue;
    await journal.wearSessions.upsertSession({
      startTimestamp: (day * 24 + 8) * 3_600_000,
      durationMs: between(2, 8) * 3_600_000,
      note: r() < 0.2 ? 'a bit tight by the end' : null
    });
  }
  await journal.wearSessions.upsertSession({ startTimestamp: now - 2 * 3_600_000, durationMs: null });

  // Cycle events: roughly monthly over two years.
  for (let day = today - 730; day <= today; day += between(24, 34)) {
    await journal.cycleEvents.upsertCycleEvent({ kind: pick(['period_occurred', 'spotting', 'nothing_this_month'] as const), epochDay: day });
  }

  // Side effects: a handful spread over the last two years.
  const sideEffectNames = ['hot flashes', 'nausea', 'breast tenderness', 'headache', 'fatigue', 'mood swings'];
  for (let i = 0; i < 8; i++) {
    await journal.sideEffects.upsertSideEffect({ name: pick(sideEffectNames), severity: between(1, 5), epochDay: today - 730 + Math.floor((i / 8) * 730) });
  }

  // Surgery: one procedure, dated in the past, with consults, notes and a
  // recovery checklist.
  const procedureId = await journal.procedures.upsertProcedure({
    name: 'top surgery',
    surgeryEpochDay: today - 400,
    notes: 'Double incision, drains out on day 5.'
  });
  await journal.procedures.addConsult(procedureId, today - 460);
  await journal.procedures.addConsult(procedureId, today - 420);
  for (const item of ['buy gauze', 'arrange time off work', 'ask about lifting restrictions']) {
    await journal.procedures.addChecklistItem(procedureId, item);
  }
  await journal.procedures.addPhoto(procedureId, today - 390, await demoPhoto(7000));

  // Appointment prep: a standalone checklist, unrelated to the procedure's.
  for (const item of ['ask about spironolactone dose', 'bring lab results', 'question about hair removal referral']) {
    await journal.checklists.addToStandaloneChecklist(item);
  }

  // Stock: current supply for the two drugs in regimen. The vial carries an
  // opened date and an in-use window (ticket 13), past it on purpose - the
  // demo persona is the one place "past it, with no adjective" gets seen.
  await journal.stock.upsertEntry({
    drug: 'Estradiol valerate',
    quantity: 6,
    unit: 'mL',
    recordedEpochDay: today - 3,
    openedEpochDay: today - 40,
    inUseWindowDays: 28
  });
  await journal.stock.upsertEntry({
    drug: 'Progesterone',
    quantity: 40,
    unit: 'tablets',
    recordedEpochDay: today - 3,
    openedEpochDay: today - 3,
    inUseEndEpochDay: today + 60
  });

  // Voice: two new mood-only entries carrying a recording, so the compare
  // picker has a pair to work with.
  await journal.entries.upsertEntry({
    epochDay: today - 4,
    timestamp: now - 4 * 86_400_000,
    mood: 3,
    note: '',
    dims: {},
    tags: [],
    bodyRegions: {},
    attachRecordings: [demoAudioBytes(r)]
  });
  await journal.entries.upsertEntry({
    epochDay: today - 60,
    timestamp: now - 60 * 86_400_000,
    mood: 4,
    note: '',
    dims: {},
    tags: [],
    bodyRegions: {},
    attachRecordings: [demoAudioBytes(r)]
  });
}
