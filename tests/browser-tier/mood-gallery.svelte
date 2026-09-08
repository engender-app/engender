<script lang="ts">
  /* Mood's ramp and mood's faces, and nothing else on the page (phase 10
     ticket 27).

     The two things this has to answer, both of which are claims about a
     drawing rather than about code:

     - does each preset read as two colours end to end, rather than as one
       hue tinted five ways (ADR-0077)
     - do the five faces still tell apart at 28px, the smallest any surface
       draws them, now that every mark is a filled shape instead of a
       stroked arc

     The picker and the chip row are the real components, not mock-ups of
     them: they carry the dimming, the ring on the picked face and the
     labels, and a copy of those rules here would be a second
     implementation with nothing keeping the two honest.

     Faces are held still by default. Three animations run on a live picker
     (blink, idle glance, the gaze) and a screenshot of a face mid-saccade
     is a screenshot of an eye 1.05 units off centre - the reduce switch is
     the app's own way of stopping exactly those two loops, so the shots are
     of the drawing rather than of a moment in it.

     tests/mood-gallery.mjs drives this across all 4 presets and both
     themes. */
  import MoodChips from '$lib/components/kit/MoodChips.svelte';
  import MoodFace from '$lib/components/MoodFace.svelte';
  import MoodPicker from '$lib/components/MoodPicker.svelte';
  import { moodName } from '$lib/data/vocabulary/labels';
  import { PALETTES } from '../palettes.mjs';

  const PRESETS = ['amber', 'teal', 'plum', 'moss'];
  const STEPS = [1, 2, 3, 4, 5];
  /* Every size a mood face ships at: the picker's 44, Home's chips at 40,
     quick add's fan at 34, an entry in a day card at 28. 22 is not a
     shipped size any more and is drawn anyway, because it is the size the
     drawing is settled against. */
  const SIZES = [44, 40, 34, 28, 22];

  let palette = $state('trans');
  let theme = $state('dark');
  let preset = $state('amber');
  let still = $state(true);
  /* One face, big, for the round where the drawing itself is what is being
     signed off rather than the set (Alicja, 2026-09-08: "give me a screen
     with just one face for sign off"). */
  let one = $state(4);
  let picked = $state<number | null>(4);
  let chipped = $state<number | null>(null);

  let hexes = $state<string[]>([]);

  $effect(() => {
    document.documentElement.dataset.palette = palette;
    document.documentElement.dataset.theme = theme;
    document.documentElement.dataset.moodPreset = preset;
    if (still) document.documentElement.dataset.a11yMotion = 'reduce';
    else delete document.documentElement.dataset.a11yMotion;
  });

  /* Read back off the document rather than out of palettes.css, so what is
     printed under each swatch is the colour the browser resolved. */
  $effect(() => {
    void [palette, theme, preset];
    const style = getComputedStyle(document.documentElement);
    hexes = STEPS.map((step) => style.getPropertyValue(`--mood-${step}`).trim());
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
  <label><input type="checkbox" bind:checked={still} /> still</label>
  <select bind:value={one} aria-label="One face">
    {#each STEPS as step (step)}<option value={step}>step {step}</option>{/each}
  </select>
</div>

<div class="page">
  <section>
    <h2>One face, big</h2>
    <p class="note">
      The drawing on its own, at 200px and at the two sizes that matter: the picker's 44 and an
      entry's 28, which is the smallest the app draws.
    </p>
    <div data-crop="one">
      <div class="row">
        <span class="one"><MoodFace step={one} size={200} /></span>
        <span class="one-small">
          <MoodFace step={one} size={44} />
          <MoodFace step={one} size={28} />
        </span>
      </div>
    </div>
  </section>

  <section>
    <h2>The ramp</h2>
    <p class="note">
      Step 1 to step 5, one preset, one theme. Two hues end to end and more saturated with every
      step, and the same five literal hexes whatever flag is on.
    </p>
    <div data-crop="ramp">
      <div class="sweep">
        {#each STEPS as step (step)}
          <span class="sweep-step" style={`background: var(--mood-${step})`}></span>
        {/each}
      </div>
      <div class="row">
        {#each STEPS as step, i (step)}
          <span class="swatch" style={`background: var(--mood-${step})`}>
            <b>{step}</b>
            <small>{hexes[i] ?? ''}</small>
          </span>
        {/each}
      </div>
    </div>
  </section>

  <section>
    <h2>The five faces</h2>
    <p class="note">
      Every size a face ships at, and the 22 the drawing is settled against. Filled marks: a lens
      for the mouth, dots or lids for the eyes, a blush on the top step.
    </p>
    <div data-crop="faces">
      {#each SIZES as size (size)}
        <div class="row">
          <span class="row-label">{size}px</span>
          {#each STEPS as step (step)}
            <span class="cell"><MoodFace {step} {size} /></span>
          {/each}
        </div>
      {/each}
    </div>
  </section>

  <section>
    <h2>The picker, with one picked</h2>
    <p class="note">
      The entry editor's row. The four unpicked faces sit back at 55% of their fill and 41% of
      their ink; the picked one takes the accent ring and keeps both.
    </p>
    <div data-crop="picker"><MoodPicker value={picked} onPick={(v) => (picked = v)} /></div>
  </section>

  <section>
    <h2>The picker, with none picked</h2>
    <p class="note">All five at full, which is what an entry with no mood on it shows.</p>
    <div data-crop="picker-none"><MoodPicker value={null} onPick={() => {}} /></div>
  </section>

  <section>
    <h2>Home's chips</h2>
    <p class="note">Forty pixels, flush between two hairlines, with the labels under them.</p>
    <div data-crop="chips"><MoodChips value={chipped} onPick={(v) => (chipped = v)} /></div>
  </section>

  <section>
    <h2>Read, not chosen</h2>
    <p class="note">
      An entry's mark on a day card at 28, and the calendar's split cell, where the day already
      carries the colour and the face draws without its disc.
    </p>
    <div data-crop="read">
      <div class="row">
        {#each STEPS as step (step)}
          <span class="entry"><MoodFace {step} size={28} /> <small>{moodName(step)}</small></span>
        {/each}
      </div>
      <div class="row">
        {#each STEPS as step (step)}
          <span class="split" style={`background: var(--mood-${step})`}>
            <MoodFace {step} size="100%" disc={false} />
          </span>
        {/each}
      </div>
    </div>
  </section>
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
    border-bottom: 1px solid var(--hairline);
    font: inherit;
    font-size: 12px;
    color: var(--text);
  }
  .page {
    padding: 16px;
    background: var(--bg);
    color: var(--text);
  }
  /* [data-crop] wraps a block's drawings and not its heading, because the
     review page prints its own headings and sixteen copies of this one's
     would be all a reader saw (.claude/mood-crops.mjs). */
  [data-crop] {
    display: grid;
    gap: 10px;
    padding: 2px 0;
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
    border: 1px solid var(--hairline);
    border-radius: var(--r-block);
    color: var(--text);
  }
  /* The five steps butted together, which is the only way to see whether the
     ramp is a sweep between two hues or five tints of one. */
  .sweep {
    display: flex;
    height: 34px;
    margin-bottom: 12px;
    border-radius: var(--r-block);
    overflow: hidden;
  }
  .sweep-step {
    flex: 1;
  }
  .swatch {
    display: grid;
    place-items: center;
    gap: 2px;
    /* Five across a phone's width, because the crop of this row is what the
       review page shows and an overflowing fifth swatch is a clipped one. */
    flex: 1;
    min-width: 0;
    height: 62px;
    border-radius: var(--r-block);
    color: var(--text);
    font-size: 9.5px;
    font-variant-numeric: tabular-nums;
  }
  .swatch b {
    font-size: var(--text-sm);
  }
  .one {
    display: grid;
    place-items: center;
  }
  .one-small {
    display: grid;
    gap: 14px;
    place-items: center;
  }
  .entry,
  .split {
    display: grid;
    place-items: center;
    gap: 4px;
    font-size: 10px;
    color: var(--text-2);
  }
  .entry {
    width: 56px;
  }
  .split {
    width: 44px;
    height: 44px;
    border-radius: var(--r-block);
  }
</style>
