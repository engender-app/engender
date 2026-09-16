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
import { demoAudioBytes, demoVideoBytes } from '../demoAudioBytes';
import { BUILT_IN_PERSONAL_EFFECT_TYPES } from '../vocabulary/builtins';
import { GARMENT_CATEGORIES } from '../garmentCategories';
import { HAIR_REMOVAL_AREAS } from '../hairRemovalAreas';
import { POLISH_PACK, ROADMAP_TRACKS } from '../roadmap';
import { expectedSessionDays } from '../taperSchedule';
import { encodePitchTrack } from '../../audio/track';
import { percentileOfSorted } from '../../audio/series';
import { acceptDocumentFile } from '../documents/accept';

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
    endEpochDay: null,
    endReason: null
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
    endEpochDay: null,
    endReason: null
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

  // A non-hormone episode - an SSRI, daily, oral - so every screen this
  // track touches (labs timing, the care spine, the clinician summary
  // toggle, quick add's picker) has a real non-hormone branch to render
  // during a demo, not only a unit test (phase 8 features ticket 42).
  // resolveCurveDrug returns null for it: neither ester vocabulary names it.
  const sertralineStart = today - 250;
  const sertralineEpisodeId = await journal.regimen.upsertEpisode({
    drug: 'Sertraline',
    ester: null,
    dose: 50,
    doseUnit: 'mg',
    route: 'oral',
    interval: 'daily',
    startEpochDay: sertralineStart,
    endEpochDay: null,
    endReason: null
  });
  await journal.doses.upsertSchedule({
    episodeId: sertralineEpisodeId,
    recurrence: { kind: 'everyNDays', everyNDays: 1 },
    dosesPerDay: 1,
    doseAmounts: [{ dose: 50, doseUnit: 'mg' }]
  });
  for (let day = sertralineStart; day <= today; day++) {
    if (r() < 0.08) continue;
    await journal.doses.upsertDose({
      timestamp: (day * 24 + 9) * 3_600_000,
      route: 'oral',
      dose: 50,
      doseUnit: 'mg',
      status: 'taken',
      drug: 'Sertraline'
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

  /* One scale per category rather than one pool for all eight. A shuffle
     across every size in the app puts "34" and "XS" in the same pair of
     trousers, which the size log wore quietly and the change line
     (redesign ticket 61) states out loud - so a demo of a screen whose
     point is that it makes a statement was making a nonsense one. */
  const SIZE_SCALE: Record<(typeof GARMENT_CATEGORIES)[number], string[]> = {
    shirts: ['XS', 'S', 'M', 'L'],
    pants: ['28', '30', '32', '34'],
    dresses: ['6', '8', '10', '12'],
    skirts: ['XS', 'S', 'M', 'L'],
    bras: ['32A', '34A', '34B', '36B'],
    underwear: ['XS', 'S', 'M', 'L'],
    shoes: ['38', '39', '40', '41'],
    outerwear: ['S', 'M', 'L', 'XL']
  };
  for (let day = trackingStart; day <= today; day++) {
    if (r() < 0.97) continue;
    const category = pick(GARMENT_CATEGORIES);
    await journal.sizeRecords.upsertRecord({
      epochDay: day,
      category,
      size: pick(SIZE_SCALE[category]),
      brand: pick(['', 'Zara', "Levi's", 'H&M', 'Uniqlo']),
      fitNote: pick(['', 'true to size', 'runs small', 'runs large'])
    });
  }

  // Dilation: a surgery well inside the tracking window, a daily stage
  // easing to every third day, and most - not all - of the expected
  // sessions actually logged, so the gap rendering has something real to
  // show (ticket 12).
  const surgeryEpochDay = today - 200;
  const taperStart = surgeryEpochDay + 5;
  const taper = {
    surgeryEpochDay,
    startEpochDay: taperStart,
    stages: [
      { everyNDays: 1, days: 14 },
      { everyNDays: 3, days: 300 }
    ]
  };
  await journal.taper.upsertTaper(taper);
  for (const day of expectedSessionDays(taper, today)) {
    if (r() < 0.15) continue;
    await journal.taper.upsertSession({ epochDay: day, note: r() < 0.2 ? 'a bit more resistance today' : '' });
  }

  const hairStages = ['1', '2', '2a', '3', '3v', '3a', '4', '4a'];
  let hairPhotoCount = 0;
  for (let day = trackingStart, i = 0; day <= today; day += between(60, 140), i++) {
    await journal.hairProgress.upsertStage({ epochDay: day, scale: 'norwood_hamilton', stage: hairStages[i % hairStages.length] });
    /* One photograph per staging, not a 40% roll. The roll was seeded, so
       it came up the same way every time and that way was never: the demo
       journal had stagings and no fixed-position photographs at all, which
       is the one thing this screen's photo half exists for and the whole
       of what redesign ticket 55 put a wipe over. This loop only runs a
       handful of times - 60 to 140 days a step over the tracked period -
       so anything less than every staging leaves too few to compare.

       The roll it used to be gated on is still drawn and thrown away, so
       everything seeded after this loop lands exactly where it always did.
       Dropping the draw instead would shift the whole rest of the demo
       journal - hair removal, tryouts, procedures - for a change that is
       about this screen. */
    r();
    await journal.hairProgress.addPhoto(day, await demoPhoto(4000 + hairPhotoCount));
    hairPhotoCount++;
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
    /* Readings across the tryout's own span rather than one at its start.
       A single reading is a single mark, which is honest and is also the
       one shape the tryouts index cannot be reviewed against (ticket 53) -
       the screen draws how a tryout has felt over time, and every tryout
       in the fixture having exactly one reading left that undrawable.
       Every twelfth day, so a hundred-day tryout gets nine marks rather
       than a line of them. */
    const lastFeltDay = spec.endEpochDay ?? today;
    for (let day = spec.startEpochDay + 3; day <= lastFeltDay; day += 12) {
      await journal.feltSense.add({ tryoutId }, { epochDay: day, mood: between(1, 5) });
    }
  }

  // Personal effects: several feminizing markers, plus one non-default
  // category switched on so its disclosure group has something in it too.
  await journal.effectCategories.setCategoryEnabled('genital_sexual', true);
  const effectTypes = BUILT_IN_PERSONAL_EFFECT_TYPES.filter((t) => t.direction === 'feminizing').filter((_, i) => i % 3 === 0);
  /* Written out rather than stepped, because the axis at the top of that
     screen (ticket 57) has two shapes to show and an even 45-day step only
     ever produced one of them: four of these land inside three weeks and
     stack into lanes, and the rest stand alone with months between them.
     Which days go to which effect is not arbitrary - only the effects in an
     enabled category are drawn, and with the seed's own categories that is
     entries 0, 1, 2, 3, 5, 10, 11 and 12, so the cluster is theirs and the
     five under a category this seed leaves off take the days between. Past
     the end of the list the old step takes over, so a catalogue that grows
     still seeds a marker for everything it offers. */
  const noticedDays = [18, 61, 143, 149, 152, 158, 200, 210, 220, 230, 165, 371, 470];
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
      firstNoticedEpochDay: Math.min(today, estradiolStart + (noticedDays[i] ?? 30 + i * 45))
    });
  }

  /* Wear sessions: a year, irregular, most backfilled with a duration and
     one still running so the live timer state is reachable too. All three
     kinds, so every per-kind wording and the binder-only duration cue are
     reachable in the demo (ticket 50), off one draw per session rather than
     two - a second conditional draw would spend a different count of the
     seeded sequence depending on the first, and everything seeded after
     this would move with it. */
  const kindFor = (roll: number) => (roll < 0.6 ? 'binder' : roll < 0.8 ? 'tucking' : 'compression');
  for (let day = trackingStart; day <= today - 1; day++) {
    if (r() < 0.55) continue;
    await journal.wearSessions.upsertSession({
      kind: kindFor(r()),
      startTimestamp: (day * 24 + 8) * 3_600_000,
      durationMs: between(2, 8) * 3_600_000,
      note: r() < 0.2 ? 'a bit tight by the end' : null
    });
  }
  // Its elapsed reminder is what ticket 31's web reminders list has to show
  // and delete - the one write that screen offers on web (ADR-0063).
  /* Nine hours in, not two: past the eight-hour figure, so the binder
     duration cue is reachable in the demo on both surfaces that carry it
     (ticket 50). */
  await journal.wearSessions.upsertSession({
    kind: 'binder',
    startTimestamp: now - 9 * 3_600_000,
    durationMs: null,
    reminderHoursAfterStart: 8,
    reminderTitle: 'Binder check-in'
  });

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
  // recovery checklist. `kind` defaults to `custom`, and the dilation gate
  // only reads a `custom` procedure's own opt-in (ticket 17), so this needs
  // it set to be the seed the surgery-journey and dilation screens read.
  const procedureId = await journal.procedures.upsertProcedure({
    name: 'top surgery',
    surgeryEpochDay: today - 400,
    notes: 'Double incision, drains out on day 5.',
    dilationOptIn: true
  });
  await journal.procedures.addConsult(procedureId, today - 460);
  await journal.procedures.addConsult(procedureId, today - 420);
  for (const item of ['buy gauze', 'arrange time off work', 'ask about lifting restrictions']) {
    await journal.procedures.addChecklistItem(procedureId, item);
  }
  await journal.procedures.addPhoto(procedureId, today - 390, await demoPhoto(7000));

  // A document attached to the procedure, kind PDF - so documentGroups.ts
  // has a group to draw beside the persona's own unlinked referral, and the
  // PDF thumbnail path (rather than a photo document's) has something to
  // render. acceptDocumentFile is the real picker path, not a hand-built
  // StoredPdf, so this exercises exactly what a person importing a scan
  // hits - a page pdf.js could fail to render only costs the thumbnail
  // (renderPdfThumbnail swallows that itself), never the document.
  const preOpClearanceId = await journal.documents.addDocument(
    { epochDay: today - 405, title: 'Pre-op clearance' },
    await acceptDocumentFile(demoDocumentPdf('Cleared for surgery.'))
  );
  await journal.documents.setDocumentTarget(preOpClearanceId, { kind: 'procedure', id: procedureId });

  // A second procedure, still ahead of its surgery date with a consult
  // already behind it - `open` (ProcedureRecoveryCard.svelte) is everything
  // but the archived phase, so this is what puts a full-size, still-running
  // rail beside the first procedure's collapsed, archived one.
  const secondProcedureId = await journal.procedures.upsertProcedure({
    name: 'facial feminization surgery',
    kind: 'facial_feminization',
    surgeryEpochDay: today + 60,
    notes: 'Consult went well, surgeon proposed a date.'
  });
  await journal.procedures.addConsult(secondProcedureId, today - 10);

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

  /* Voice benchmarks. Six takes across ten months, because every reading
     on the compare tab is a reading against the person's own earlier takes
     and one benchmark shows none of it: the pitch density, the six
     own-history lines, the pair comparison and the break a change of phone
     puts in a series all need a history behind them (redesign ticket 42).
     Without these the whole tab renders empty and nothing on it can be
     reviewed.

     The figures are computed from the generated track rather than written
     down beside it, so the median and the p10-p90 span land where the
     drawn shape actually puts them - a fixture whose numbers and picture
     disagree would make every figure on this screen unreviewable. */
  for (const take of demoBenchmarks(r, today)) {
    await journal.voiceBenchmarks.saveBenchmark({
      ...take,
      passageKey: 'builtin-en',
      passageAudio: demoAudioBytes(r),
      vowelAudio: take.f1Hz === null ? null : demoAudioBytes(r)
    });
  }

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

  /* Two video notes, which ticket 01 left for this ticket to decide about
     and ticket 14 decided in favour of: a note is in the photo library
     now, so "Fill every feature" has to put one there or the Video chip
     is a control nobody can review.

     Arbitrary bytes rather than a recorded clip, the trade demoAudioBytes
     already makes for a voice recording and for the same reason: nothing
     decodes a note to draw its tile (the library draws a glyph, not a
     still frame), and encoding real WebM here would mean running
     MediaRecorder for the length of the clip on every reset. A reviewer
     who taps play gets a player with nothing to play, exactly as they do
     for the persona's recordings.

     Its own stream rather than the fixture's `r`, because 4000 draws per
     note would shift every roll made after this point: nothing is rolled
     below here today, and a fixture whose contents depend on that staying
     true is a trap for whoever adds the next block. */
  const videoRandom = rng(4242);
  for (const back of [11, 95]) {
    await journal.entries.upsertEntry({
      epochDay: today - back,
      timestamp: now - back * 86_400_000,
      mood: 4,
      note: '',
      dims: {},
      tags: [],
      bodyRegions: {},
      attachVideos: [demoVideoBytes(videoRandom)]
    });
  }

  // Comfort list: who to text, which walk, which song - the editor's own
  // register (comfort_list_item_placeholder).
  for (const text of ['Text Ola', 'Walk by the river', 'Rewatch Steven Universe', 'Call my sister']) {
    await journal.comfortItems.addItem(text);
  }

  /* Two starred entries. The recent one is a guaranteed day (`back <= 22`
     in buildEntries is always written); the older one has no guaranteed
     day, so this reads whatever the persona's sparse previous-year loop
     actually wrote rather than naming a day and hoping - the roll that
     loop makes is real (demo-fixture-seeded-rolls-can-yield-nothing), so a
     named day could easily have written nothing. */
  const recentEntry = (await journal.entries.entriesForDay(today - 5))[0];
  if (recentEntry) await journal.entries.setEntryStarred(recentEntry.id, true);
  const olderEntries = (await journal.entries.recentDays(900)).filter((e) => e.epochDay <= today - 150);
  const goodOldEntry = [...olderEntries].sort((a, b) => (b.mood ?? 0) - (a.mood ?? 0))[0];
  if (goodOldEntry) {
    await journal.entries.setEntryStarred(goodOldEntry.id, true);
    // A note added on rereading - the day is when she looked back, not the
    // entry's own day (ADR-0010).
    await journal.marginNotes.add({
      entryId: goodOldEntry.id,
      epochDay: today,
      text: 'Reading this again - I remember exactly how nervous I was.'
    });
  }

  // Two starred photos: one off an entry, one off a milestone, so both
  // halves of "Letters and photos" draw something (milestoneName is null
  // for an entry-owned photo, DatedPhoto's own convention).
  const journalPhotos = await journal.photos.inJournal();
  const entryPhoto = journalPhotos.find((p) => p.milestoneName === null);
  if (entryPhoto) await journal.photos.setStarred(entryPhoto.id, true);
  const milestonePhoto = journalPhotos.find((p) => p.milestoneName !== null);
  if (milestonePhoto) await journal.photos.setStarred(milestonePhoto.id, true);

  // Saved questions: a query plus its filters, the shape the search
  // screen keeps past closing (savedQuestionQuery.ts). The tag filter is
  // guaranteed hits - g-soc-eu is written across dozens of the persona's
  // own entries - the free-text one is a real search she might keep
  // without needing to be guaranteed anything.
  await journal.savedQuestions.upsertSavedQuestion({
    name: 'Good days',
    queryText: '',
    tagIds: ['g-soc-eu'],
    moods: [],
    startEpochDay: null,
    endEpochDay: null,
    hasNote: false,
    hasPhoto: false
  });
  await journal.savedQuestions.upsertSavedQuestion({
    name: 'Laser progress',
    queryText: 'laser',
    tagIds: [],
    moods: [],
    startEpochDay: null,
    endEpochDay: null,
    hasNote: false,
    hasPhoto: false
  });

  // One custom entry template, alongside whatever built-ins ship.
  await journal.entryTemplates.addEntryTemplate({
    name: 'Hard day',
    tags: ['g-body-dys', 'e-anxious'],
    dims: { euphoria_dysphoria: 20 },
    noteScaffold: 'What was hard today: ',
    presentationId: null
  });

  // One ignored word - "voice" shows up constantly (voice practice, voice
  // workshop, the voice tag) without saying anything about a given day.
  await journal.wordIgnore.setWordIgnored('voice', true);

  // One voice practice take, distinct from the benchmarks above - a
  // practice session has nothing to compare it against (voicePracticeTakes.ts).
  await journal.voicePracticeTakes.addTake({
    epochDay: today - 5,
    minHz: 142,
    maxHz: 214,
    medianHz: 168,
    feltSense: 4
  });

  // One custom affirmation line, beside the built-in pool.
  await journal.affirmations.addLine('en', 'I get to move at my own pace.');
}

/** A minimal, valid one-page PDF (phase 11 ticket 01), built the same way
    tests/pdf-fixture.mjs is - independently, since src/ cannot import from
    tests/: precise object offsets are what make this a file pdf.js will
    actually open, not just a header with bytes after it. */
function demoDocumentPdf(text: string): Uint8Array {
  const objects: string[] = [];
  objects[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  objects[2] = '<< /Type /Pages /Kids [4 0 R] /Count 1 >>';
  objects[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>';
  const stream = `BT /F1 24 Tf 60 760 Td (${text}) Tj ET`;
  objects[4] =
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents 5 0 R >>';
  objects[5] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;

  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [];
  for (let id = 1; id < objects.length; id++) {
    offsets[id] = pdf.length;
    pdf += `${id} 0 obj\n${objects[id]}\nendobj\n`;
  }
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for (let id = 1; id < objects.length; id++) pdf += `${String(offsets[id]).padStart(10, '0')} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;

  const bytes = new Uint8Array(pdf.length);
  for (let i = 0; i < pdf.length; i++) bytes[i] = pdf.charCodeAt(i) & 0xff;
  return bytes;
}

/** The six benchmarks above, as figures.

    One phone for the first four and another for the last two, so the
    compare tab shows what a change of equipment does to a series: the pitch
    figures carry on and the resonance ones stop, which is ADR-0061's rule
    and the one thing about this screen that cannot be seen without a break
    in the data.

    The oldest take held no vowel, so its resonance, room and scale figures
    are absent - the "not measured" arm every one of those blocks has and
    which otherwise never renders. */
function demoBenchmarks(r: () => number, today: number) {
  const CHAINS = [
    'Pixel 7|Microphone|ec=off ns=off agc=off',
    'Pixel 10a|Microphone|ec=off ns=off agc=off'
  ];
  // Ten months of work, oldest first, with the median drifting up through
  // it the way a year of practice does.
  const days = [today - 302, today - 244, today - 171, today - 118, today - 57, today - 9];
  const medians = [148, 154, 163, 172, 181, 189];

  return days.map((epochDay, at) => {
    const frames = demoPitchFrames(r, medians[at]);
    const sorted = [...frames].sort((a, b) => a - b);
    const medianHz = percentileOfSorted(sorted, 0.5);
    let squared = 0;
    for (const hz of frames) squared += (12 * Math.log2(hz / medianHz)) ** 2;
    const vowel = at > 0;

    return {
      epochDay,
      f0MedianHz: medianHz,
      f0P10Hz: percentileOfSorted(sorted, 0.1),
      f0P90Hz: percentileOfSorted(sorted, 0.9),
      semitoneSd: Math.sqrt(squared / frames.length),
      wordsPerMinute: 132 + Math.round(r() * 16),
      f1Hz: vowel ? 604 + Math.round(r() * 40) : null,
      f2Hz: vowel ? 1712 + Math.round(r() * 90) : null,
      snrDb: vowel ? 21 + Math.round(r() * 8) : null,
      resonanceScale: vowel ? 1.02 + r() * 0.1 : null,
      pitchTrack: encodePitchTrack(frames),
      captureChain: CHAINS[at < 4 ? 0 : 1]
    };
  });
}

/** One take's stored track: thirty seconds at the stored four points a
    second, wandering around a median the way read speech does, with the
    occasional dip a sentence ends on. Deterministic, off the fixture's own
    generator. */
function demoPitchFrames(r: () => number, medianHz: number): number[] {
  const points: number[] = [];
  let semitones = 0;
  for (let at = 0; at < 120; at++) {
    // A slow wander with a pull back to the middle, so the read has shape
    // without drifting off the axis over thirty seconds.
    semitones = semitones * 0.82 + (r() - 0.5) * 2.4;
    const ending = at % 17 === 16 ? -2.5 : 0;
    points.push(medianHz * 2 ** ((semitones + ending) / 12));
  }
  return points;
}
