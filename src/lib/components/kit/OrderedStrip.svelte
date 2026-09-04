<script lang="ts">
  /* Parts of a whole where the order is the information (phase 8 UX ticket
     04, ADR-0058). Mood's five steps are the case it was written for, and
     anything on a scale takes this form rather than the ring.

     One bar, the scale's own steps left to right, each as wide as its
     share. What that buys over five separate columns is the comparison
     the columns could not make: mostly-the-middle-two is a shape here,
     one block of colour across the centre of the bar, where in a
     distribution it is two tall bars that have to be measured against the
     three short ones beside them. And what it buys over a ring is the
     order itself - a donut of mood puts step 1 next to step 5 and there
     is no arrangement of it that does not.

     Mood's own ramp (ADR-0025), same as the vertical distribution and for
     the same reason: the segment for a step is that step's colour, so the
     strip is read against the scale the moods were chosen on. The ramp is
     the one ordered scale in this app that owns colours; a future caller
     whose scale does not is the moment to widen this, not before.

     Every step is present even at zero, the way the distribution's
     columns are: the sequence is what is being read, and a step dropping
     out would slide the rest along under the wrong part of the scale.

     The percentages sit under the bar rather than inside it. Inside, they
     would be text on a mood fill, and the ramp's steps are literal hexes
     chosen to be sat on rather than written on - ADR-0025 had to hand-pick
     an ink for one heat step across two themes, and there are five steps
     here across four presets. Under the bar they are on the card, in the
     card's own text colour, and they still line up with what they label.
     A segment too narrow to hold its own number gets none: the reading is
     in its accessible label either way.

     One wipe left to right rather than five segments arriving. The
     direction is the scale's direction, so the entrance says the same
     thing the drawing does - and five segments growing in place would
     open gaps in a bar whose whole point is that it is continuous. */
  import { share } from '$lib/charts/geometry';

  export interface StripStep {
    /** 1-5 on the mood ramp - the step's place in the scale's own order. */
    step: number;
    name: string;
    count: number;
  }

  let { steps }: { steps: StripStep[] } = $props();

  let total = $derived(steps.reduce((sum, s) => sum + s.count, 0));

  /* Under this, a percentage does not fit in its own segment. Ten percent
     of a card-width track is around 30px, which is what "34%" needs at
     --text-xs. */
  const MIN_LABEL_SHARE = 10;

  const pct = (count: number) => `${Math.round(share(count, total))}%`;
</script>

<div class="kit-ordered" data-chart="ordered-strip">
  <div class="kit-ordered-track">
    {#each steps as step (step.step)}
      <!-- The segment is the only place the step's name reaches a screen
           reader: what is drawn is a width and a colour, and the ends
           caption below names two of the five. -->
      <span
        class="kit-ordered-seg"
        data-strip-step={step.step}
        role="img"
        aria-label={`${step.name} ${pct(step.count)}`}
        style={`--bar-share: ${share(step.count, total)}; --dist-fill: var(--mood-${step.step})`}
      ></span>
    {/each}
  </div>

  <p class="kit-ordered-shares" aria-hidden="true">
    {#each steps as step (step.step)}
      <span class="kit-ordered-share" style={`--bar-share: ${share(step.count, total)}`}>
        {share(step.count, total) >= MIN_LABEL_SHARE ? pct(step.count) : ''}
      </span>
    {/each}
  </p>

  <!-- Which way the scale runs. The middle three steps are placed by the
       sequence; the two ends are what say what the sequence is of. -->
  <p class="kit-ordered-ends" aria-hidden="true">
    <span>{steps[0]?.name ?? ''}</span>
    <span>{steps[steps.length - 1]?.name ?? ''}</span>
  </p>
</div>

<style>
  /* Its own block rather than kit.css, for the reason Donut.svelte's says:
     one consumer per class. The single-hue law still reaches it -
     tests/kit-surfaces.test.ts reads the kit components' style blocks
     alongside the shared sheet. */
  .kit-ordered {
    animation: kit-ordered-in var(--dur-slow) var(--ease-out) both;
  }

  @keyframes kit-ordered-in {
    from { clip-path: inset(0 100% 0 0); }
  }

  .kit-ordered-track {
    display: flex;
    /* The break between two steps. The ramp's adjacent steps are one
       intensity apart, which at 26px tall is an edge that wants finding. */
    gap: 1px;
    height: 26px;
    border-radius: 8px;
    /* One outline around the whole bar rather than one per segment: the
       light end of the ramp on a light card is the card otherwise, and a
       border per step would draw four lines nobody asked for. */
    border: 1px solid var(--outline);
    background: var(--surface-2);
    overflow: hidden;
  }

  .kit-ordered-seg {
    width: calc(var(--bar-share) * 1%);
    background: var(--dist-fill, var(--role-draw));
    /* Carries from one dataset's shares to the next, the way a bar carries
       its width: a range change is a re-tween, not a redraw. */
    transition-property: width;
    transition-duration: var(--dur-slow);
    transition-timing-function: var(--ease-out);
  }

  /* The percentages, under their own segments rather than inside them: the
     ramp's steps are colours chosen to be sat on, not written on. */
  .kit-ordered-shares {
    display: flex;
    gap: 1px;
    margin: var(--space-1) 0 0;
  }

  .kit-ordered-share {
    width: calc(var(--bar-share) * 1%);
    overflow: hidden;
    text-align: center;
    white-space: nowrap;
    font-size: var(--text-xs);
    color: var(--text-2);
    font-variant-numeric: tabular-nums;
    transition-property: width;
    transition-duration: var(--dur-slow);
    transition-timing-function: var(--ease-out);
  }

  /* Which way the scale runs. */
  .kit-ordered-ends {
    display: flex;
    justify-content: space-between;
    gap: var(--space-2);
    margin: var(--space-1) 0 0;
    font-size: var(--text-xs);
    color: var(--text-2);
  }
</style>
