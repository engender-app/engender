<script lang="ts">
  /* The Look back door's timeline (phase 10 redesign ticket 11): the
     person's own history as one rail, and two handles that bound the span
     the retrospectives read.

     What the rail holds is what the journal already knows about time: the
     eras as bands of the flag's colours, the milestones as marks on the
     axis, today at the right edge, the earliest authored day at the left
     (lookBackSpan.ts's `historyStart`). Nothing here is a reading - no
     count, no average - because the ticket adds no readings; the rail is a
     map of where the person has been, and the span is a stretch of it they
     point at.

     Two layers of the same bands. The bottom one is the whole history at
     10px, always drawn. The top one is the same bands at the rail's full
     height, clipped to the span, so the selected stretch stands up out of
     the history and the rest lies low. The clip is what moves when the span
     does, and it moves as a solid thing (DIRECTION.md rule 10: blocks
     slide and clip, never fade). The handles are blocks of ink with a grip
     line, the way a video trimmer's brackets are (Mobbin: YouTube's and
     X's trim controls), and the span's frame is the two ink rules the top
     layer wears along its edges - so frame, bands and handles all read as
     one object being resized.

     Direct manipulation is not animation: while a finger holds a handle the
     handle follows it with no transition, and the transitions run only on
     the moves that are not the finger's - a tap on an era, a tap on a
     milestone, a key press - and on the settle after a release, when the
     day snaps to its grain. Reduced motion clamps every one of those to the
     1ms base.css already imposes on transitions; nothing here animates by
     script.

     The span is committed on release, not on every move: the charts under
     the door re-read on commit, and re-reading six queries per pointer
     event is not what a drag is for. `onLive` is for the one line that has
     to follow the finger, the span written under the title. */
  import { m } from '$lib/paraglide/messages';
  import { fmtDay } from '$lib/data/dates';
  import {
    dayAtPosition,
    eraBands,
    moveHandle,
    nearestHandle,
    railPosition,
    snapDay,
    grainAt,
    yearTicks,
    type Span,
    type SpanHandle
  } from '$lib/data/lookBackSpan';
  import type { Era, Milestone } from '$lib/data/types';
  import { chromaticRoles, roleAt, type Role } from '$lib/theme/roles';
  import { roleAttrs } from './kit/role';

  let {
    railStart,
    today,
    span,
    eras,
    milestones,
    /** The first day the journal holds an entry for, if any: a magnet the
        handles snap to, drawn as nothing. */
    firstEntryDay = null,
    roles,
    onChange,
    onLive
  }: {
    railStart: number;
    today: number;
    /** The settled span. The component follows it and reports back through
        `onChange`; it never owns the truth. */
    span: Span;
    eras: readonly Era[];
    milestones: readonly Milestone[];
    firstEntryDay?: number | null;
    roles: Role[];
    onChange: (span: Span) => void;
    onLive?: (span: Span) => void;
  } = $props();

  /* How close a finger has to be to a milestone or an era's edge for the
     handle to land on it rather than on the grain. */
  const MAGNET_PX = 10;
  /* A band narrower than this carries no name: at 13px bold the shortest
     era name is wider than the band. */
  const NAME_MIN_PX = 56;

  let rail = $state<HTMLElement | undefined>();
  let railWidth = $state(0);
  $effect(() => {
    if (!rail) return;
    const el = rail;
    const measure = () => (railWidth = el.getBoundingClientRect().width);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  });

  /* The rail is a square-root scale (lookBackSpan.ts, `railPosition`), so
     a day is worth more pixels near today than near the start, and the
     grain a handle moves by and the reach of a magnet are both asked where
     the finger is rather than once for the rail. Measured over the day
     before, which is finite at today where the derivative is not. */
  const pxPerDayAt = (day: number): number => {
    const here = Math.min(today, Math.max(railStart + 1, day));
    return Math.max(0.01, (railPosition(here, railStart, today) - railPosition(here - 1, railStart, today)) * railWidth);
  };
  const grainFor = (day: number) => grainAt(pxPerDayAt(day));
  const toleranceAt = (day: number) => MAGNET_PX / pxPerDayAt(day);

  let bands = $derived(eraBands(eras, railStart, today));
  let marks = $derived(milestones.filter((ms) => ms.epochDay <= today && ms.epochDay >= railStart));
  let ticks = $derived(yearTicks(railStart, today));
  /* The years compress towards the rail's start on the square-root scale,
     so a label is drawn only where it clears the one before it; the tick
     is drawn regardless, since a tick has no width to collide with. */
  const LABEL_MIN_PX = 36;
  let labelled = $derived.by(() => {
    const out = new Set<number>();
    let lastX = Infinity;
    for (const tick of [...ticks].reverse()) {
      const at = railPosition(tick.epochDay, railStart, today) * railWidth;
      if (lastX - at < LABEL_MIN_PX) continue;
      out.add(tick.year);
      lastX = at;
    }
    return out;
  });
  let magnets = $derived([
    ...marks.map((ms) => ms.epochDay),
    ...bands.flatMap((band) => [band.start, band.end]),
    ...(firstEntryDay === null ? [] : [firstEntryDay]),
    railStart,
    today
  ]);

  /* The bands take the flag's colours after the first, which the marks
     take; a shade would vanish into the page on one theme (roles.ts,
     `chromaticRoles`). One role per era in order, wrapping. */
  let markRole = $derived(roleAt(roles, 0));
  let bandRoles = $derived(chromaticRoles(roles));
  const bandRole = (index: number): Role | undefined =>
    bandRoles.length ? bandRoles[(index + 1) % bandRoles.length] : undefined;

  /* The span as the finger has it, which is the settled span whenever no
     finger holds a handle. */
  let live = $state<Span>({ start: 0, end: 0 });
  let dragging = $state<SpanHandle | null>(null);
  $effect(() => {
    const settled = span;
    if (dragging === null) live = { ...settled };
  });

  const x = (day: number) => railPosition(day, railStart, today) * railWidth;
  let startX = $derived(x(live.start));
  let endX = $derived(x(live.end));
  /* The clip that lifts the span out of the history: the far edge of the
     end handle's day, so a one-day span is still a visible stretch. */
  let clipRight = $derived(Math.max(0, railWidth - Math.min(railWidth, endX + Math.max(2, pxPerDayAt(live.end)))));

  const dayAtClientX = (clientX: number): number => {
    const box = rail?.getBoundingClientRect();
    if (!box || box.width === 0) return today;
    const raw = dayAtPosition((clientX - box.left) / box.width, railStart, today);
    return snapDay(raw, { start: railStart, today, grain: grainFor(raw), magnets, toleranceDays: toleranceAt(raw) });
  };

  const settle = (next: Span) => {
    live = next;
    onLive?.(next);
  };
  const commit = (next: Span) => {
    settle(next);
    onChange(next);
  };

  /* Handles: pointer capture so the drag survives leaving the rail, and a
     commit on release. `touch-action: none` on the rail is what keeps the
     page from scrolling under a finger that is dragging sideways. */
  function onHandleDown(event: PointerEvent, handle: SpanHandle) {
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    dragging = handle;
  }
  function onHandleMove(event: PointerEvent, handle: SpanHandle) {
    if (dragging !== handle) return;
    settle(moveHandle(live, handle, dayAtClientX(event.clientX)));
  }
  function onHandleUp(handle: SpanHandle) {
    if (dragging !== handle) return;
    dragging = null;
    commit(live);
  }

  /* A key moves a handle by one step of the grain, ten with Shift, to the
     rail's ends with Home and End. The charts re-read a beat after the
     last key rather than on every press. */
  let keyTimer: ReturnType<typeof setTimeout> | undefined;
  function onHandleKey(event: KeyboardEvent, handle: SpanHandle) {
    const current = handle === 'start' ? live.start : live.end;
    const step = grainFor(current) * (event.shiftKey ? 10 : 1);
    let next: number | null = null;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') next = current - step;
    if (event.key === 'ArrowRight' || event.key === 'ArrowUp') next = current + step;
    if (event.key === 'Home') next = railStart;
    if (event.key === 'End') next = today;
    if (next === null) return;
    event.preventDefault();
    settle(moveHandle(live, handle, Math.min(today, Math.max(railStart, next))));
    clearTimeout(keyTimer);
    keyTimer = setTimeout(() => onChange(live), 300);
  }

  /* A tap on the rail itself brings the nearer handle to the day under
     the finger; a tap on an era selects the era whole; a tap on a
     milestone brings the nearer handle to it. Every one of these is a move
     the finger did not make, so every one of them travels. */
  function onRailClick(event: MouseEvent) {
    if (event.target !== event.currentTarget) return;
    const day = dayAtClientX(event.clientX);
    commit(moveHandle(live, nearestHandle(live, day), day));
  }
  const pickEra = (band: { start: number; end: number }) => commit({ start: band.start, end: band.end });
  const pickMark = (day: number) => commit(moveHandle(live, nearestHandle(live, day), day));

  const valueText = (day: number) => fmtDay(day, { day: 'numeric', month: 'long', year: 'numeric' });
</script>

<div
  class="span-tl"
  class:is-dragging={dragging !== null}
  data-span-timeline
  data-span-start={live.start}
  data-span-end={live.end}
  style:--tl-start="{startX}px"
  style:--tl-end="{endX}px"
  style:--tl-clip-right="{clipRight}px"
>
  <!-- The years, as a ruler above the rail: the one label a rail of years
       is read by. On the page, small type, so they are legal anywhere. -->
  <div class="span-tl-years" aria-hidden="true">
    {#each ticks as tick (tick.year)}
      {#if labelled.has(tick.year)}
        <span class="span-tl-year" style:left="{railPosition(tick.epochDay, railStart, today) * 100}%">{tick.year}</span>
      {/if}
    {/each}
  </div>

  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="span-tl-rail" bind:this={rail} onclick={onRailClick} {...roleAttrs(markRole)}>
    {#each ticks as tick (tick.year)}
      <span class="span-tl-tick" style:left="{railPosition(tick.epochDay, railStart, today) * 100}%" aria-hidden="true"></span>
    {/each}

    <!-- The whole history, low. The journal's own stretch first - from the
         first entry to today, in the page's second surface - so a rail with
         no eras still has a body, and the eras lie over it. -->
    <div class="span-tl-low" aria-hidden="true">
      {#if firstEntryDay !== null}
        <span class="span-tl-band span-tl-journal" style:left="{railPosition(firstEntryDay, railStart, today) * 100}%" style:width="{(1 - railPosition(firstEntryDay, railStart, today)) * 100}%"></span>
      {/if}
      {#each bands as band, i (band.id)}
        <span
          class="span-tl-band"
          style:left="{railPosition(band.start, railStart, today) * 100}%"
          style:width="{(railPosition(band.end, railStart, today) - railPosition(band.start, railStart, today)) * 100}%"
          {...roleAttrs(bandRole(i))}
        ></span>
      {/each}
    </div>

    <!-- The same history at full height, clipped to the span. Each band is
         the button that selects its era; the frame is this layer's own two
         edges. -->
    <div class="span-tl-full">
      {#if firstEntryDay !== null}
        <span class="span-tl-band span-tl-journal" aria-hidden="true" style:left="{railPosition(firstEntryDay, railStart, today) * 100}%" style:width="{(1 - railPosition(firstEntryDay, railStart, today)) * 100}%"></span>
      {/if}
      {#each bands as band, i (band.id)}
        {@const width = railPosition(band.end, railStart, today) - railPosition(band.start, railStart, today)}
        <button
          type="button"
          class="span-tl-band span-tl-era"
          class:is-open-start={band.openStart}
          class:is-open-end={band.openEnd}
          style:left="{railPosition(band.start, railStart, today) * 100}%"
          style:width="{width * 100}%"
          data-span-era={band.id}
          data-no-press
          aria-label={m.lookback_era_aria({ name: band.name })}
          onclick={() => pickEra(band)}
          {...roleAttrs(bandRole(i))}
        >
          {#if width * railWidth >= NAME_MIN_PX}<span class="span-tl-era-name">{band.name}</span>{/if}
        </button>
      {/each}
    </div>

    <!-- The eras again, low, as the tap targets for the stretch outside the
         span: the full layer is clipped, so a finger on a low band would
         otherwise reach the rail. -->
    <div class="span-tl-low span-tl-low-targets">
      {#each bands as band (band.id)}
        <button
          type="button"
          class="span-tl-band-target"
          style:left="{railPosition(band.start, railStart, today) * 100}%"
          style:width="{(railPosition(band.end, railStart, today) - railPosition(band.start, railStart, today)) * 100}%"
          data-no-press
          tabindex="-1"
          aria-hidden="true"
          onclick={() => pickEra(band)}
        ></button>
      {/each}
    </div>

    <!-- Milestones: a block each on the axis, in the flag's first colour. -->
    {#each marks as mark (mark.id)}
      <button
        type="button"
        class="span-tl-mark"
        style:left="{railPosition(mark.epochDay, railStart, today) * 100}%"
        data-span-milestone={mark.id}
        data-no-press
        aria-label={m.lookback_milestone_aria({ name: mark.name })}
        onclick={() => pickMark(mark.epochDay)}
      ></button>
    {/each}

    <!-- Today, in ink: the one mark on the rail that is not the person's. -->
    <span class="span-tl-today" aria-label={m.tl_you_are_here()} role="img"></span>

    {#each ['start', 'end'] as const as handle (handle)}
      <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
      <button
        type="button"
        class="span-tl-handle"
        class:is-start={handle === 'start'}
        class:is-end={handle === 'end'}
        class:is-held={dragging === handle}
        role="slider"
        data-span-handle={handle}
        data-no-press
        aria-label={handle === 'start' ? m.lookback_handle_start() : m.lookback_handle_end()}
        aria-valuemin={railStart}
        aria-valuemax={today}
        aria-valuenow={handle === 'start' ? live.start : live.end}
        aria-valuetext={valueText(handle === 'start' ? live.start : live.end)}
        aria-orientation="horizontal"
        onpointerdown={(e) => onHandleDown(e, handle)}
        onpointermove={(e) => onHandleMove(e, handle)}
        onpointerup={() => onHandleUp(handle)}
        onpointercancel={() => onHandleUp(handle)}
        onkeydown={(e) => onHandleKey(e, handle)}
      >
        <span class="span-tl-grip" aria-hidden="true"></span>
      </button>
    {/each}
  </div>
</div>

<style>
  .span-tl {
    position: relative;
    /* Room for the two handles to overhang the rail's ends. */
    padding-inline: calc(var(--handle) / 2);
    --handle: 48px;
    --grip: 14px;
    --rail-h: 72px;
    --low-h: 10px;
  }

  .span-tl-years {
    position: relative;
    height: 20px;
    font-size: var(--text-xs);
    font-weight: var(--weight-medium);
    color: var(--text-2);
  }

  .span-tl-year {
    position: absolute;
    top: 0;
    transform: translateX(-50%);
    font-variant-numeric: tabular-nums;
  }

  .span-tl-rail {
    position: relative;
    height: var(--rail-h);
    /* The axis every mark sits on. */
    border-bottom: 2px solid var(--hairline);
    touch-action: none;
    cursor: pointer;
    user-select: none;
    -webkit-user-select: none;
  }

  .span-tl-tick {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 1px;
    background: var(--hairline);
    pointer-events: none;
  }

  .span-tl-low,
  .span-tl-full {
    position: absolute;
    inset: 0;
    pointer-events: none;
  }

  .span-tl-low .span-tl-band {
    position: absolute;
    bottom: 0;
    height: var(--low-h);
  }

  .span-tl-band {
    display: block;
    box-sizing: border-box;
    padding: 0;
    margin: 0;
    background: var(--role-draw);
    color: var(--role-fill-ink);
    /* Every block wears an edge, so an era next to an era of a similar
       stripe, or every era under disguise where all roles are the accent,
       still reads as its own band. */
    border: 1px solid var(--outline);
    border-radius: 0;
    font: inherit;
  }

  /* The lifted layer: the bands at full height, framed top and bottom in
     ink, revealed only across the span. The clip is the object that moves. */
  .span-tl-full {
    border-top: 3px solid var(--text);
    border-bottom: 3px solid var(--text);
    clip-path: inset(0 var(--tl-clip-right) 0 var(--tl-start));
    transition: clip-path var(--dur-med) var(--ease-out);
  }

  .span-tl-full .span-tl-band {
    position: absolute;
    top: 0;
    bottom: 0;
    pointer-events: auto;
    cursor: pointer;
    overflow: hidden;
    display: flex;
    align-items: flex-start;
    padding: 6px 8px;
    text-align: left;
  }

  /* The journal's own stretch: no stripe, since it is not one of the
     person's eras but the fact that the journal was being written; the
     page's second surface, edged like every block. */
  .span-tl-journal {
    background: var(--surface-2);
    color: var(--text);
    border-right: 0;
  }
  .span-tl-full .span-tl-journal {
    position: absolute;
    top: 0;
    bottom: 0;
  }

  /* An open bound reaches past the rail: no edge on that side, so the band
     reads as running off rather than as ending here. */
  .span-tl-era.is-open-start { border-left: 0; }
  .span-tl-era.is-open-end { border-right: 0; }

  .span-tl-era-name {
    font-size: 0.8125rem;
    font-weight: var(--weight-bold);
    letter-spacing: 0.02em;
    line-height: 1.2;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 100%;
  }

  .span-tl-low-targets { pointer-events: none; }
  .span-tl-band-target {
    position: absolute;
    bottom: 0;
    height: calc(var(--low-h) + 12px);
    padding: 0;
    margin: 0;
    border: 0;
    background: transparent;
    pointer-events: auto;
    cursor: pointer;
  }

  /* A milestone: a 12px block of the flag's first colour on the axis. */
  .span-tl-mark {
    position: absolute;
    bottom: -7px;
    width: 12px;
    height: 12px;
    padding: 0;
    margin: 0;
    transform: translateX(-50%);
    background: var(--role-draw);
    border: 1px solid var(--outline);
    border-radius: 2px;
    cursor: pointer;
    z-index: 2;
  }

  /* The target is wider than the mark. */
  .span-tl-mark::before {
    content: '';
    position: absolute;
    inset: -18px -12px;
  }

  .span-tl-today {
    position: absolute;
    top: -4px;
    bottom: -4px;
    right: 0;
    width: 3px;
    background: var(--text);
    pointer-events: none;
    z-index: 2;
  }

  /* The handles: a 48px target with a grip of ink drawn in it, placed by
     transform alone so a move is a transform and nothing else. */
  .span-tl-handle {
    position: absolute;
    top: -6px;
    bottom: -6px;
    left: calc(var(--handle) / -2);
    width: var(--handle);
    padding: 0;
    margin: 0;
    border: 0;
    background: transparent;
    cursor: ew-resize;
    z-index: 3;
    touch-action: none;
    transition: transform var(--dur-med) var(--ease-out);
  }
  /* The target reaches away from the span - left of the start's grip,
     right of the end's - so at a short span the two targets meet at the
     grips rather than lying on top of each other, and a finger on either
     grip gets the handle it can see. */
  .span-tl-handle.is-start { transform: translateX(calc(var(--tl-start) - var(--handle) / 2 + var(--grip) / 2)); }
  .span-tl-handle.is-end { transform: translateX(calc(var(--tl-end) + var(--handle) / 2 - var(--grip) / 2)); }

  .span-tl-grip {
    position: absolute;
    top: 0;
    bottom: 0;
    left: calc(50% - var(--grip) / 2);
    width: var(--grip);
    background: var(--text);
    border-radius: var(--r-block);
  }
  .span-tl-grip::after {
    content: '';
    position: absolute;
    top: 14px;
    bottom: 14px;
    left: calc(50% - 1px);
    width: 2px;
    background: var(--bg);
  }

  /* The finger has it: no transition stands between the pointer and the
     handle, and the clip follows the same way. A held grip grows, which is
     the tier-1 response a control that cannot scale gives. */
  .is-dragging .span-tl-handle.is-held,
  .is-dragging .span-tl-full {
    transition: none;
  }
  .span-tl-handle.is-held .span-tl-grip {
    transform: scaleX(1.25);
  }
  .span-tl-grip {
    transition: transform var(--dur-fast) var(--ease-out);
  }

  .span-tl-handle:focus-visible {
    outline: none;
  }
  .span-tl-handle:focus-visible .span-tl-grip {
    outline: 2px solid var(--focus-ring);
    outline-offset: 2px;
  }
</style>
