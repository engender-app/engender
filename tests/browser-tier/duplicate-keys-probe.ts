import { flushSync, mount, unmount } from 'svelte';
import PitchFigure from '../../src/lib/components/PitchFigure.svelte';
import DayEntry from '../../src/lib/components/kit/DayEntry.svelte';
import WrappedCompact from '../../src/lib/components/WrappedCompact.svelte';
import WrappedYear from '../../src/lib/components/WrappedYear.svelte';
import WrappedCard from '../../src/lib/components/WrappedCard.svelte';
import ClinicianSummaryDossier from '../../src/lib/components/ClinicianSummaryDossier.svelte';
import { DEFAULT_CLINICIAN_DOSSIER_INCLUSION } from '../../src/lib/data/export/clinicianSummaryData';
import { recapTopTags } from '../../src/lib/data/recapDisplay';
import { DEFAULT_PITCH_AXIS } from '../../src/lib/audio/bands';
import { publish } from '../probe-handshake.mjs';

const cases: { name: string; passed: boolean; error?: string }[] = [];
async function check(name: string, run: (target: HTMLElement) => Promise<boolean>) {
  const target = document.createElement('div');
  document.body.append(target);
  try {
    cases.push({ name, passed: await run(target) });
  } catch (error) {
    cases.push({ name, passed: false, error: String(error) });
  } finally {
    target.remove();
  }
}

const pitch = { axis: DEFAULT_PITCH_AXIS, trace: [], language: null, tickLabel: String };
const equalSpan = { lowHz: 185, highHz: 185 };
for (const [name, extra, selector, expected] of [
  ['equal take span', { span: equalSpan }, '[data-pitch-span]', 2],
  ['equal density span', { span: equalSpan, density: [{ hz: 185, weight: 1 }] }, '[data-density-span]', 2],
  ['equal comfort band', { comfort: equalSpan }, '[data-pitch-comfort] line', 3],
  ['equal clipped middle-band edges', { axis: { lowHz: 1000, highHz: 2000 }, language: 'en' }, '[data-pitch-middle] line', 2],
  ['repeated caller ticks', { ticks: [185, 185] }, '.pf-tick', 2]
] as const) {
  await check(name, async (target) => {
    const instance = mount(PitchFigure, { target, props: { ...pitch, ...extra } });
    flushSync();
    const passed = target.querySelectorAll(selector).length === expected;
    await unmount(instance);
    return passed;
  });
}

await check('repeated entry tags and marks', async (target) => {
  const instance = mount(DayEntry, { target, props: {
    key: 'duplicate-entry', time: '12:00', mood: 3,
    tags: ['social dysphoria', 'social dysphoria'], marks: ['image', 'image']
  } });
  flushSync();
  const passed = target.querySelectorAll('.kit-pill').length === 2 && target.querySelectorAll('.kit-entry-meta svg').length === 2;
  await unmount(instance);
  return passed;
});

const topTags = [
  { id: 'built-in', label: 'social dysphoria', count: 3 },
  { id: 'custom', label: 'social dysphoria', count: 2 }
];
const recap = {
  entryCount: 3, averageMood: 3, topTags, milestones: [],
  biggestDimensionChange: null, photoHighlights: []
};
const trend = [{ day: 20000, value: 3, count: 1 }];
await check('compact wrapped keeps distinct equal-label tags', async (target) => {
  const instance = mount(WrappedCompact, { target, props: {
    title: 'Recap', subtitle: 'Period', recap, moodTrend: trend, dimChange: null, topTags
  } });
  flushSync();
  const passed = [...target.querySelectorAll('[data-wrapped-tags] .tag-chip')].map((node) => node.textContent).join(',') === 'social dysphoria (3),social dysphoria (2)';
  await unmount(instance);
  return passed;
});
await check('year wrapped keeps distinct equal-label tags', async (target) => {
  const instance = mount(WrappedYear, { target, props: {
    year: 2024, intro: 'Year', recap, scaleTrend: trend, dimChange: null, topTags
  } });
  flushSync();
  const passed = [...target.querySelectorAll('[data-wrapped-tags] .tag-chip')].map((node) => node.textContent).join(',') === 'social dysphoria (3),social dysphoria (2)';
  await unmount(instance);
  return passed;
});
await check('wrapped card keeps repeated stat labels', async (target) => {
  const instance = mount(WrappedCard, { target, props: { content: {
    paletteArt: false, stats: [{ label: 'Entries', value: '3' }, { label: 'Entries', value: '2' }]
  } } });
  flushSync();
  const passed = [...target.querySelectorAll('[data-wrapped-stat] strong')].map((node) => node.textContent).join(',') === '3,2';
  await unmount(instance);
  return passed;
});
await check('recap naming preserves tag identities', async () =>
  recapTopTags(recap).map((tag) => 'id' in tag ? tag.id : null).join(',') === 'built-in,custom'
);

await check('clinician dose totals keep distinct tuples with equal joined labels', async (target) => {
  const instance = mount(ClinicianSummaryDossier, { target, props: { dossier: {
    fromEpochDay: 20000, toEpochDay: 20000, generatedAtEpochDay: 20000,
    demographics: null, regimen: null, labs: null, sideEffects: null, cycleEvents: null,
    appointmentPrep: null, procedures: null, finishedAreas: null,
    inclusion: DEFAULT_CLINICIAN_DOSSIER_INCLUSION,
    exposure: {
      doseTotals: [
        { drug: 'a-oral', route: 'oral', doseUnit: 'mg', total: 1 },
        { drug: 'a', route: 'oral', doseUnit: 'oral-mg', total: 2 }
      ],
      routeDays: [], regimenDays: [], excludedDoses: 0
    }
  } } });
  flushSync();
  const passed = [...target.querySelectorAll('[data-dossier-section="exposure"] tbody .num')].map((node) => node.textContent?.trim()).join(',') === '1 mg,2 oral-mg';
  await unmount(instance);
  return passed;
});

publish('duplicate-keys', { cases });
