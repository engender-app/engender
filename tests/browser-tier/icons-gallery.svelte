<script lang="ts">
  /* The two icon families the app is read through, at the sizes it draws
     them, against the real tokens (phase 5 ticket 31).

     A fixture rather than a route, for the reason the kit's own gallery
     gives: a drawing nobody can look at is a drawing nobody has reviewed,
     and the acceptance for this ticket is renders rather than code. What is
     on the page is arranged around the two questions the ticket asks - do
     the five navigation marks read as one set, and are the five mood faces
     telling apart at the smallest size any surface uses.

     Every mark also gets its measured optical centre drawn on it as a
     crosshair, from the same tests/icon-ink.ts the test uses, so a glyph
     that passes by 0.7 of a unit can be seen passing rather than taken on
     trust.

     tests/icon-gallery.mjs drives this across all 8 palettes and both
     themes. */
  import Icon from '$lib/components/Icon.svelte';
  import MoodFace from '$lib/components/MoodFace.svelte';
  import { PATHS } from '$lib/components/icons';
  import { measure } from '../icon-ink';
  import { PALETTES } from '../palettes.mjs';

  let palette = $state('trans');
  let theme = $state('dark');
  /* The axis that actually moves the faces. ADR-0025 gives mood its own
     colour scale, keyed on [data-mood-preset] rather than on the flag, so
     eight palettes leave the five discs identical and it is these four that
     change them. The palette still matters to everything around them. */
  const PRESETS = ['amber', 'teal', 'plum', 'moss'];
  let preset = $state('amber');
  /* Off by default: the crosshair is for checking one mark's centring, and
     with 54 of them on at once it is the overlay being reviewed rather than
     the drawings. The measured number under each tile says the same thing
     without covering the glyph. */
  let crosshairs = $state(false);

  /* The navigation set, at both sizes the shell draws it: 24 in the floating
     bar, 22 on the desktop rail. The add control's plus is 26 in the bar and
     20 on the rail, being on a filled button rather than beside a label. */
  const NAV = ['home', 'calendar', 'stats', 'grid'];
  const NAV_SIZES = [24, 22];

  /* Everything else, so the centring sweep can be seen rather than counted.
     Ordered as the source is, which is roughly by when each was needed. */
  const ALL = Object.keys(PATHS);

  const MOODS = [1, 2, 3, 4, 5];
  /* Every size a mood face ships at: the picker, Home's mood row, quick add's
     fan, an entry in a day card. 28 is the smallest, and the drawing was
     settled against the 22 an entry used to draw at. */
  const FACE_SIZES = [44, 40, 34, 28];

  const centres = Object.fromEntries(ALL.map((name) => [name, measure(PATHS[name])]));

  $effect(() => {
    document.documentElement.dataset.palette = palette;
    document.documentElement.dataset.theme = theme;
    document.documentElement.dataset.moodPreset = preset;
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
  <select bind:value={preset} aria-label="Mood preset">
    {#each PRESETS as p (p)}<option value={p}>{p}</option>{/each}
  </select>
  <label><input type="checkbox" bind:checked={crosshairs} /> centres</label>
</div>

<div class="page">
  <h2>The navigation set</h2>
  <p class="note">
    Bar at 24, rail at 22. One 2-unit stroke, one 2-unit corner, and each filling about 16 of the
    box's 24 units. Not one shared rectangle: a mark whose weight is lopsided has to sit off the
    middle of its box to look centred in it.
  </p>
  {#each NAV_SIZES as size (size)}
    <div class="row">
      <span class="row-label">{size}px</span>
      {#each NAV as name (name)}
        <span class="cell">
          <Icon {name} {size} />
          {#if crosshairs}
            <i
              class="cross"
              style={`--cx:${(centres[name].optical.x / 24) * size}px;--cy:${(centres[name].optical.y / 24) * size}px;--box:${size}px`}
            ></i>
          {/if}
        </span>
      {/each}
      <span class="cell is-add"><Icon name="plus" size={size === 24 ? 26 : 20} /></span>
    </div>
  {/each}

  <h2>The set as the bar draws it</h2>
  <p class="note">
    Four tabs at 24 with their labels, the add control between them, and the lit pill under the
    first. This is the arrangement, not the live bar.
  </p>
  <div class="bar">
    <span class="tab is-active"><Icon name="home" size={24} /><small>Start</small></span>
    <span class="tab"><Icon name="calendar" size={24} /><small>Calendar</small></span>
    <span class="add"><Icon name="plus" size={26} /></span>
    <span class="tab"><Icon name="stats" size={24} /><small>Insights</small></span>
    <span class="tab"><Icon name="grid" size={24} /><small>More</small></span>
  </div>

  <h2>The rail, and the brand mark</h2>
  <p class="note">
    Marks at 22 beside their words, and the mark that used to be a gradient square. This is the
    arrangement, not the live rail.
  </p>
  <div class="rail">
    <span class="rail-brand-row"><span class="brand"><Icon name="brand" size={22} /></span> Ledger</span>
    <span class="rail-add"><Icon name="plus" size={20} /> Quick add</span>
    <span class="rail-row is-active"><Icon name="home" size={22} /> Start</span>
    <span class="rail-row"><Icon name="calendar" size={22} /> Calendar</span>
    <span class="rail-row"><Icon name="stats" size={22} /> Insights</span>
    <span class="rail-row"><Icon name="grid" size={22} /> More</span>
  </div>

  <h2>Mood's five faces</h2>
  <p class="note">
    Every size a face ships at. 28 is an entry in a day card, the smallest of them; the drawing
    was settled against the 22 an entry used to draw. The colour comes from the mood preset above,
    not the flag.
  </p>
  {#each FACE_SIZES as size (size)}
    <div class="row">
      <span class="row-label">{size}px</span>
      {#each MOODS as step (step)}
        <span class="cell"><MoodFace {step} {size} /></span>
      {/each}
    </div>
  {/each}

  <h2>Every other mark</h2>
  <p class="note">
    At 22, with the measured optical centre on each. The sweep moved thirteen of these; the
    crosshair is what it moved them to.
  </p>
  <div class="grid">
    {#each ALL as name (name)}
      <span class="tile">
        <span class="cell">
          <Icon {name} size={22} />
          {#if crosshairs}
            <i
              class="cross"
              style={`--cx:${(centres[name].optical.x / 24) * 22}px;--cy:${(centres[name].optical.y / 24) * 22}px;--box:22px`}
            ></i>
          {/if}
        </span>
        <small>{name}</small>
        <small class="off">{centres[name].off.toFixed(2)}</small>
      </span>
    {/each}
  </div>
</div>

<style>
  .gallery-controls {
    position: sticky;
    top: 0;
    z-index: 5;
    display: flex;
    gap: 8px;
    align-items: center;
    padding: 8px;
    background: var(--surface);
    border-bottom: 1px solid var(--border);
    font: inherit;
    font-size: 12px;
    color: var(--text);
  }
  .page {
    padding: 16px;
    background: var(--bg);
    color: var(--text);
    min-height: 100vh;
  }
  h2 {
    font-family: var(--font-display);
    font-size: var(--text-lg);
    margin: 24px 0 4px;
  }
  .note {
    color: var(--text-2);
    font-size: var(--text-xs);
    margin: 0 0 12px;
    max-width: 46ch;
  }
  .row {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 10px;
  }
  .row-label {
    width: 44px;
    color: var(--text-2);
    font-size: var(--text-xs);
    font-variant-numeric: tabular-nums;
  }
  .cell {
    position: relative;
    display: grid;
    place-items: center;
    width: 52px;
    height: 52px;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    color: var(--text);
  }
  .cell.is-add {
    background: var(--accent);
    color: var(--on-accent);
    border-color: transparent;
  }
  /* The measured optical centre, and the box the mark is centred in. Drawn
     from the same measurement the test asserts on. */
  .cross {
    position: absolute;
    left: 50%;
    top: 50%;
    width: var(--box);
    height: var(--box);
    translate: -50% -50%;
    outline: 1px dashed color-mix(in srgb, var(--text) 22%, transparent);
    pointer-events: none;
  }
  .cross::before,
  .cross::after {
    content: '';
    position: absolute;
    background: var(--accent);
  }
  .cross::before {
    left: var(--cx);
    top: 0;
    bottom: 0;
    width: 1px;
  }
  .cross::after {
    top: var(--cy);
    left: 0;
    right: 0;
    height: 1px;
  }
  .bar {
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    align-items: center;
    gap: 4px;
    padding: 6px;
    border: 1px solid var(--border);
    border-radius: 26px;
    background: var(--surface);
    box-shadow: var(--shadow-float);
    max-width: 360px;
  }
  .tab {
    position: relative;
    display: grid;
    justify-items: center;
    gap: 2px;
    padding: 6px 4px;
    color: var(--text-2);
    font-size: var(--text-xs);
    font-weight: var(--weight-bold);
  }
  /* The lit state as a background rather than as a copy of .nav-pill. This
     page is showing where the marks sit, and a mocked-up travelling pill
     would be a second implementation of the real one with nothing keeping
     the two honest. The pill itself is reviewed in the running app. */
  .tab.is-active {
    color: var(--accent);
    background: var(--accent-soft);
    border-radius: var(--r-add);
  }
  .add {
    justify-self: center;
    display: grid;
    place-items: center;
    width: 56px;
    height: 56px;
    border-radius: var(--r-add);
    background: var(--accent);
    color: var(--on-accent);
  }
  .rail {
    display: grid;
    gap: 4px;
    padding: 12px;
    width: 220px;
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    background: var(--surface);
  }
  .rail-brand-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 0 6px 12px;
    font-family: var(--font-display);
    font-size: var(--text-lg);
    font-weight: 600;
    letter-spacing: var(--display-track);
  }
  .brand {
    display: grid;
    place-items: center;
    color: var(--accent);
  }
  .rail-add {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    min-height: 48px;
    margin-bottom: 8px;
    border-radius: var(--r-add);
    background: var(--accent);
    color: var(--on-accent);
    font-weight: var(--weight-bold);
  }
  .rail-row {
    position: relative;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 12px;
    min-height: 48px;
    border-radius: var(--r-add);
    color: var(--text-2);
    font-weight: var(--weight-medium);
  }
  .rail-row.is-active {
    color: var(--on-accent-soft);
    background: var(--accent-soft);
    font-weight: var(--weight-bold);
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(72px, 1fr));
    gap: 8px;
  }
  .tile {
    display: grid;
    justify-items: center;
    gap: 2px;
  }
  .tile small {
    color: var(--text-2);
    font-size: 10px;
    text-align: center;
    word-break: break-all;
  }
  .tile .off {
    font-variant-numeric: tabular-nums;
    opacity: 0.7;
  }
</style>
