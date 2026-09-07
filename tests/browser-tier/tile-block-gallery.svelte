<script lang="ts">
  /* Every shape a tile has, on one page, at phone width, against the real
     tokens (redesign ticket 24).

     Five shapes for the live grid - plain, action, dismiss, action and
     dismiss, and the row weight - plus the tight pair, which has no foot
     and wears the flag bar instead, plus the same grid with no role at all,
     which is what disguise leaves behind. A tile is the one surface whose
     ground is a stripe, and every stripe is different, so the eight
     palettes and the two themes are the review rather than a spot check.

     The strings are the fixture's own. Shipped copy is a message key. */
  import { onMount } from 'svelte';
  import Tile from '$lib/components/kit/Tile.svelte';
  import TileGrid from '$lib/components/kit/TileGrid.svelte';
  import { readFlagFill, readFlagRoles, tileRoleAt, type Role } from '$lib/theme/roles';
  import { PALETTES } from '../palettes.mjs';

  let palette = $state('trans');
  let theme = $state('dark');
  let roles = $state<Role[]>([]);
  let flagFill = $state('none');

  let role = $derived(tileRoleAt(roles, 1));

  function readRoles() {
    roles = readFlagRoles();
    flagFill = readFlagFill();
  }

  onMount(readRoles);

  $effect(() => {
    document.documentElement.dataset.palette = palette;
    document.documentElement.dataset.theme = theme;
    readRoles();
  });

  const noop = () => {};
</script>

<div class="gallery-controls">
  <select bind:value={palette} aria-label="Palette">
    {#each PALETTES as p (p)}<option value={p}>{p}</option>{/each}
  </select>
  <select bind:value={theme} aria-label="Theme">
    <option value="dark">dark</option>
    <option value="light">light</option>
  </select>
</div>

<div class="phone">
  <section data-shape="plain">
    <p class="gallery-note">Plain, two-up</p>
    <TileGrid {role} {flagFill} data-rows>
      <Tile
        key="dose"
        title="Next dose"
        value="in 2 days"
        note="Estradiol valerate, 4mg"
        href="#dose"
      />
    </TileGrid>
  </section>

  <section data-shape="action">
    <p class="gallery-note">With an action</p>
    <TileGrid {role} {flagFill} data-rows>
      <Tile
        key="tryout"
        title="Trying he/him"
        value="day 9"
        note="Started the week before last"
        href="#tryout"
        action={{ text: 'Log', label: 'Log a feeling', onclick: noop }}
      />
    </TileGrid>
  </section>

  <section data-shape="dismiss">
    <p class="gallery-note">With a dismiss, which is the shape whose note had to leave its link</p>
    <TileGrid {role} {flagFill} data-rows>
      <Tile
        key="safe"
        title="Safe space"
        note="Somewhere to put the thoughts that are not true"
        href="#safe"
        dismiss={{ label: 'Not now', onclick: noop }}
      />
    </TileGrid>
  </section>

  <section data-shape="both">
    <p class="gallery-note">Both controls</p>
    <TileGrid {role} {flagFill} data-rows>
      <Tile
        key="letter"
        title="A letter is ready"
        value="1 waiting"
        note="You wrote it in March"
        href="#letter"
        action={{ text: 'Read', label: 'Read the letter', onclick: noop }}
        dismiss={{ label: 'Not now', onclick: noop }}
      />
    </TileGrid>
  </section>

  <section data-shape="row">
    <p class="gallery-note">The row weight, at the width its timer has to survive</p>
    <div class="narrow">
      <TileGrid {role} {flagFill} data-rows>
        <Tile
          key="timer"
          title="Time since your last dose"
          value="9h 0m 15s"
          note="Due at 21:00"
          href="#timer"
          weight="row"
          action={{ text: 'Stop', label: 'Stop the timer', onclick: noop }}
        />
      </TileGrid>
    </div>
  </section>

  <section data-shape="tight">
    <p class="gallery-note">The look-back pair: one colour each, the flag bar, no foot</p>
    <TileGrid {role} {flagFill} data-tight>
      <Tile key="wrapped" title="This month" value="21" note="days logged" href="#wrapped" />
      <Tile key="onthisday" title="On this day" value="3" note="a year ago" href="#onthisday" />
    </TileGrid>
  </section>

  <!-- The two-up pair at the width the grid actually resolves to on a
       390px phone, with one long title and one short, which is where a
       block's value can end up half a tile higher than its neighbour's. -->
  <section data-shape="pair">
    <p class="gallery-note">A pair two-up, at a 412px phone, one title wrapping</p>
    <div class="wide">
    <TileGrid {role} {flagFill}>
      <Tile
        key="dose"
        title="Estradiol valerate"
        value="in 2 days"
        note="4mg, subcutaneous"
        href="#dose"
      />
      <Tile key="mood" title="Logged" value="6 days" note="in a row" href="#mood" />
    </TileGrid>
    </div>
  </section>

  <!-- 200% zoom on a 390px phone leaves about 195 CSS pixels. The floor the
       accessibility rules name, and the width a 40px number, a 19px title
       and a foot all have to survive. -->
  <section data-shape="zoom">
    <p class="gallery-note">At 195px, which is 200% zoom on a 390px phone</p>
    <div class="zoomed">
      <TileGrid {role} {flagFill} data-rows>
        <Tile
          key="dose"
          title="Estradiol valerate"
          value="in 2 days"
          note="Subcutaneous, 4mg, in the morning"
          href="#dose"
          dismiss={{ label: 'Not now', onclick: noop }}
        />
      </TileGrid>
    </div>
  </section>

  <section data-shape="disguise">
    <p class="gallery-note">Under disguise: no flag to publish, so one accent block and no bar</p>
    <TileGrid data-rows>
      <Tile key="notes" title="Next dose" value="in 2 days" note="Estradiol valerate, 4mg" href="#d" />
    </TileGrid>
  </section>
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
    padding: 12px var(--space-5) 40px;
    display: flex;
    flex-direction: column;
    gap: var(--space-5);
    box-sizing: border-box;
  }

  /* 320px less the screen's own 20px inset on each side: the width the row
     weight's timer, its title and its Stop button have to share. */
  .narrow {
    width: 280px;
  }

  /* A 412px phone less its 20px inset: the narrowest width the pair still
     stands two-up at. */
  .wide {
    width: 372px;
  }

  /* 195px less the screen inset on each side. */
  .zoomed {
    width: 155px;
  }

  .gallery-note {
    margin: 0 0 var(--space-2);
    font-size: var(--text-xs);
    color: var(--text-2);
  }

  .gallery-controls {
    display: flex;
    gap: 8px;
    padding: 8px;
    justify-content: center;
    font: inherit;
  }
</style>
