<script lang="ts">
  /* The constellation: every entry as a point on a plane of two scales,
     with the path between them traced by a scrubber (phase 5 deepening
     ticket 19, ADR-0048).

     A dumb renderer, like WearTrendChart and LineChart beside it. It takes
     positions already read to 0..1 ($lib/data/constellationData), the two
     scales' own end words, a formatter for a date and the modes with their
     resolved roles. It knows no dimension key, no message and no colour of
     its own: the caller resolves a presentation's role through `roleAt()`,
     so switching palette recolours every point and nothing here has to be
     told.

     ## Why there is a scrubber rather than a static scatter

     The argument for this chart at all is that fluidity is a path rather
     than a cloud, and the difference between those two readings is entirely
     in whether anything moves. So one number drives the whole drawing: how
     far along the readings the head sits. It arrives by sweeping from the
     start to the end, and after that the slider is the same number under a
     finger. The entrance and the interaction are one mechanism rather than
     an animation bolted onto a control - which is also why the sweep is
     worth its cost, since the code was there anyway.

     Tier 3 (DIRECTION.md): the mark moves, not its container. The sweep
     replays when the readings themselves change - a different range, an
     entry saved - and not when a live query merely hands the same ones back
     again, which is what `signature` below is for. Switching a scale on
     either axis is deliberately not a replay: those are the same readings
     seen from another angle, and a person who has scrubbed to a day wants
     to still be on that day after turning the plane. It takes the authored duration on --ease-out for the reason
     AreaChart's own first draw does: at --dur-slow a path this long reads
     as a flicker rather than as a drawing (Alicja, 2026-08-25, "a little
     slower and not linear").

     Under reduced motion the head starts at the end. That is tier 3's
     substitute, an instant cut, and nothing is lost by it: the whole
     picture is what the sweep arrives at.

     ## What is drawn, and in what order

     Points are grouped by mode, one <g> per mode carrying that mode's role,
     because that is how a surface takes a flag stripe (kit/role.ts) and
     because 120 inline style attributes is not. Grouping costs the
     chronological paint order, and it costs little: an older mark is drawn
     at a fraction of a newer one's alpha, so a newer mark landing under an
     older one is still the one that reads. The uncoloured group is drawn
     first, which is the one place the order is worth fixing - a mark with no
     mode should never cover one that has a colour to say.

     The trail is short on purpose, and the first build had it wrong. Joining
     forty readings that all sit inside one corner of the plane draws forty
     lines across each other, which is a tangle and not a path - the exact
     smear the ticket warned the density would become. What carries the
     reading instead is a comet's tail: the last TRAIL_READINGS joins, fading
     out behind the head, so the picture says which way the recent move went
     and the older marks stay marks. */
  import { untrack } from 'svelte';
  import { EASE_OUT, motionDuration } from '$lib/motion/tokens';
  import { tracedThrough, type ConstellationPoint, type PlottedPoint } from '$lib/data/constellationData';
  import type { Role } from '$lib/theme/roles';
  import { roleAttrs } from './kit/role';
  import Slider from './Slider.svelte';

  /** A presentation as this chart needs it: a name to write and a role to
      paint with, already resolved from the stored index (ADR-0048). */
  export interface ConstellationMode {
    id: string;
    name: string;
    role: Role | undefined;
  }

  /** A scale's own two end words, which is all of a scale this chart draws.
      One object per axis rather than four loose strings: they travel
      together, they come off one dimension row each, and two of them
      swapped by hand is the bug that pair exists to prevent. */
  export interface ScaleEnds {
    low: string;
    high: string;
  }

  let {
    points,
    modes,
    x,
    y,
    dayLabel,
    readingLabel,
    scrubLabel,
    ariaLabel
  }: {
    /** Oldest first. Positions only: the caller has already read both
        values against their own scales. */
    points: PlottedPoint[];
    modes: ConstellationMode[];
    /** The two scales' own end words, which is what labels the plot. No
        dimension name is written here, and none is written by the caller
        either: these come off the dimension rows themselves. */
    x: ScaleEnds;
    y: ScaleEnds;
    /** How the scrubbed reading's day is written. Dates are written against
        the active locale in $lib/data/dates and a chart is not a second
        place that decides how this app writes one. */
    dayLabel: (day: number) => string;
    /** The whole scrubbed reading as a sentence, for somebody who cannot
        see where the head sits. The readout is an <output>, so this is
        spoken again on every step of the scrub. */
    readingLabel: (point: ConstellationPoint) => string;
    /** What the scrubber is, for a screen reader. */
    scrubLabel: string;
    /** What the plot is. The marks are decoration to it; the scrubber is
        the way through them. */
    ariaLabel: string;
  } = $props();

  /** How many readings back the joins are drawn. Eight, because a plane is
      not a timeline: readings sit where their values are rather than in a
      row, so joins accumulate into a tangle far faster than they would on a
      chart with time along the bottom. */
  const TRAIL_READINGS = 8;
  /** The trail sits under the marks it joins. It says the order they came
      in, which is a weaker fact than where each of them was. */
  const TRAIL_ALPHA = 0.55;
  /** Room for the head's ring, and for a mark sitting exactly on either
      end of either scale. */
  const PAD = 8;
  const DOT = 3;

  /* Which dataset this is, as cheaply as it can be asked. A live query
     hands back a fresh array on any journal write, and replaying the sweep
     on each of those would be a chart that twitches while you use the app.
     A different count, a different oldest reading or a different newest one
     is a different dataset; the same three is the same one. */
  let signature = $derived(
    points.length === 0 ? '' : `${points.length}:${points[0].id}:${points[points.length - 1].id}`
  );

  /** How far along the readings the scrub sits. The one number the drawing
      is made of. */
  let head = $state(0);

  $effect(() => {
    if (signature === '') {
      head = 0;
      return;
    }
    const last = untrack(() => points.length - 1);
    const duration = motionDuration('--dur-authored');
    if (duration === 0) {
      head = last;
      return;
    }
    let frame = 0;
    const began = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - began) / duration);
      head = Math.round(EASE_OUT(t) * last);
      if (t < 1) frame = requestAnimationFrame(step);
    };
    head = 0;
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  });

  /* Held to the dataset on the way out rather than corrected on the way in,
     which is `activeMetric`'s rule (live/reference.svelte.ts): switching
     the range leaves a stale index behind for exactly one render, and a
     read past the end is an empty plot rather than a crash. */
  let traced = $derived(tracedThrough(points, head));
  let at = $derived(traced[traced.length - 1]);

  /* Measured in real pixels and square, for AreaChart's reason and one
     more. A ring has to stay a circle, and here the two axes are peers: a
     plane stretched wider than it is tall says a step across means less
     than a step up, which is a claim about the person's two scales that
     nothing in this app is allowed to make. */
  let size = $state(0);
  let plot = $derived(Math.max(size - PAD * 2, 1));
  const px = (point: PlottedPoint) => PAD + point.x * plot;
  /* Flipped here rather than in the data: which way up a plot is drawn
     belongs to the thing drawing it, and SVG counts down from the top. */
  const py = (point: PlottedPoint) => PAD + (1 - point.y) * plot;

  let byMode = $derived(
    [
      /* The uncoloured group first, so a mark with no mode never lands on
         top of one that has a colour to say. */
      { key: '', role: undefined, points: traced.filter((p) => !p.presentationId) },
      ...modes.map((mode) => ({
        key: mode.id,
        role: mode.role,
        points: traced.filter((p) => p.presentationId === mode.id)
      }))
    ].filter((group) => group.points.length > 0)
  );

  /* The joins, newest first so the slice is the recent stretch. Each
     segment takes the strength of its newer end, which is what makes the
     path fade off behind the head rather than stopping at an edge. */
  let trail = $derived(
    traced
      .slice(-TRAIL_READINGS)
      .flatMap((point, i, run) =>
        i === 0 ? [] : [{ key: point.id, from: run[i - 1], to: point, weight: point.weight * TRAIL_ALPHA }]
      )
  );

  let headMode = $derived(modes.find((mode) => mode.id === at?.presentationId));
</script>

{#if points.length}
  <div class="cn">
    <!-- The y scale's two ends, in the gutter the plot is inset from, the
         same shape AreaChart's value gutter takes. Written out rather than
         turned on their side: rotated text at 12px on a phone is a thing
         nobody reads twice. -->
    <div class="cn-gutter" aria-hidden="true">
      <span>{y.high}</span>
      <span>{y.low}</span>
    </div>

    <div class="cn-plot-wrap" bind:clientWidth={size}>
      <!-- role="img" with the chart's own name: the marks are a picture and
           the slider below is the way of reading it, which is where the
           readings are actually spoken. -->
      <svg class="cn-plot" width={size} height={size} viewBox="0 0 {size} {size}" role="img" aria-label={ariaLabel}>
        <!-- The two scales' middles, drawn as one cross rather than as a
             grid. Not axis furniture: with both scales read to their own
             ends, the middle is the only position on the plane that means
             the same thing in both directions, and without it a cluster has
             nothing to be off-centre from. -->
        <g class="cn-middle" aria-hidden="true">
          <line x1={PAD} x2={PAD + plot} y1={PAD + plot / 2} y2={PAD + plot / 2} />
          <line x1={PAD + plot / 2} x2={PAD + plot / 2} y1={PAD} y2={PAD + plot} />
        </g>

        <g class="cn-trail" aria-hidden="true">
          {#each trail as segment (segment.key)}
            <line
              x1={px(segment.from)}
              y1={py(segment.from)}
              x2={px(segment.to)}
              y2={py(segment.to)}
              opacity={segment.weight}
            />
          {/each}
        </g>

        {#each byMode as group (group.key)}
          <g {...roleAttrs(group.role)} aria-hidden="true">
            {#each group.points as point (point.slot)}
              <circle
                class="cn-dot"
                class:is-unset={!point.presentationId}
                cx={px(point)}
                cy={py(point)}
                r={DOT}
                opacity={point.weight}
              />
            {/each}
          </g>
        {/each}

        {#if at}
          <!-- The head, ringed on the plane rather than labelled beside it:
               the mark is the label, and the readout says the date. In the
               mode's own colour so the ring answers the same question the
               points do. -->
          <g {...roleAttrs(headMode?.role)} aria-hidden="true">
            <circle
              class="cn-head"
              class:is-unset={!headMode}
              cx={px(at)}
              cy={py(at)}
              r={DOT + 3}
            />
          </g>
        {/if}
      </svg>

      {#if at}
        <output class="cn-readout" data-constellation-readout>
          <span class="visually-hidden">{readingLabel(at)}</span>
          <span aria-hidden="true">{dayLabel(at.day)}</span>
          {#if headMode}
            <span class="cn-readout-mode" aria-hidden="true" {...roleAttrs(headMode.role)}>{headMode.name}</span>
          {/if}
        </output>
      {/if}
    </div>

    <!-- The x scale's two ends, under the plot and inset with it so each
         word sits under the edge it names. -->
    <div class="cn-ends" aria-hidden="true">
      <span>{x.low}</span>
      <span>{x.high}</span>
    </div>

    {#if points.length > 1}
      <div class="cn-scrub">
        <Slider min={0} max={points.length - 1} value={head} onInput={(v) => (head = v)} label={scrubLabel} />
      </div>
    {/if}
  </div>
{/if}

<style>
  /* The gutter, the plot and the two things under it, on one grid so the
     ends line up with the edges they name. */
  .cn {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    column-gap: var(--space-3);
  }

  .cn-gutter {
    grid-column: 1;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    font-size: var(--text-xs);
    color: var(--text-2);
    text-align: right;
    /* Each word centres on the edge it names, which the plot is inset from
       by PAD above. */
    padding-block: calc(8px - 0.55em);
  }

  /* A scale's end is the person's own words and can be any length, so the
     cap goes on the word rather than on the column: without it a custom
     scale ending in a sentence squeezes the plot down to a strip. Wrapped
     rather than clipped, because half of one of somebody's own two words is
     worse than two lines of it. */
  .cn-gutter span {
    max-width: 9ch;
    overflow-wrap: break-word;
  }

  .cn-plot-wrap {
    grid-column: 2;
    position: relative;
    min-width: 0;
    /* Square, because the two scales are peers. See the note by `size`. */
    aspect-ratio: 1;
  }

  .cn-plot {
    display: block;
    /* Nothing in here is a target: the scrubber below is the control. */
    pointer-events: none;
  }

  .cn-middle line {
    stroke: var(--outline);
    stroke-width: 1;
  }

  /* Ink rather than a role: the trail is the order the readings came in,
     which belongs to no mode, and a hue here would be a second colour
     system on a plot that already carries one. */
  .cn-trail line {
    stroke: var(--text-2);
    stroke-width: 1.25;
    stroke-linecap: round;
  }

  /* The flag's own stripe, undiluted (kit.css's --role-draw). A fill owes
     no contrast ratio, and applying one is what turned nonbinary's yellow
     to olive. */
  .cn-dot {
    fill: var(--role-draw);
  }

  .cn-head {
    fill: var(--surface);
    stroke: var(--role-draw);
    stroke-width: 2.5;
  }

  /* An entry carrying no mode is absence and not a category (ADR-0048), so
     it is drawn in ink rather than in a colour. The accent fallback
     kit.css gives an uncoloured surface is wrong here for once: on trans it
     is the same pink as one of the flag's own stripes, so a mark meaning
     "no mode" came out looking exactly like a mark meaning a mode the
     person had named pink. */
  .cn-dot.is-unset {
    fill: var(--text-2);
  }

  .cn-head.is-unset {
    stroke: var(--text-2);
  }

  /* Inset by the same PAD the plot is drawn inside, so each word sits under
     the edge of the scale it names rather than under the edge of the box. */
  .cn-ends {
    grid-column: 2;
    display: flex;
    justify-content: space-between;
    gap: var(--space-2);
    padding-inline: 8px;
    margin-top: var(--space-1);
    font-size: var(--text-xs);
    color: var(--text-2);
  }

  .cn-ends span {
    max-width: 45%;
  }

  .cn-readout {
    position: absolute;
    top: 0;
    right: 0;
    display: flex;
    align-items: baseline;
    gap: var(--space-2);
    padding: 3px var(--space-2);
    border-radius: var(--radius-pill);
    background: var(--surface-2);
    border: 1px solid var(--outline);
    font-size: var(--text-xs);
    color: var(--text-2);
    font-variant-numeric: tabular-nums;
    pointer-events: none;
    white-space: nowrap;
  }

  /* The mode's name in the mode's own ink, which is the corrected version
     rather than the stripe: this is small text and owes 4.5:1. Capped for
     the reason AreaChart's annotation readout is - a name is the person's
     own words and can be any length. */
  .cn-readout-mode {
    color: var(--role-ink);
    max-width: 14ch;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .cn-scrub {
    grid-column: 1 / -1;
    margin-top: var(--space-3);
  }
</style>
