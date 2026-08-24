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
  import DayCard from '$lib/components/kit/DayCard.svelte';
  import Distribution from '$lib/components/kit/Distribution.svelte';
  import ListCard from '$lib/components/kit/ListCard.svelte';
  import ListRow from '$lib/components/kit/ListRow.svelte';
  import MoodChips from '$lib/components/kit/MoodChips.svelte';
  import Notice from '$lib/components/kit/Notice.svelte';
  import SectionHeading from '$lib/components/kit/SectionHeading.svelte';
  import Tile from '$lib/components/kit/Tile.svelte';
  import TileGrid from '$lib/components/kit/TileGrid.svelte';
  import { readFlagRoles, roleAt, type Role } from '$lib/theme/roles';

  const PALETTES = [
    'trans',
    'nonbinary',
    'genderfluid',
    'bisexual',
    'lesbian',
    'pansexual',
    'rainbow',
    'agender'
  ];

  let palette = $state('trans');
  let theme = $state('dark');
  let roles = $state<Role[]>([]);
  let mood = $state<number | null>(4);
  let dismissed = $state(false);

  /* The two datasets the area chart tweens between, so the re-tween can be
     watched rather than read about. "Year" is 365 points, which is the
     count the cap in $lib/charts/geometry exists for. */
  let range = $state<'week' | 'year'>('week');
  const WEEK = Array.from({ length: 7 }, (_, i) => ({ x: i, y: [62, 58, 71, 44, 80, 76, 68][i] }));
  const YEAR = Array.from({ length: 365 }, (_, i) => ({
    x: i,
    y: 50 + 26 * Math.sin(i / 23) + 12 * Math.sin(i / 3.1)
  }));

  function readRoles() {
    roles = readFlagRoles();
  }

  onMount(readRoles);

  $effect(() => {
    document.documentElement.dataset.palette = palette;
    document.documentElement.dataset.theme = theme;
    readRoles();
  });
</script>

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

  <p class="gallery-note">Day card, role 2 on the date bar</p>
  <DayCard key="20324" date="Monday 24 August" aside="2 entries" role={roleAt(roles, 1)}>
    <p class="gallery-entry"><b>Good day</b><br />Voice practice went somewhere for once.</p>
    <p class="gallery-entry"><b>Evening</b><br />Tired, but not in the bad way.</p>
  </DayCard>

  <p class="gallery-note">Tile grid, two-up, each carrying its own reading</p>
  <TileGrid role={roleAt(roles, 2)}>
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
    <AreaChart
      points={range === 'week' ? WEEK : YEAR}
      ariaLabel="Gender feeling, day by day"
      from={range === 'week' ? '18 Aug' : '25 Aug 2025'}
      to="24 Aug"
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

  <ChartCard heading="Nothing logged yet" kind="empty" role={roleAt(roles, 0)}>
    <AreaChart points={[]} ariaLabel="Gender feeling, day by day" />
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

  .gallery-note {
    margin: var(--space-4) 0 0;
    font-size: 11px;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--text-2);
  }

  .gallery-entry {
    margin: 0;
    padding: var(--space-3) var(--space-4);
    font-size: var(--text-sm);
    color: var(--text-2);
  }

  .gallery-entry b {
    color: var(--text);
    font-size: var(--text-md);
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
