/* Demo seed — one coherent persona: Alice, ~2.5 years into transition.
   Deterministic (seeded PRNG) and generated relative to "today", so the demo
   never looks stale and Reset restores exactly this state. */

import type { DB, GenderDimension, GenderPreset, MilestoneTemplate, TagGroup } from '../types';

const DAY = 86400000;
export const todayEpochDay = () =>
  Math.floor((Date.now() - new Date().getTimezoneOffset() * 60000) / DAY);

function rng(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const builtInDimensions: GenderDimension[] = [
  { key: 'euphoria_dysphoria', name: 'Gender feeling', low: 'dysphoria', high: 'euphoria', min: 0, max: 100, builtIn: true },
  { key: 'femininity', name: 'Femininity', low: 'not at all', high: 'very', min: 0, max: 100, builtIn: true },
  { key: 'masculinity', name: 'Masculinity', low: 'not at all', high: 'very', min: 0, max: 100, builtIn: true },
  { key: 'binary_nonbinary', name: 'Binary ↔ nonbinary', low: 'binary', high: 'nonbinary', min: 0, max: 100, builtIn: true },
  { key: 'agender_gendered', name: 'Agender ↔ gendered', low: 'agender', high: 'gendered', min: 0, max: 100, builtIn: true },
];

export const builtInPresets: GenderPreset[] = [
  { id: 'p-btw', name: 'Binary trans woman', builtIn: true, dims: ['euphoria_dysphoria', 'femininity'] },
  { id: 'p-nb', name: 'Nonbinary — bigender', builtIn: true, dims: ['euphoria_dysphoria', 'femininity', 'masculinity', 'binary_nonbinary', 'agender_gendered'] },
];

export const milestoneTemplates: MilestoneTemplate[] = [
  { key: 'hrt_start', name: 'HRT start' },
  { key: 'transition_start', name: 'Transition start' },
  { key: 'coming_out', name: 'Coming out' },
  { key: 'first_appointment', name: 'First appointment' },
  { key: 'name_change', name: 'Name change' },
  { key: 'marker_change', name: 'Legal gender-marker change' },
  { key: 'surgery', name: 'Surgery' },
  { key: 'first_public', name: 'First time presenting publicly' },
];

const seedTagGroups: TagGroup[] = [
  {
    key: 'gender', name: 'Gender', enabled: true, builtIn: true,
    tags: [
      { id: 'g-soc-dys', label: 'social dysphoria', builtIn: true, hidden: false },
      { id: 'g-body-dys', label: 'body dysphoria', builtIn: true, hidden: false },
      { id: 'g-soc-eu', label: 'social euphoria', builtIn: true, hidden: false },
      { id: 'g-body-eu', label: 'body euphoria', builtIn: true, hidden: false },
      { id: 'g-transphobia', label: 'experienced transphobia', builtIn: true, hidden: false },
      { id: 'g-gendered-ok', label: 'gendered correctly', builtIn: true, hidden: false },
      { id: 'g-misgendered', label: 'misgendered', builtIn: true, hidden: false },
      { id: 'g-voice', label: 'voice practice', builtIn: false, hidden: false },
    ],
  },
  {
    key: 'emotions', name: 'Emotions', enabled: true, builtIn: true,
    tags: [
      { id: 'e-happy', label: 'happy', builtIn: true, hidden: false },
      { id: 'e-calm', label: 'calm', builtIn: true, hidden: false },
      { id: 'e-anxious', label: 'anxious', builtIn: true, hidden: false },
      { id: 'e-sad', label: 'sad', builtIn: true, hidden: false },
      { id: 'e-hopeful', label: 'hopeful', builtIn: true, hidden: false },
      { id: 'e-tired', label: 'tired', builtIn: true, hidden: false },
    ],
  },
  {
    key: 'activities', name: 'Activities', enabled: true, builtIn: true,
    tags: [
      { id: 'a-work', label: 'work', builtIn: true, hidden: false },
      { id: 'a-friends', label: 'friends', builtIn: true, hidden: false },
      { id: 'a-family', label: 'family', builtIn: true, hidden: false },
      { id: 'a-exercise', label: 'exercise', builtIn: true, hidden: false },
      { id: 'a-therapy', label: 'therapy', builtIn: true, hidden: false },
      { id: 'a-shopping', label: 'shopping', builtIn: true, hidden: false },
      { id: 'a-selfcare', label: 'self-care', builtIn: true, hidden: false },
    ],
  },
];

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

function buildEntries(): DB['entries'] {
  const r = rng(20240331);
  const today = todayEpochDay();
  const entries: DB['entries'] = [];
  let id = 1;
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
      const photos = r() < 0.1 ? [{ id: 'ph' + id, hue: Math.floor(r() * 360), label: 'Photo' }] : [];
      // Today's sample entry sits a few hours back so anything logged "now" sorts above it.
      const ts = back === 0 ? Date.now() - 3 * 3600000 : day * DAY + hour * 3600000 + minute * 60000;
      entries.push({ id: id++, epochDay: day, timestamp: ts, mood, note, dims: { euphoria_dysphoria: eu, femininity: fem }, tags: [...new Set(tags)], photos });
    }
  }
  return entries;
}

export function seed(): DB {
  const today = todayEpochDay();
  return {
    version: 1,
    prefs: {
      onboarded: true,
      name: 'Alice',
      activePreset: 'p-btw',
      colorMetric: 'mood',
      theme: 'light',
      palette: 'trans',
      language: 'en',
      appLock: false,
      lockOnLeave: false,
      disguise: false,
      quickExit: false,
      checkIn: { enabled: true, time: '21:00' },
      autoExport: { enabled: false, schedule: 'weekly' },
      lastBackupAt: (today - 34) * DAY,
      backupNoticeDismissed: false,
    },
    dimensions: builtInDimensions.map((d) => ({ ...d })),
    customPresets: [],
    tagGroups: JSON.parse(JSON.stringify(seedTagGroups)),
    entries: buildEntries(),
    milestones: [
      { id: 'm1', name: 'HRT start', epochDay: today - 745, kind: 'anniversary', templateKey: 'hrt_start', photo: { id: 'mp1', hue: 205, label: 'Photo' } },
      { id: 'm2', name: 'Coming out to my parents', epochDay: today - 940, kind: 'anniversary', templateKey: 'coming_out', photo: null },
      { id: 'm3', name: 'First time presenting publicly', epochDay: today - 512, kind: 'anniversary', templateKey: 'first_public', photo: { id: 'mp3', hue: 330, label: 'Photo' } },
      { id: 'm4', name: 'Name-change hearing', epochDay: today + 16, kind: 'countdown', templateKey: 'name_change', photo: null },
      { id: 'm5', name: 'Voice workshop weekend', epochDay: today + 42, kind: 'countdown', templateKey: null, photo: null },
    ],
    reminders: [
      { id: 'r1', title: 'Estradiol patch', type: 'med', time: '20:00', recurrence: 'EVERY_3_DAYS', enabled: true },
      { id: 'r2', title: 'Progesterone', type: 'med', time: '22:00', recurrence: 'DAILY', enabled: true },
      { id: 'r3', title: 'Endocrinologist', type: 'appointment', time: '09:30', recurrence: null, onceInDays: 12, enabled: true },
    ],
    labResults: [
      { id: 'l1', epochDay: today - 700, analyte: 'estradiol', value: 41, unit: 'pg/mL', note: 'baseline' },
      { id: 'l2', epochDay: today - 610, analyte: 'estradiol', value: 96, unit: 'pg/mL', note: '' },
      { id: 'l3', epochDay: today - 430, analyte: 'estradiol', value: 148, unit: 'pg/mL', note: 'dose up' },
      { id: 'l4', epochDay: today - 250, analyte: 'estradiol', value: 173, unit: 'pg/mL', note: '' },
      { id: 'l5', epochDay: today - 70, analyte: 'estradiol', value: 165, unit: 'pg/mL', note: 'patches' },
      { id: 'l6', epochDay: today - 700, analyte: 'testosterone', value: 480, unit: 'ng/dL', note: 'baseline' },
      { id: 'l7', epochDay: today - 610, analyte: 'testosterone', value: 120, unit: 'ng/dL', note: '' },
      { id: 'l8', epochDay: today - 430, analyte: 'testosterone', value: 38, unit: 'ng/dL', note: '' },
      { id: 'l9', epochDay: today - 250, analyte: 'testosterone', value: 24, unit: 'ng/dL', note: '' },
      { id: 'l10', epochDay: today - 70, analyte: 'testosterone', value: 27, unit: 'ng/dL', note: '' },
      { id: 'l11', epochDay: today - 430, analyte: 'prolactin', value: 14, unit: 'ng/mL', note: '' },
      { id: 'l12', epochDay: today - 70, analyte: 'prolactin', value: 17, unit: 'ng/mL', note: '' },
    ],
  };
}
