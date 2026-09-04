<script lang="ts">
  /* Every surface and every chart in the kit (phase 5 ticket 20), on one
     page, at phone width, against the real tokens.

     A fixture rather than a route: the kit has no screen to live on until
     the screen tickets land, and a component nobody can look at is a
     component nobody has reviewed. The strings here are the fixture's own -
     shipped copy is a message key, and what the charts should be headed is
     the copy tickets' to decide, so these stand in without pretending to be
     decisions.

     tests/kit-gallery.mjs drives this page across all 8 palettes and both
     themes for the screenshot grid. */
  import { onMount } from 'svelte';
  import AreaChart from '$lib/components/kit/AreaChart.svelte';
  import BarRows from '$lib/components/kit/BarRows.svelte';
  import BareStrip from '$lib/components/kit/BareStrip.svelte';
  import ChartCard from '$lib/components/kit/ChartCard.svelte';
  import ChartPicker from '$lib/components/kit/ChartPicker.svelte';
  import DayCard from '$lib/components/kit/DayCard.svelte';
  import DayEntry from '$lib/components/kit/DayEntry.svelte';
  import Distribution from '$lib/components/kit/Distribution.svelte';
  import Donut from '$lib/components/kit/Donut.svelte';
  import OrderedStrip from '$lib/components/kit/OrderedStrip.svelte';
  import ListCard from '$lib/components/kit/ListCard.svelte';
  import ListRow from '$lib/components/kit/ListRow.svelte';
  import MoodChips from '$lib/components/kit/MoodChips.svelte';
  import Notice from '$lib/components/kit/Notice.svelte';
  import SectionHeading from '$lib/components/kit/SectionHeading.svelte';
  import Tile from '$lib/components/kit/Tile.svelte';
  import TileGrid from '$lib/components/kit/TileGrid.svelte';
  import { annotationsInRange, type ChartAnnotationSource } from '$lib/charts/annotations';
  import { readFlagFill, readFlagRoles, roleAt, type Role } from '$lib/theme/roles';
  import { PALETTES } from '../palettes.mjs';

  let palette = $state('trans');
  let theme = $state('dark');
  let roles = $state<Role[]>([]);
  let flagFill = $state('none');
  let mood = $state<number | null>(4);
  let dismissed = $state(false);

  /* The two datasets the area chart tweens between, so the re-tween can be
     watched rather than read about. "Year" is 365 points, which is the
     count the cap in $lib/charts/geometry exists for. */
  let range = $state<'week' | 'year'>('week');

  /* Three scales on one chart, which is what the picker is for: switching
     the metric re-tweens rather than redrawing. */
  const METRICS = [
    { value: 'gender', label: 'Dysphoria ↔ euphoria' },
    { value: 'euphoria', label: 'Euphoria' },
    { value: 'voice', label: 'Voice' }
  ];
  let metric = $state('gender');
  const SHIFT: Record<string, number> = { gender: 0, euphoria: 1.7, voice: 3.4 };
  const WEEK = (shift: number) =>
    Array.from({ length: 7 }, (_, i) => ({ x: i, y: 60 + 18 * Math.sin(i / 1.4 + shift) }));
  const YEAR = (shift: number) =>
    Array.from({ length: 365 }, (_, i) => ({
      x: i,
      y: 50 + 26 * Math.sin(i / 23 + shift) + 12 * Math.sin(i / 3.1 + shift)
    }));

  /* What the annotation layer has to survive (phase 5 deepening ticket 23):
     a stretch that started before the chart did, one that has not ended, two
     that overlap, and a moment inside both. The year fixture also carries the
     dense case the ticket sets a floor for - three moments on adjacent days -
     which at the year grain land in one weekly bucket and so have to gather
     into one doubled mark rather than three ticks drawn on top of each
     other. */
  const ANNOTATION_SOURCES: ChartAnnotationSource[] = [
    { id: 'e', kind: 'regimen', name: 'estradiol valerate', startEpochDay: -40, endEpochDay: 250 },
    { id: 's', kind: 'regimen', name: 'spironolactone', startEpochDay: 280, endEpochDay: null },
    { id: 'p', kind: 'journalingPause', name: null, startEpochDay: 96, endEpochDay: 110 },
    { id: 'q', kind: 'journalingPause', name: null, startEpochDay: 2, endEpochDay: 4 },
    { id: 'm', kind: 'milestone', name: 'first shot', startEpochDay: 3, endEpochDay: null },
    { id: 'n', kind: 'milestone', name: 'name change filed', startEpochDay: 4, endEpochDay: null },
    { id: 'v', kind: 'milestone', name: 'voice therapy', startEpochDay: 5, endEpochDay: null },
    { id: 'g', kind: 'surgery', name: 'top surgery', startEpochDay: 300, endEpochDay: null },
    { id: 'g-recovery', kind: 'recovery', name: 'top surgery', startEpochDay: 301, endEpochDay: 390 }
  ];
  let annotations = $derived(
    range === 'week'
      ? annotationsInRange(ANNOTATION_SOURCES, { from: 0, to: 6, today: 6 })
      : annotationsInRange(ANNOTATION_SOURCES, { from: 0, to: 364, today: 364 })
  );

  /* Two scales on one plot (phase 6 ticket 12), which is where the palettes
     have to be looked at: two roles of one flag, and on several of them the
     second is a shade rather than a colour. The dash is what has to carry the
     pair there.

     Mood against a 0-to-100 dimension, so the two ranges really are
     different and each line is placed against its own. The overlay stops 40
     positions short of the end and starts 30 in, which is the case a person
     who took up a scale partway through their journal has: the line is
     absent at those positions rather than drawn flat. */
  const TWO_POSITIONS = 90;
  const TWO_PRIMARY = Array.from({ length: TWO_POSITIONS }, (_, i) => ({
    x: i,
    y: 3 + 1.6 * Math.sin(i / 9)
  }));
  const TWO_OVERLAY = Array.from({ length: TWO_POSITIONS }, (_, i) =>
    i < 30 || i > TWO_POSITIONS - 12 ? null : 52 + 30 * Math.sin(i / 11 + 0.9)
  );

  function readRoles() {
    roles = readFlagRoles();
    flagFill = readFlagFill();
  }

  /* ?measure=1 runs the chart's re-tween against a transform-and-opacity
     baseline and prints the frame cadence on the page, so the number can be
     read off a phone over `adb reverse` without a debugger attached. The
     rule it is judged by is ticket 28's, written before any run: a material
     holds if at most 5% of frames land past 1.5x the baseline's median
     period and p95 is inside 1.25x it. */
  let report = $state('');

  function frames(ms: number): Promise<number[]> {
    return new Promise((done) => {
      const out: number[] = [];
      let last = performance.now();
      const began = last;
      const tick = (now: number) => {
        out.push(now - last);
        last = now;
        if (now - began < ms) requestAnimationFrame(tick);
        else done(out.slice(2));
      };
      requestAnimationFrame(tick);
    });
  }

  function stats(f: number[], over = Infinity) {
    const sorted = [...f].sort((a, b) => a - b);
    const at = (q: number) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))];
    return {
      n: sorted.length,
      median: at(0.5),
      p95: at(0.95),
      max: sorted[sorted.length - 1],
      long: sorted.filter((d) => d > over).length / sorted.length
    };
  }

  async function measure() {
    const probe = document.createElement('div');
    probe.style.cssText =
      'position:fixed;top:0;left:0;width:120px;height:120px;background:var(--accent);opacity:0.01';
    document.body.append(probe);
    probe.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(200px)' }], {
      duration: 2000,
      iterations: 3
    });
    const base = stats(await frames(1400));
    probe.remove();

    /* The rule's two clauses are both against the baseline's own median:
       at most 5% of frames past 1.5x it, and p95 inside 1.25x it. */
    const longBar = base.median * 1.5;
    const p95Bar = base.median * 1.25;

    // One warm-up switch that is not counted: the first tween after a load
    // carries the layout and the JIT with it, and what is being asked here
    // is what the material costs once it is running.
    range = 'year';
    await frames(700);
    range = 'week';
    await frames(500);

    const runs: ReturnType<typeof stats>[] = [];
    for (let i = 0; i < 4; i++) {
      range = range === 'week' ? 'year' : 'week';
      runs.push(stats(await frames(700), longBar));
    }

    const holds = runs.every((r) => r.long <= 0.05 && r.p95 <= p95Bar);
    report = [
      `baseline (transform): median ${base.median.toFixed(1)} p95 ${base.p95.toFixed(1)} over ${base.n} frames`,
      `bars: long frame > ${longBar.toFixed(1)}ms, p95 must be <= ${p95Bar.toFixed(1)}ms`,
      ...runs.map(
        (r, i) =>
          `re-tween ${i + 1} ${i % 2 === 0 ? 'week->year' : 'year->week'}: median ${r.median.toFixed(1)} p95 ${r.p95.toFixed(1)} max ${r.max.toFixed(1)} long ${(r.long * 100).toFixed(1)}% of ${r.n}`
      ),
      `holds (<=5% long AND p95 within bar): ${holds ? 'yes' : 'no'}`,
      `points drawn: week 7, year 365; warm-up switch discarded`
    ].join('\n');
  }

  onMount(() => {
    readRoles();
    if (location.search.includes('measure')) void measure();
  });

  $effect(() => {
    document.documentElement.dataset.palette = palette;
    document.documentElement.dataset.theme = theme;
    readRoles();
  });
</script>

{#if report}<pre class="gallery-report" data-measure-report>{report}</pre>{/if}

<div class="gallery-controls">
  <select bind:value={palette} aria-label="Palette">
    {#each PALETTES as p (p)}<option value={p}>{p}</option>{/each}
  </select>
  <select bind:value={theme} aria-label="Theme">
    <option value="dark">dark</option>
    <option value="light">light</option>
  </select>
  <button type="button" onclick={() => (range = range === 'week' ? 'year' : 'week')}>
    re-tween ({range})
  </button>
</div>

<div class="phone">
  <SectionHeading text="Surfaces" />

  <p class="gallery-note">List card, with the icon disc taking role 1</p>
  <ListCard role={roleAt(roles, 0)}>
    <ListRow key="milestones" icon="flag" title="Milestones" href="#milestones" />
    <ListRow key="labs" icon="flask" title="Labs" href="#labs" />
    <ListRow key="regimen" icon="clock" title="Regimen" href="#regimen" />
    <ListRow
      key="settings"
      icon="settings"
      title="Settings"
      subtitle="Language, palette, backup, the app lock"
      href="#settings"
    />
  </ListCard>

  <p class="gallery-note">Day card, role 2 on the date bar, entries on a timeline</p>
  <DayCard key="20324" date="Monday 24 August" aside="3 entries" role={roleAt(roles, 1)}>
    <DayEntry
      key="a"
      time="08:20"
      mood={3}
      title="Morning"
      note="Slept badly. Put the good shirt on anyway."
    />
    <DayEntry
      key="b"
      time="13:05"
      mood={5}
      title="Voice practice"
      note="Went somewhere for once. Held the pitch through a whole phone call."
    />
    <DayEntry key="c" time="22:40" mood={4} note="Tired, but not in the bad way." />
  </DayCard>

  <p class="gallery-note">Tile grid, two-up, the flag under the number</p>
  <TileGrid role={roleAt(roles, 1)} {flagFill}>
    <Tile key="onthisday" title="On this day" value="3" note="entries a year ago" href="#a" />
    <Tile key="wrapped" title="This month" value="21" note="days logged" href="#b" />
  </TileGrid>

  <SectionHeading text="Uncontained" />

  <p class="gallery-note">Chip row, flush to the page, mood on its own ramp</p>
  <MoodChips value={mood} onPick={(v) => (mood = v)} />

  <p class="gallery-note">Bare strip, the week</p>
  <BareStrip
    role={roleAt(roles, 0)}
    days={[
      { key: 1, name: 'M', level: 2, label: 'Monday, level 2' },
      { key: 2, name: 'T', level: 4, label: 'Tuesday, level 4' },
      { key: 3, name: 'W', level: 0, label: 'Wednesday, nothing logged' },
      { key: 4, name: 'T', level: 3, label: 'Thursday, level 3' },
      { key: 5, name: 'F', level: 1, label: 'Friday, level 1' },
      { key: 6, name: 'S', level: 4, label: 'Saturday, level 4' },
      { key: 7, name: 'S', level: 2, label: 'Sunday, level 2', isToday: true }
    ]}
  />

  <SectionHeading text="Notice" />
  {#if !dismissed}
    <Notice
      key="backup"
      icon="download"
      role={roleAt(roles, 1)}
      title="Your last archive was in June"
      text="An archive is the only copy of this journal that leaves the device."
      action={{ label: 'Make one now', onclick: () => {} }}
      dismiss={{ label: 'Dismiss', onclick: () => (dismissed = true) }}
    />
  {:else}
    <button type="button" class="gallery-reset" onclick={() => (dismissed = false)}>
      bring the notice back
    </button>
  {/if}

  <SectionHeading text="Charts">
    {#snippet action()}
      <a class="kit-heading-action" href="#all">See all</a>
    {/snippet}
  </SectionHeading>

  <ChartCard heading="Day by day" kind="area" role={roleAt(roles, 0)}>
    {#snippet control()}
      <ChartPicker
        key="metric"
        value={metric}
        options={METRICS}
        label="Which scale to chart"
        onPick={(v) => (metric = v)}
      />
    {/snippet}
    <AreaChart
      points={range === 'week' ? WEEK(SHIFT[metric]) : YEAR(SHIFT[metric])}
      {annotations}
      ariaLabel="Dysphoria ↔ euphoria, day by day"
      from={range === 'week' ? '18 Aug' : '25 Aug 2025'}
      to="24 Aug"
    />
  </ChartCard>

  <ChartCard heading="Day by day, two scales" kind="two-metrics" role={roleAt(roles, 0)}>
    <AreaChart
      points={TWO_PRIMARY}
      min={1}
      max={5}
      name="Mood"
      formatValue={(v) => String(Math.round(v))}
      overlay={{
        values: TWO_OVERLAY,
        min: 0,
        max: 100,
        name: 'Dysphoria ↔ euphoria',
        formatValue: (v) => `${Math.round(v)}`,
        role: roleAt(roles, 1)
      }}
      ariaLabel="Mood and dysphoria ↔ euphoria, day by day"
      from="1 Jun"
      to="29 Aug"
    />
  </ChartCard>

  <ChartCard heading="Each scale, this period" kind="bars" role={roleAt(roles, 1)}>
    <BarRows
      rows={[
        { key: 'euphoria', name: 'Euphoria', value: '78', amount: 78 },
        { key: 'femininity', name: 'Femininity', value: '64', amount: 64 },
        { key: 'voice', name: 'Voice', value: '41', amount: 41 },
        { key: 'social', name: 'Social confidence', note: '9 days', value: '22', amount: 22 }
      ]}
    />
  </ChartCard>

  <ChartCard heading="Days at each mood" kind="distribution" role={roleAt(roles, 2)}>
    <Distribution
      steps={[
        { step: 1, name: 'Awful', count: 1 },
        { step: 2, name: 'Bad', count: 4 },
        { step: 3, name: 'Meh', count: 9 },
        { step: 4, name: 'Good', count: 14 },
        { step: 5, name: 'Great', count: 6 }
      ]}
    />
  </ChartCard>

  <!-- The two forms phase 8 UX ticket 04 adds, and the rule between them
       (ADR-0058): the same five mood steps as the distribution above, drawn
       as one ordered bar, and two rings for the case where the parts have
       no order at all.

       Step 2 is empty on purpose. A step nothing landed on holds its place
       so the sequence stays under the right part of the scale, which is the
       thing a ring cannot do for an ordered scale at all. -->
  <ChartCard heading="Across the mood scale" kind="ordered-strip">
    <OrderedStrip
      steps={[
        { step: 1, name: 'Awful', count: 2 },
        { step: 2, name: 'Bad', count: 0 },
        { step: 3, name: 'Meh', count: 11 },
        { step: 4, name: 'Good', count: 16 },
        { step: 5, name: 'Great', count: 5 }
      ]}
    />
  </ChartCard>

  <ChartCard heading="Share by tag" kind="donut" role={roleAt(roles, 1)}>
    <Donut
      parts={[
        { key: 'work', name: 'Work', amount: 34 },
        { key: 'friends', name: 'Friends', amount: 21 },
        { key: 'therapy', name: 'Therapy', amount: 13 },
        { key: 'voice', name: 'Voice practice', amount: 8 }
      ]}
      restName="Other"
      total="76"
      note="entries"
    />
  </ChartCard>

  <!-- Nine parts against a cap of five, so the remainder and the smallest
       arc the ring will ever draw are both on screen. The last named part
       is under one percent, which is the case the legend refuses to print
       as a zero. -->
  <ChartCard heading="Share by tag, capped" kind="donut-capped" role={roleAt(roles, 0)}>
    <Donut
      parts={[
        { key: 'a', name: 'Getting dressed', amount: 120 },
        { key: 'b', name: 'Work', amount: 64 },
        { key: 'c', name: 'Friends', amount: 40 },
        { key: 'd', name: 'Appointments', amount: 1 },
        { key: 'e', name: 'Voice practice', amount: 1 },
        { key: 'f', name: 'Family', amount: 1 },
        { key: 'g', name: 'Travel', amount: 1 },
        { key: 'h', name: 'Hair removal', amount: 1 },
        { key: 'i', name: 'Swimming', amount: 1 }
      ]}
      restName="Other"
      total="231"
      note="entries"
    />
  </ChartCard>

  <ChartCard heading="Nothing logged yet" kind="empty" role={roleAt(roles, 0)}>
    <AreaChart points={[]} ariaLabel="Dysphoria ↔ euphoria, day by day" />
  </ChartCard>
</div>

<style>
  /* Fixture chrome only - nothing here is part of the kit. */
  :global(body) {
    margin: 0;
    background: var(--bg);
    color: var(--text);
    font-family: var(--font-body);
    font-size: var(--text-md);
    line-height: var(--leading-body);
  }

  .phone {
    width: 390px;
    margin: 0 auto;
    padding: 12px var(--space-4) 40px;
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    box-sizing: border-box;
  }

  .gallery-controls {
    display: flex;
    gap: 8px;
    padding: 8px;
    justify-content: center;
    font: inherit;
  }

  .gallery-report {
    margin: 0;
    padding: 10px 12px;
    background: var(--surface);
    color: var(--text);
    border-bottom: 1px solid var(--outline);
    font-family: ui-monospace, monospace;
    font-size: 11px;
    line-height: 1.5;
    white-space: pre-wrap;
  }

  .gallery-note {
    margin: var(--space-4) 0 0;
    font-size: 11px;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--text-2);
  }


  .gallery-reset {
    font: inherit;
    background: none;
    border: 1px solid var(--outline);
    border-radius: var(--radius-sm);
    color: var(--text-2);
    padding: 8px;
  }
</style>
