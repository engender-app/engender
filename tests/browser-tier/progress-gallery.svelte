<script lang="ts">
  /* Every state the progress bar has, on one page, at phone width, against
     the real tokens (phase 9 audit ticket 11).

     It sits beside the control gallery rather than inside it because what
     has to be looked at here is motion rather than a resting shape: the
     sweep's pass, the tween between two sampled values, the hold at full,
     and what all three become with motion off. A still of a moving bar is
     worth having, but the row that matters is the sweep captured at four
     points across one pass.

     The strings are the fixture's own. Shipped copy is a message key. */
  import Progress from '$lib/components/Progress.svelte';
  import { createProgress } from '$lib/components/progress.svelte';
  import { PALETTES } from '../palettes.mjs';

  let palette = $state('trans');
  let theme = $state('dark');
  let motion = $state('full');

  $effect(() => {
    const html = document.documentElement;
    html.dataset.palette = palette;
    html.dataset.theme = theme;
    if (motion === 'reduce') html.dataset.a11yMotion = 'reduce';
    else delete html.dataset.a11yMotion;
  });

  /** One run per case, all started immediately: the show delay is real and
      tested, and a gallery that waited 300ms per bar to photograph would be
      photographing the delay rather than the bar. */
  function fixed(fraction: number | null, cancel = false) {
    const run = createProgress();
    run.start(cancel ? { onCancel: () => {}, immediate: true } : { immediate: true });
    if (fraction !== null) run.report(fraction, 1);
    return run;
  }

  const empty = fixed(0);
  const quarter = fixed(0.26);
  const most = fixed(0.72);
  const full = fixed(1);
  const sweeping = fixed(null);
  const sweepingLong = fixed(null);
  const stoppable = fixed(0.41, true);
  const stoppableSweep = fixed(null, true);

  /* The tween, which no fixed value shows: this one walks a real sequence
     of sampled values on the component's own cadence, so a screenshot
     taken at any moment catches the fill mid-transit rather than parked.
     Driven from the page rather than by faking a callback, because what is
     under review is what the component does with reports arriving faster
     than it repaints. */
  const walking = fixed(0);
  $effect(() => {
    let at = 0;
    // Faster than PROGRESS_SAMPLE_MS on purpose: this is restore's 10-40ms
    // cadence, and what should be visible is a fill that moves smoothly
    // regardless.
    const timer = setInterval(() => {
      at = (at + 0.012) % 1;
      walking.report(at, 1);
    }, 25);
    return () => clearInterval(timer);
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
  <select bind:value={motion} aria-label="Motion">
    <option value="full">motion</option>
    <option value="reduce">reduced</option>
  </select>
</div>

<!-- data-app-root, the same reason controls-gallery.svelte gives: press.css
     keys the stop button's press off this attribute. -->
<div data-app-root class="gallery-page">
  <div class="card" data-case="determinate">
    <p class="gallery-caption">Determinate, four points through one operation</p>
    <Progress run={empty} label="Packing your journal…" handle="empty" />
    <Progress run={quarter} label="Copying photos and recordings…" handle="quarter" />
    <Progress run={most} label="Writing your journal…" handle="most" />
    <Progress run={full} label="Writing your journal…" handle="full" />
  </div>

  <div class="card" data-case="indeterminate">
    <p class="gallery-caption">Indeterminate, where nothing can say how much is left</p>
    <Progress run={sweeping} label="Putting it back…" handle="sweep" />
    <Progress run={sweepingLong} label="Saving to the backup folder…" handle="sweep-long" />
  </div>

  <div class="card" data-case="cancellable">
    <p class="gallery-caption">With a way to stop it, which only export, auto-export and the scan get</p>
    <Progress run={stoppable} label="Packing your journal…" handle="stoppable" />
    <Progress run={stoppableSweep} label="Reading…" handle="stoppable-sweep" />
  </div>

  <div class="card" data-case="walking">
    <p class="gallery-caption">Sampled: reports every 25ms, repaints every 400ms</p>
    <Progress run={walking} label="Copying photos and recordings…" handle="walking" />
  </div>
</div>

<style>
  .gallery-controls {
    display: flex;
    gap: 8px;
    padding: 8px;
  }
  .gallery-page {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    padding: var(--space-4);
    background: var(--bg);
  }
  .gallery-caption {
    color: var(--text-2);
    font-size: var(--text-xs);
    margin: 0 0 var(--space-2);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
</style>
