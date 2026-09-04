/* One coherent persona: Alice, ~2.5 years into transition. Deterministic
   (seeded PRNG) and generated relative to "today", so the demo never looks
   stale and Reset restores exactly this state.

   Nothing here ships. Every import of this module sits behind `__DEMO__`,
   which vite.config.ts injects as a literal `false` in a production build,
   so Rollup folds the branch and drops this file rather than hiding it in
   the bundle. tests/browser-tier/verify-build.mjs greps the built bundle
   for "Alice" to prove it.

   Its counterpart is vocabulary/builtins.ts, which does ship: the built-in
   vocabulary every real user needs used to live in this same file, which
   is what made the persona impossible to leave out. */

import type { PreferenceValues } from '../prefs/catalogue';
import type { LabResultInput } from '../journal/labs';
import type { TallyEventInput } from '../journal/tally';
import type { EntryInput } from '../journal/entries';
import type { BodyRegionFeeling } from '../types';
import type { MilestoneInput } from '../journal/milestones';
import type { ReminderInput } from '../journal/reminders';
import { demoNow } from './demoClock';
import {
  epochDayFromLocalDate,
  localDateFromEpochDay,
  startOfDayTimestamp,
  todayEpochDay
} from '../epochDay';

/* The one custom tag in the demo, so the tag manager has something to show
   that behaves like a user's own. It used to sit inside the built-in gender
   group carrying `builtIn: false`, which made the shipping vocabulary
   depend on a demo detail. */
const VOICE_PRACTICE = { groupKey: 'gender', label: 'voice practice' };

/** An entry plus how many photos hang off it. The journal mints photo
    identity and stores files, so the persona says how many rather than
    inventing rows (ADR-0002, ADR-0008). */
export interface PersonaEntry extends EntryInput {
  epochDay: number;
  photoCount: number;
  /** Which persona presentation this entry carries, by the name in
      `Persona.presentations` rather than a uuid the persona has no way to
      mint itself (phase 5 deepening ticket 17, ADR-0048) - journal-seed.ts
      resolves it to the real id once the presentation rows exist. Absent on
      most entries: an entry with none is the resting state this feature
      leaves most of the journal in. */
  presentationName?: string;
}

export interface PersonaPresentation {
  name: string;
  roleIndex: number;
}

export interface PersonaMilestone extends MilestoneInput {
  hasPhoto: boolean;
}

export interface Persona {
  customTag: { groupKey: string; label: string };
  presentations: PersonaPresentation[];
  entries: PersonaEntry[];
  milestones: PersonaMilestone[];
  reminders: ReminderInput[];
  labResults: LabResultInput[];
  tallyEvents: TallyEventInput[];
}

function rng(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const NOTES = [
  'Coffee with Marta. She used my name the whole time without a single stumble. I keep replaying it.',
  'Rough morning in front of the mirror. Got better after a walk and a long playlist.',
  'Therapy today. We talked about my dad. Heavy, but I feel lighter tonight.',
  'New blouse from the second-hand shop. The cut actually works. Small win.',
  'Someone said "excuse me, miss" on the tram and I smiled the whole way home.',
  'Tired. Work ran long and I skipped voice practice again.',
  'Laser session #6. Stings, but the shadow is basically gone on my cheeks.',
  'Called the clinic about bloodwork. Results next week.',
  'Bad dysphoria day. Stayed in, ordered pierogi, watched comfort shows. That is allowed.',
  'Picnic with the girls. Photos! I did not hate any of them. Growth.',
  'Voice held steady through a whole phone call with a stranger.',
  'Mum asked how the hormones are going. First time she asked anything. Progress?',
  'Gym went fine. Locker room still scary, but fine.',
  'Rewatched old photos. Two years feels like a different life.',
  'Quiet day. Nothing happened and that was lovely.',
  'Misgendered at the bakery. It rolled off faster than it used to.',
  'Painted my nails a ridiculous pink and I love them.',
  'Long call with Ola about the name-change hearing. Getting real now.',
  '',
  '',
];

function buildEntries(today: number): PersonaEntry[] {
  const r = rng(20240331);
  const entries: PersonaEntry[] = [];
  /* Body-region intensities on most entries (phase 8 features ticket 16).

     /body-map's two charts and the wear trend's second line all read these
     and all drew an empty plot on the demo, so neither screen could be
     reviewed at all - PRODUCT.md's own line is that demo data renders every
     screen. Four regions: the two /body-map opens on and the two the wear
     trend offers.

     Derived from the day rather than from a further draw on `r()`, the same
     rule the presentation below follows: a new call into the generator
     would shift every entry after it, so not one existing mood, note or tag
     moves.

     One arc across the whole journal, dysphoria easing as euphoria rises,
     with a deterministic wobble so a line has texture and a gap every third
     day so it has holes - a region logged on every single entry is not what
     anybody's journal looks like. Nothing here is a claim about how a
     transition goes; it is texture for a screenshot. */
  const REGION_ARC_DAYS = 700;
  const REGION_OFFSETS: Record<string, number> = {
    face_jaw: 0,
    chest: 1,
    hips_waist: 2,
    genitals: 3
  };
  const clampIntensity = (value: number) => Math.max(0, Math.min(100, Math.round(value)));
  const wobble = (day: number, spread: number) => ((day * 37) % (spread * 2 + 1)) - spread;
  const regionArc = (day: number) =>
    Math.max(0, Math.min(1, (day - (today - REGION_ARC_DAYS)) / REGION_ARC_DAYS));
  const bodyRegionsOn = (day: number): Record<string, BodyRegionFeeling> => {
    const progress = regionArc(day);
    const logged: Record<string, BodyRegionFeeling> = {};
    for (const [region, offset] of Object.entries(REGION_OFFSETS)) {
      if ((day + offset) % 3 === 0) continue;
      logged[region] = {
        dysphoria: clampIntensity(86 - progress * 50 + wobble(day + offset, 9)),
        euphoria: clampIntensity(16 + progress * 54 + wobble(day + offset * 3, 9))
      };
    }
    return logged;
  };

  for (let back = 150; back >= 0; back--) {
    const day = today - back;
    const isStreak = back <= 22;
    if (!(isStreak || r() < 0.72)) continue;
    const nEntries = back === 0 ? 1 : r() < 0.12 ? 2 : 1;
    const base = 45 + (150 - back) * 0.14;
    for (let k = 0; k < nEntries; k++) {
      const eu = Math.max(4, Math.min(97, Math.round(base + (r() - 0.5) * 46 + k * 9)));
      const mood = Math.max(1, Math.min(5, Math.round(eu / 22 + r() * 1.3)));
      const fem = Math.max(10, Math.min(98, Math.round(52 + (150 - back) * 0.12 + (r() - 0.5) * 34)));
      const tags: string[] = [];
      if (eu > 66) tags.push(r() < 0.5 ? 'g-soc-eu' : 'g-body-eu');
      if (eu > 74 && r() < 0.6) tags.push('g-gendered-ok');
      if (eu < 34) tags.push(r() < 0.5 ? 'g-soc-dys' : 'g-body-dys');
      if (eu < 25 && r() < 0.3) tags.push('g-misgendered');
      if (mood >= 4) tags.push(r() < 0.5 ? 'e-happy' : 'e-calm');
      if (mood <= 2) tags.push(r() < 0.5 ? 'e-sad' : 'e-anxious');
      if (r() < 0.25) tags.push('e-hopeful');
      const act = ['a-work', 'a-friends', 'a-family', 'a-exercise', 'a-therapy', 'a-shopping', 'a-selfcare'];
      if (r() < 0.7) tags.push(act[Math.floor(r() * act.length)]);
      const hour = k === 0 ? 8 + Math.floor(r() * 5) : 17 + Math.floor(r() * 4);
      const minute = Math.floor(r() * 60);
      const note = NOTES[Math.floor(r() * NOTES.length)];
      // The anchor day's sample entry sits a few hours back so anything
      // logged "now" sorts above it. `demoNow` rather than Date.now() so a
      // seed anchored on an earlier day stays inside that day (demoClock.ts).
      const ts = back === 0 ? demoNow(today) - 3 * 3600000 : startOfDayTimestamp(day) + hour * 3600000 + minute * 60000;
      /* The last three weeks alternate between the persona's two
         presentations (phase 5 deepening ticket 17) - deterministic on
         `back` rather than a further draw from `r()`, so adding this does
         not shift a single existing entry's mood, note or tags. Everything
         before that stays presentationless, which is most of the journal
         and is the resting state this feature leaves untouched entries in. */
      const presentationName = back <= 20 ? (back % 4 < 2 ? 'femme' : 'androgynous') : undefined;
      entries.push({
        epochDay: day,
        timestamp: ts,
        mood,
        note,
        dims: { euphoria_dysphoria: eu, femininity: fem },
        tags: [...new Set(tags)],
        bodyRegions: bodyRegionsOn(day),
        photoCount: r() < 0.1 ? 1 : 0,
        ...(presentationName ? { presentationName } : {})
      });
    }
  }

  /* And the calendar year before last, sparsely.

     The persona seeded 151 days, which is the right density for Home, the
     calendar and the stats ranges - and it meant the one period
     /wrapped/year ever covers, the *previous* calendar year, was empty by
     construction. So the yearly wrapped could not be reviewed at all: it
     drew its entry-floor notice on every build, and the year grid it exists
     to show had nothing to draw (Alicja, 2026-08-25: "how am i supposed to
     see how the yearly wrapped looks like?"). PRODUCT.md's own line is that
     demo data renders every screen.

     Kept separate from the loop above, and deliberately sparser - about two
     days in five, one entry each, no photos. The recent history is what most
     screens are reviewed against and none of its numbers move; this is a
     year with texture in it, which is what a year grid and a year's figures
     need. It stops before the 151-day window so the two never overlap. */
  const lastYear = localDateFromEpochDay(today).getFullYear() - 1;
  const yearStart = epochDayFromLocalDate(new Date(lastYear, 0, 1));
  const yearEnd = Math.min(epochDayFromLocalDate(new Date(lastYear, 11, 31)), today - 151);
  for (let day = yearStart; day <= yearEnd; day++) {
    if (r() < 0.6) continue;
    const season = Math.sin(((day - yearStart) / 365) * Math.PI * 2);
    const eu = Math.max(4, Math.min(97, Math.round(38 + season * 14 + (r() - 0.5) * 40)));
    const mood = Math.max(1, Math.min(5, Math.round(eu / 24 + r() * 1.4)));
    const tags: string[] = [];
    if (eu > 66) tags.push(r() < 0.5 ? 'g-soc-eu' : 'g-body-eu');
    if (eu < 34) tags.push(r() < 0.5 ? 'g-soc-dys' : 'g-body-dys');
    if (mood >= 4) tags.push(r() < 0.5 ? 'e-happy' : 'e-calm');
    if (mood <= 2) tags.push('e-anxious');
    entries.push({
      epochDay: day,
      timestamp: startOfDayTimestamp(day) + (9 + Math.floor(r() * 9)) * 3600000,
      mood,
      note: NOTES[Math.floor(r() * NOTES.length)],
      dims: { euphoria_dysphoria: eu, femininity: Math.max(10, Math.min(98, Math.round(34 + (r() - 0.5) * 30))) },
      tags: [...new Set(tags)],
      bodyRegions: bodyRegionsOn(day),
      photoCount: 0
    });
  }

  return entries;
}

/* The persona's preferences. They live in SQLite now (ticket 06), not in
   the demo store, so they are seeded separately from the rest of the
   persona - only where the table is empty, and only in a demo build.
   Anything left out here stays at the catalogue's default, which is what a
   real first run gets. */
export function demoPreferences(today: number = todayEpochDay()): Partial<PreferenceValues> {
  return {
    onboarded: true,
    name: 'Alice',
    activeScales: ['euphoria_dysphoria', 'femininity'],
    metricKind: 'mood',
    checkInEnabled: true,
    // 34 is asserted on literally by walkthrough.test.mjs flow 10b, which
    // reads the notice's rendered day count to prove it was computed from
    // epoch millis rather than an epoch day. Change the offset there too.
    lastBackupAt: startOfDayTimestamp(today - 34),
  };
}

/** The persona as journal input: no ids anywhere, because the journal mints
    every one of them (ADR-0002). Writing it is journal-seed.ts's job. */
export function persona(today: number = todayEpochDay()): Persona {
  return {
    customTag: VOICE_PRACTICE,
    presentations: [
      { name: 'femme', roleIndex: 0 },
      { name: 'androgynous', roleIndex: 1 }
    ],
    entries: buildEntries(today),
    milestones: [
      {
        name: 'HRT start',
        epochDay: today - 745,
        description: 'The pharmacist barely looked up. I cried in the car after.',
        templateKey: 'hrt_start',
        hasPhoto: true
      },
      { name: 'Coming out to my parents', epochDay: today - 940, templateKey: 'coming_out', hasPhoto: false },
      { name: 'First time presenting publicly', epochDay: today - 512, templateKey: 'first_public', hasPhoto: true },
      { name: 'Name-change hearing', epochDay: today + 16, templateKey: 'name_change', hasPhoto: false },
      { name: 'Voice workshop weekend', epochDay: today + 42, templateKey: null, hasPhoto: false },
    ],
    reminders: [
      { title: 'Estradiol patch', type: 'med', time: '20:00', recurrence: 'EVERY_N_DAYS', interval: 3, anchorEpochDay: today, epochDay: null, enabled: true },
      { title: 'Progesterone', type: 'med', time: '22:00', recurrence: 'DAILY', interval: null, anchorEpochDay: null, epochDay: null, enabled: true },
      { title: 'Endocrinologist', type: 'appointment', time: '09:30', recurrence: null, interval: null, anchorEpochDay: null, epochDay: today + 12, enabled: true },
    ],
    /* Two labs across the estradiol series, which is what raises the
       comparability flag on it: a series folds results together by unit
       alone, and these were not all drawn by the same lab. No timing context
       comes out of this fixture, because the persona has no dose log to
       derive one from - the demo seeds tags, entries, milestones, reminders
       and labs, and nothing else. */
    labResults: [
      { epochDay: today - 700, analyte: 'estradiol', value: 41, unit: 'pg/mL', note: 'baseline', provider: 'Diagnostyka' },
      { epochDay: today - 610, analyte: 'estradiol', value: 96, unit: 'pg/mL', note: '', provider: 'Diagnostyka' },
      { epochDay: today - 430, analyte: 'estradiol', value: 148, unit: 'pg/mL', note: 'dose up', provider: 'ALAB', drawTime: '07:50' },
      { epochDay: today - 250, analyte: 'estradiol', value: 173, unit: 'pg/mL', note: '', provider: 'ALAB', drawTime: '08:10' },
      { epochDay: today - 70, analyte: 'estradiol', value: 165, unit: 'pg/mL', note: 'patches', provider: 'ALAB', drawTime: '07:35' },
      { epochDay: today - 700, analyte: 'testosterone', value: 480, unit: 'ng/dL', note: 'baseline' },
      { epochDay: today - 610, analyte: 'testosterone', value: 120, unit: 'ng/dL', note: '' },
      { epochDay: today - 430, analyte: 'testosterone', value: 38, unit: 'ng/dL', note: '' },
      { epochDay: today - 250, analyte: 'testosterone', value: 24, unit: 'ng/dL', note: '' },
      { epochDay: today - 70, analyte: 'testosterone', value: 27, unit: 'ng/dL', note: '' },
      { epochDay: today - 430, analyte: 'prolactin', value: 14, unit: 'ng/mL', note: '' },
      { epochDay: today - 70, analyte: 'prolactin', value: 17, unit: 'ng/mL', note: '' },
    ],
    tallyEvents: [
      { epochDay: today - 60, kind: 'misgendered' },
      { epochDay: today - 60, kind: 'misgendered' },
      { epochDay: today - 45, kind: 'misgendered' },
      { epochDay: today - 20, kind: 'misgendered' },
      { epochDay: today - 55, kind: 'correctly_gendered' },
      { epochDay: today - 30, kind: 'correctly_gendered' },
      { epochDay: today - 30, kind: 'correctly_gendered' },
      { epochDay: today - 10, kind: 'correctly_gendered' },
    ],
  };
}
