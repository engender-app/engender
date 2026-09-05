<script lang="ts">
  /* What a day looks like, at its three sizes (phase 5 deepening ticket 21).

     The composition is the part of that ticket that needed deciding - a day
     with an entry and nothing else must still look like the screen it was,
     and a day with eleven kinds of record must not read as a database dump -
     and a composition is judged by looking at it. The route cannot be driven
     to those three shapes without seeding three journals, so what this mounts
     is DayRecords.svelte, which is the whole of the screen below its header
     and takes a `DayRecords` as a prop. The component is the real one; what
     the fixture supplies is the day.

     Photographs come through with `fileName: null`, which is the shape the
     demo persona's own placeholders have (types.ts): PhotoThumb draws its
     gradient rather than reaching for a file that no fixture has encrypted.
     What is being looked at here is the row, not the picture in it.

     Two rows read differently here than they do in the app, and it is the
     fixture rather than the rows: a measurement type and a physical change
     are both named from the reference mirror (vocabulary.ts), which only a
     booted journal fills, and `reference` exposes getters precisely so
     nothing outside it can assign one. So those two show their keys -
     `waist`, `skin_softening` - where the app shows "Waist" and "Skin
     softening". The rows' shape is what this page is for.

     tests/day-gallery.mjs drives the selectors below across the three days,
     all 8 palettes and both themes. */
  import DayRecordsView from '$lib/components/DayRecords.svelte';
  import type { DayRecords } from '$lib/data/journal/day';
  import { startOfDayTimestamp } from '$lib/data/epochDay';
  import { activeFlag } from '$lib/theme/activeFlag.svelte';
  import { roleAt } from '$lib/theme/roles';
  import { PALETTES } from '../palettes.mjs';

  const DAY = 20690;

  /* A photo row's own `fileName` is a plain string on every area that owns
     one, but a placeholder has no file - which is a state the demo persona
     already ships and PhotoThumb already draws (types.ts). One helper rather
     than a cast per photograph, so the fixture says "no stored file" once. */
  const noFile = () => null as unknown as string;
  const at = (hour: number, minute = 0) => startOfDayTimestamp(DAY) + (hour * 60 + minute) * 60000;

  const entry = (id: number, hour: number, mood: number, note: string, tags: string[] = []) => ({
    id,
    epochDay: DAY,
    timestamp: at(hour),
    mood,
    note,
    dims: {},
    tags,
    photos: [],
    recordings: [],
    videos: [],
    bodyRegions: {},
    starred: false,
    presentationId: null
  });

  /** Every section empty, so a day names only what it actually holds. */
  const empty = (): DayRecords => ({
    entries: [],
    milestones: [],
    doses: [],
    labResults: [],
    voiceBenchmarks: [],
    measurements: [],
    sizeRecords: [],
    taperSessions: [],
    sideEffects: [],
    personalEffects: [],
    cycleEvents: [],
    tallyEvents: [],
    wearSessions: [],
    feltSense: [],
    hairStages: [],
    hairPhotos: [],
    hairRemovalSessions: [],
    appointments: [],
    procedureRecords: [],
    tryoutPhotos: []
  });

  /* Sparse: one entry and nothing else, which is what most days are and
     what has to look exactly like the screen before this ticket. */
  const sparse: DayRecords = {
    ...empty(),
    entries: [entry(1, 21, 4, 'Long walk after work. Quiet head for once.', ['g-calm'])]
  };

  /* Typical: a day someone logged properly - two entries, the dose, the
     binder, one measurement. Four rows under the card. */
  const typical: DayRecords = {
    ...empty(),
    entries: [
      entry(1, 8, 3, 'Slept badly. Starting slow.'),
      entry(2, 22, 5, 'Coffee with Mira and she just used the right name the whole time.', ['g-euphoria'])
    ],
    doses: [
      {
        id: 'd1',
        timestamp: at(8, 15),
        dose: 4,
        doseUnit: 'mg',
        status: 'taken',
        scheduled: null,
        drug: null,
        route: 'im',
        injectionSite: 'thigh-left',
        vehicle: 'oil'
      }
    ],
    measurements: [{ id: 'm1', type: 'waist', epochDay: DAY, value: 78.5, unit: 'cm' }],
    wearSessions: [{ id: 'w1', startTimestamp: at(9), durationMs: 5_400_000, note: null }],
    tallyEvents: [{ id: 't1', epochDay: DAY, kind: 'correctly_gendered' }]
  };

  /* Maximal: every registered section with something in it, which is the
     shape the ticket says must not read as a database dump. Deliberately
     more than a real day would hold. */
  const maximal: DayRecords = {
    entries: typical.entries,
    milestones: [
      { id: 'ms1', name: 'One year on HRT', epochDay: DAY, description: '', templateKey: null, photo: { id: 'p0', fileName: null, starred: false } }
    ],
    doses: [
      typical.doses[0],
      {
        id: 'd2',
        timestamp: at(21),
        dose: 100,
        doseUnit: 'mg',
        status: 'skipped',
        scheduled: null,
        drug: null,
        route: 'oral'
      }
    ],
    voiceBenchmarks: [
      {
        id: 'vb1',
        epochDay: DAY,
        timestamp: at(7, 40),
        passageKey: 'rainbow',
        passageFileName: 'vb1.webm',
        vowelFileName: null,
        f0MedianHz: 171.4,
        f0P10Hz: 158.2,
        f0P90Hz: 189.6,
        semitoneSd: 2.4,
        wordsPerMinute: 148,
        f1Hz: 620,
        f2Hz: 1810,
        snrDb: 24.5,
        note: null,
        pitchTrack: null,
        captureChain: null,
        resonanceScale: null
      }
    ],
    labResults: [
      {
        id: 'l1',
        epochDay: DAY,
        analyte: 'estradiol',
        value: 184,
        unit: 'pg/mL',
        note: '',
        drawTime: '09:20',
        provider: 'Diagnostyka',
        timing: null
      },
      {
        id: 'l2',
        epochDay: DAY,
        analyte: 'testosterone',
        value: 21,
        unit: 'ng/dL',
        note: '',
        drawTime: '09:20',
        provider: 'Diagnostyka',
        timing: null
      }
    ],
    measurements: [
      { id: 'm1', type: 'waist', epochDay: DAY, value: 78.5, unit: 'cm' },
      { id: 'm2', type: 'hips', epochDay: DAY, value: 99, unit: 'cm' }
    ],
    sizeRecords: [{ id: 's1', epochDay: DAY, category: 'bras', size: '70B', brand: 'Triumph', fitNote: '' }],
    taperSessions: [{ id: 'ts1', epochDay: DAY, note: 'went fine' }],
    sideEffects: [{ id: 'se1', name: 'Headache', severity: 2, epochDay: DAY }],
    personalEffects: [{ id: 'pe1', effect: 'skin_softening', firstNoticedEpochDay: DAY }],
    cycleEvents: [{ id: 'c1', kind: 'spotting', epochDay: DAY }],
    tallyEvents: [
      { id: 't1', epochDay: DAY, kind: 'correctly_gendered' },
      { id: 't2', epochDay: DAY, kind: 'correctly_gendered' },
      { id: 't3', epochDay: DAY, kind: 'misgendered' }
    ],
    wearSessions: [
      { id: 'w1', startTimestamp: at(9), durationMs: 5_400_000, note: null },
      { id: 'w2', startTimestamp: at(19), durationMs: null, note: 'still on' }
    ],
    feltSense: [
      { id: 'f1', epochDay: DAY, mood: 5, note: 'It stopped feeling like a costume.', owner: { kind: 'tryout', id: 'ty1', name: 'Robin' } }
    ],
    hairStages: [{ id: 'hs1', epochDay: DAY, scale: 'norwood_hamilton', stage: '3', description: '' }],
    hairPhotos: [
      { id: 'hp1', epochDay: DAY, fileName: noFile() },
      { id: 'hp2', epochDay: DAY, fileName: noFile() },
      { id: 'hp3', epochDay: DAY, fileName: noFile() }
    ],
    hairRemovalSessions: [
      { id: 'hr1', epochDay: DAY, area: 'chin', method: 'laser', painRating: 3, cost: '250 zł', provider: 'Klinika' }
    ],
    appointments: [
      { id: 'ap1', kind: 'endokrynolog', place: 'Poradnia', procedureId: null, procedureName: null },
      { id: 'ap2', kind: null, place: null, procedureId: 'pr1', procedureName: 'Orchiectomy' }
    ],
    procedureRecords: [
      { id: 'pp1', procedureId: 'pr1', procedureName: 'Orchiectomy', fileName: noFile() },
      { id: 'pp2', procedureId: 'pr1', procedureName: 'Orchiectomy', fileName: noFile() }
    ],
    tryoutPhotos: [
      { id: 'tp1', tryoutId: 'ty1', tryoutLabel: 'Robin', epochDay: DAY, fileName: noFile() }
    ]
  };

  const DAYS: Record<string, DayRecords> = { sparse, typical, maximal };

  let shape = $state('typical');
  let palette = $state('trans');
  let theme = $state('dark');

  $effect(() => {
    document.documentElement.dataset.palette = palette;
    document.documentElement.dataset.theme = theme;
  });

  let records = $derived(DAYS[shape]);
</script>

<div class="stage-controls">
  <select aria-label="Day" bind:value={shape}>
    {#each Object.keys(DAYS) as key (key)}<option value={key}>{key}</option>{/each}
  </select>
  <select aria-label="Palette" bind:value={palette}>
    {#each PALETTES as p (p)}<option value={p}>{p}</option>{/each}
  </select>
  <select aria-label="Theme" bind:value={theme}>
    <option value="dark">dark</option>
    <option value="light">light</option>
  </select>
</div>

<!-- The screen's own frame, so padding, width and the ground under the cards
     are the app's rather than the fixture's. The header and the add button
     belong to the route and are not what this page is for. -->
<div class="screen" data-screen>
  {#key `${shape}-${palette}-${theme}`}
    <DayRecordsView
      epochDay={DAY}
      {records}
      entriesRole={roleAt(activeFlag.roles, 0)}
      alsoRole={roleAt(activeFlag.roles, 1)}
    />
  {/key}
</div>

<style>
  .stage-controls {
    display: flex;
    gap: 8px;
    padding: 8px;
    position: sticky;
    top: 0;
    z-index: 2;
    background: var(--bg);
  }
</style>
