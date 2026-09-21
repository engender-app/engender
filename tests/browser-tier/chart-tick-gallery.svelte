<script lang="ts">
  /* The readout a chart draws under a pointer, with the line each tick now
     draws under its own name (phase 11 UI/UX ticket 49).

     Three charts, one per grain, because the rule about dating a line is a
     rule about how many days a position stands for: the day grain's
     positions are days and the readout already names them, the week and
     month grains' are buckets and a tick inside one has to say which day it
     was. Every chart carries the same six ticks so the three readouts can
     be read against each other.

     Real everything: `annotationsInRange` places them, `AreaChart` draws
     them, and the words come out of the catalogue the app ships. Only the
     sources are written here rather than read from SQLite, which is the
     seam chartAnnotations.test.ts covers against a real database. */
  import { onMount } from 'svelte';
  import AreaChart from '$lib/components/kit/AreaChart.svelte';
  import ChartCard from '$lib/components/kit/ChartCard.svelte';
  import { annotationsInRange, type ChartAnnotationSource } from '$lib/charts/annotations';
  import { fmtDay } from '$lib/data/dates';
  import { readFlagRoles, roleAt, type Role } from '$lib/theme/roles';
  import { prefs } from '$lib/data/prefs/store.svelte';

  /** Any settled day: nothing here reads a clock, and the marks are placed
      by offset from it so the three grains carry the same six ticks. */
  const BASE = 20100;
  const POSITIONS = 30;

  const GRAINS = [
    { key: 'day', step: 1, heading: 'Day by day' },
    { key: 'week', step: 7, heading: 'Week by week' },
    { key: 'month', step: 30, heading: 'Month by month' }
  ] as const;

  /** Where each tick sits, as a position index. Five stand alone and three
      share the last one, which is the gathered mark the readout's cap and
      its "and N more" exist for. */
  const AT = { milestone: 5, surgery: 10, appointment: 15, era: 20, bare: 25, gathered: 28 };

  /** A day inside the bucket at `index` but not the day the bucket is named
      after, wherever the bucket is wide enough to have one: that is the
      difference the dated line is there to close. */
  const dayIn = (index: number, step: number) => BASE + index * step + (step > 1 ? 2 : 0);

  function sources(step: number): ChartAnnotationSource[] {
    return [
      {
        id: 'milestone',
        kind: 'milestone',
        name: 'First injection',
        startEpochDay: dayIn(AT.milestone, step),
        endEpochDay: null,
        detail: { type: 'note', text: 'hands shook the whole time, and then they did not' }
      },
      {
        id: 'surgery',
        kind: 'surgery',
        name: 'Top surgery',
        startEpochDay: dayIn(AT.surgery, step),
        endEpochDay: null,
        detail: { type: 'note', text: 'two nights in, home on the third' }
      },
      {
        id: 'appointment',
        kind: 'appointment',
        name: 'endocrinologist',
        startEpochDay: dayIn(AT.appointment, step),
        endEpochDay: null,
        detail: { type: 'note', text: 'bring the last two lab sheets' }
      },
      {
        id: 'era',
        kind: 'era',
        name: 'First year',
        startEpochDay: dayIn(AT.era, step),
        endEpochDay: null
      },
      /* Nothing written behind it, which has to read exactly as it did
         before this line existed. */
      {
        id: 'bare',
        kind: 'milestone',
        name: 'Name change filed',
        startEpochDay: dayIn(AT.bare, step),
        endEpochDay: null
      },
      /* One day carrying three, which is where the two-annotation cap and
         the count for the rest are read. */
      {
        id: 'gathered-effect',
        kind: 'sideEffect',
        name: 'headaches',
        startEpochDay: dayIn(AT.gathered, step),
        endEpochDay: null,
        detail: { type: 'severity', severity: 3 }
      },
      {
        id: 'gathered-injection',
        kind: 'injection',
        name: 'estradiol valerate',
        startEpochDay: dayIn(AT.gathered, step),
        endEpochDay: null,
        detail: { type: 'dose', amount: 4, unit: 'mg', site: 'thigh-left' }
      },
      {
        id: 'gathered-milestone',
        kind: 'milestone',
        name: 'Six months',
        startEpochDay: dayIn(AT.gathered, step),
        endEpochDay: null,
        detail: { type: 'note', text: 'counted it on the way home' }
      }
    ];
  }

  const series = (step: number) =>
    Array.from({ length: POSITIONS }, (_, i) => ({
      x: BASE + i * step,
      y: 52 + 22 * Math.sin(i / 3.4) + 9 * Math.sin(i / 1.3)
    }));

  const charts = GRAINS.map((grain) => ({
    ...grain,
    points: series(grain.step),
    annotations: annotationsInRange(sources(grain.step), {
      from: BASE,
      to: BASE + POSITIONS * grain.step,
      today: BASE + POSITIONS * grain.step
    })
  }));

  let roles = $state<Role[]>([]);

  onMount(() => {
    /* Disguise arrives in the address rather than through a control on the
       page: it is a preference the component reads for itself, and a switch
       here would be one more thing in every screenshot. */
    prefs.disguise = new URLSearchParams(location.search).get('disguise') === '1';

    roles = readFlagRoles();
    const observer = new MutationObserver(() => (roles = readFlagRoles()));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-palette', 'data-theme'] });
    return () => observer.disconnect();
  });
</script>

<div class="screen">
  {#each charts as chart, i (chart.key)}
    <ChartCard heading={chart.heading} kind={chart.key} role={roleAt(roles, i)}>
      <AreaChart
        points={chart.points}
        annotations={chart.annotations}
        ariaLabel="{chart.heading}, with what was happening around it"
        from={fmtDay(BASE, { day: 'numeric', month: 'short' })}
        to={fmtDay(BASE + POSITIONS * chart.step, { day: 'numeric', month: 'short' })}
        scrubLabel={(point) =>
          fmtDay(point.x, chart.step > 27 ? { month: 'long' } : { day: 'numeric', month: 'short' })}
      />
    </ChartCard>
  {/each}
</div>
