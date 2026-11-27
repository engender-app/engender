<script lang="ts">
  /* The Look back rail runs from historyStart to today and clips its full-height
     copy to the selected span. Flag colours mark eras, solid secondary ink
     marks episodes, and hollow ink marks tryouts. Full ink marks the span
     and milestones.
     During a drag, onLive updates the label. Settle to a grain or magnet and
     commit on release so readings requery once. Taps and keys animate too.
     The handle, frame and clip share --dur-med, clamped to 1ms for reduced
     motion. Save dismissal of the first-drag hint. */
  import { untrack } from 'svelte';
  import { m } from '$lib/paraglide/messages';
  import { useDoorActivity } from '$lib/navigation/doorActivity.svelte';
  import { fmtDay } from '$lib/data/dates';
  import { localDateFromEpochDay } from '$lib/data/epochDay';
  import {
    dayAtPosition,
    defaultSpan,
    eraBands,
    historyKindsPresent,
    moveHandle,
    nearestHandle,
    railLegendKinds,
    railPosition,
    snapDay,
    grainAt,
    yearTicks,
    type RailBand,
    type RailHistoryKind,
    type RailLegendKind,
    type RailMark,
    type Span,
    type SpanHandle
  } from '$lib/data/lookBackSpan';
  import { countUp } from '$lib/motion/countUp';
  import { crossfade } from '$lib/motion/reveal';
  import { EASE_OUT, EASE_OUT_CSS, fadeOnly, isReducedMotion, motionDuration } from '$lib/motion/tokens';
  import type { TransitionConfig } from 'svelte/transition';
  import type { Era, Milestone } from '$lib/data/types';
  import { eraBandRoles, roleAt, type Role } from '$lib/theme/roles';
  import { roleAttrs } from './kit/role';
  import { distinctHandlePositions, visibleSegment } from './spanTimelineGeometry';

  let {
    railStart,
    today,
    span,
    eras,
    milestones,
    /** Every other dated stretch the journal holds, already clamped to the
        rail (lookBackSpan.ts's `historyBands`). */
    history = [],
    /** The procedures' surgery days, as marks. */
    surgeries = [],
    /** The first day the journal holds an entry for, if any: a magnet the
        handles snap to, drawn as nothing. */
    firstEntryDay = null,
    /** Whether the drag hint has already been answered on this journal. */
    hintSeen = true,
    /** The whole flag as one gradient, for the eras' legend key - the one
        kind here whose colour is plural. Without a flag, the key falls
        back to an outline with no fill. */
    flagFill = null,
    roles,
    onChange,
    onLive,
    onHintSeen
  }: {
    railStart: number;
    today: number;
    /** The settled span. The component follows it and reports back through
        `onChange`; it never owns the truth. */
    span: Span;
    eras: readonly Era[];
    milestones: readonly Milestone[];
    history?: readonly RailBand[];
    surgeries?: readonly RailMark[];
    firstEntryDay?: number | null;
    hintSeen?: boolean;
    flagFill?: string | null;
    roles: Role[];
    onChange: (span: Span) => void;
    onLive?: (span: Span) => void;
    onHintSeen?: () => void;
  } = $props();
  const doorActive = useDoorActivity();

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
    const measure = () => {
      if (!doorActive()) return;
      const width = el.getBoundingClientRect().width;
      if (width > 0) railWidth = width;
    };
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

  /* Which history rows this journal earns. A kind with nothing in it takes
     no row and no height, so a journal with only tryouts gets one row
     rather than one row and an empty one. */
  let rows = $derived(historyKindsPresent(history));
  let legend = $derived(railLegendKinds(history, marks, surgeries, bands.length > 0));
  const hasRow = (kind: RailHistoryKind) => (rows.includes(kind) ? 1 : 0);

  /* Which stripe each era takes (theme/roles.ts's `eraBandRoles`, shared
     with MilestoneRail's own bands so the two rails agree). A black or
     white block is a block here because every band wears the 1px edge rule
     4 gives it; a flag with two or more colours never needs one. Nothing
     is skipped, since the marks are ink and take no band, and neither does
     a history lane. */
  let markRole = $derived(roleAt(roles, 0));
  let bandRoles = $derived(eraBandRoles(roles));
  const bandRole = (index: number): Role | undefined =>
    bandRoles.length ? bandRoles[index % bandRoles.length] : undefined;

  const LEGEND_WORD: Record<RailLegendKind, () => string> = {
    era: () => m.eras_title(),
    regimen: () => m.regimen(),
    tryout: () => m.lookback_legend_tryouts(),
    surgery: () => m.lookback_legend_surgery(),
    milestone: () => m.milestones(),
    'milestone-and-surgery': () => m.lookback_legend_milestones_and_surgery()
  };
  /* The query types a band's name nullable because some kinds have none,
     and neither kind drawn here is one - so the fallback is the kind's own
     word rather than a band with no label at all. */
  const bandName = (band: RailBand) => band.name ?? LEGEND_WORD[band.kind]();

  /* The span as the finger has it, which is the settled span whenever no
     finger holds a handle. */
  const initialSpan = () => span;
  let live = $state<Span>({ ...initialSpan() });
  let dragging = $state<SpanHandle | null>(null);
  /* Set on the first move after a handle is taken, not on the take: a tap
     on a grip is a take and a release with no move between, and it has to
     raise the rail with the transition on - the first recording showed the
     span cut to full height while the grips grew, because the take alone
     had switched the transition off. */
  let moving = $state(false);

  /* At rest the rail is low: the span is a band a little taller than the history under it
     and the handles are two short grips on the axis, suggested rather than offered. The
     first touch or focus anywhere on the rail raises it - the lifted bands, the frame, the
     era names and the full grips clip open upwards on --dur-med - and a touch or focus that
     leaves the rail lowers it again. The rail's box never changes height, so nothing under
     it moves either way. */
  let root = $state<HTMLElement | undefined>();
  let active = $state(false);
  const raise = () => { if (doorActive()) active = true; };
  function onFocusOut(event: FocusEvent) {
    if (root && event.relatedTarget instanceof Node && root.contains(event.relatedTarget)) return;
    active = false;
  }
  $effect(() => {
    if (!doorActive() || !active) return;
    const lower = (event: PointerEvent) => {
      if (root && event.target instanceof Node && root.contains(event.target)) return;
      /* A control that leaves the screen with the span - the way into its
         retrospective - keeps the rail raised, so the stretch the person
         chose is the last thing standing while the door goes rather than
         a thing folding away under a finger that just used it. The host marks it; the rail knows nothing about
         routes. */
      if (event.target instanceof Element && event.target.closest('[data-span-keep]')) return;
      active = false;
    };
    document.addEventListener('pointerdown', lower);
    return () => document.removeEventListener('pointerdown', lower);
  });
  $effect(() => {
    const settled = span;
    if (dragging === null) live = { ...settled };
  });

  /* The hint goes on the first move of a handle, by finger or by key, and
     never comes back. Local as well as preferred: the preference write is a
     round trip to SQLite and the line has to leave on the frame the drag
     starts, not when the write lands. */
  let hintGone = $state(false);
  let showHint = $derived(!hintSeen && !hintGone);
  /* Latched like a reserve: once the hint's line is drawn it keeps its
     place for the visit, so the preference write that answers it (which
     flips `hintSeen`) fades the words without taking the line away. */
  let hintDrawn = $state(false);
  $effect.pre(() => {
    if (!doorActive()) { hintDrawn = false; return; }
    if (!hintSeen) hintDrawn = true;
  });
  /* Crossfade date and day count together. The leaving text leaves flow so
     two long ranges cannot wrap the line. Skip the first mount's fade. */
  let dateFirstRun = true;
  const dateFadeIn = (node: Element) => {
    if (dateFirstRun) {
      dateFirstRun = false;
      return;
    }
    node.animate([{ opacity: 0 }, { opacity: 1 }], { duration: motionDuration('--dur-fast'), easing: EASE_OUT_CSS });
  };
  function answerHint() {
    if (!doorActive() || hintGone || hintSeen) return;
    hintGone = true;
    onHintSeen?.();
  }

  const x = (day: number) => railPosition(day, railStart, today) * railWidth;

  /* Extend a milestone's target to half the nearest gap, capped at
     12px each side. Keep its height clear of the history lanes and
     line. Marks closer than their 12px blocks can still overlap, as
     can concurrent regimen episodes. The dated list below supplies
     a full-size target for every fact. */
  const MARK_WIDTH = 12;
  const MARK_REACH_MAX = 12;
  let markReach = $derived.by(() => {
    const placed = [
      ...marks.map((mark) => ({ key: `milestone:${mark.id}`, at: x(mark.epochDay) })),
      ...surgeries.map((mark) => ({ key: `surgery:${mark.id}`, at: x(mark.epochDay) }))
    ];
    const reach = new Map<string, number>();
    for (const [index, mark] of placed.entries()) {
      let nearest = Infinity;
      for (const [other, peer] of placed.entries()) {
        if (other === index) continue;
        nearest = Math.min(nearest, Math.abs(peer.at - mark.at));
      }
      reach.set(mark.key, Math.max(0, Math.min(MARK_REACH_MAX, (nearest - MARK_WIDTH) / 2)));
    }
    return reach;
  });
  const reachOf = (key: string) => `${markReach.get(key) ?? 0}px`;

  let startX = $derived(x(live.start));
  let endX = $derived(x(live.end));
  /* Two dates can share one pixel on a one-day rail. Keep slider grips and
     their opposing hit areas apart, while their values stay on the real
     dates. */
  let handleXs = $derived(distinctHandlePositions(startX, endX, railWidth));
  /* Equal-day events still need a visible mark on the scale. Grow only the
     drawing; date values and selection ranges remain exact. */
  const segment = (from: number, to: number) =>
    visibleSegment(x(from), x(to), railWidth);
  /* The clip that lifts the span out of the history: the far edge of the
     end handle's day, so a one-day span is still a visible stretch. */
  let clipRight = $derived(Math.max(0, railWidth - Math.min(railWidth, endX + Math.max(2, pxPerDayAt(live.end)))));

  /* The day under a point on the rail, to the day: what a held handle
     follows. */
  const rawDayAtClientX = (clientX: number): number => {
    const box = rail?.getBoundingClientRect();
    if (!box || box.width === 0) return today;
    return dayAtPosition((clientX - box.left) / box.width, railStart, today);
  };
  /* Where a pointed-at day lands once the finger is off it: the grain where
     it stands, or a magnet within reach. */
  const snapTo = (raw: number): number =>
    snapDay(raw, { start: railStart, today, grain: grainFor(raw), magnets, toleranceDays: toleranceAt(raw) });
  const dayAtClientX = (clientX: number): number => snapTo(rawDayAtClientX(clientX));

  const settle = (next: Span) => {
    live = next;
    onLive?.(next);
  };
  /* A tap moves the span without dragging a handle. Dismiss the hint here
     too, before the handles move. */
  const commit = (next: Span) => {
    if (!doorActive()) return;
    answerHint();
    settle(next);
    onChange(next);
  };

  /* Handles: pointer capture so the drag survives leaving the rail, the
     raw day while held, and the snap plus the commit on release - in the
     same tick the drag class comes off, so the settle is the first move the
     transitions see. `touch-action: none` on the rail is what keeps the
     page from scrolling under a finger that is dragging sideways. */
  function onHandleDown(event: PointerEvent, handle: SpanHandle) {
    if (!doorActive()) return;
    const node = event.currentTarget as HTMLElement;
    node.setPointerCapture(event.pointerId);
    capture = { node, id: event.pointerId };
    dragging = handle;
  }
  function onHandleMove(event: PointerEvent, handle: SpanHandle) {
    if (!doorActive() || dragging !== handle) return;
    moving = true;
    answerHint();
    settle(moveHandle(live, handle, rawDayAtClientX(event.clientX)));
  }
  function onHandleUp(handle: SpanHandle) {
    if (!doorActive() || dragging !== handle) return;
    capture = undefined;
    dragging = null;
    moving = false;
    commit(moveHandle(live, handle, snapTo(handle === 'start' ? live.start : live.end)));
  }

  /* A key moves a handle by one step of the grain, ten with Shift, to the
     rail's ends with Home and End. The charts re-read a beat after the
     last key rather than on every press. */
  let keyTimer: ReturnType<typeof setTimeout> | undefined;
  let keyPending = false;
  const commitKeys = () => {
    keyPending = false;
    onChange(live);
  };
  let capture: { node: HTMLElement; id: number } | undefined;
  /* A hidden retained door holds still: a drag or a raised rail ends and
     the rail goes back to the committed span. A key move still waiting for
     its beat is committed first, not dropped, the same as when a door that
     unmounts lets the timer fire behind it. */
  $effect.pre(() => {
    if (doorActive()) return;
    if (keyPending) {
      clearTimeout(keyTimer);
      commitKeys();
    }
    active = false;
    dragging = null;
    moving = false;
    live = { ...untrack(() => span) };
    hintGone = false;
    if (capture?.node.hasPointerCapture(capture.id)) capture.node.releasePointerCapture(capture.id);
    capture = undefined;
  });
  function onHandleKey(event: KeyboardEvent, handle: SpanHandle) {
    if (!doorActive()) return;
    const current = handle === 'start' ? live.start : live.end;
    const step = grainFor(current) * (event.shiftKey ? 10 : 1);
    let next: number | null = null;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') next = current - step;
    if (event.key === 'ArrowRight' || event.key === 'ArrowUp') next = current + step;
    if (event.key === 'Home') next = railStart;
    if (event.key === 'End') next = today;
    if (next === null) return;
    event.preventDefault();
    answerHint();
    settle(moveHandle(live, handle, Math.min(today, Math.max(railStart, next))));
    clearTimeout(keyTimer);
    keyPending = true;
    keyTimer = setTimeout(commitKeys, 300);
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
  /* A stretch on the rail - an era, an episode, a tryout - sets the span to
     its own two days. One helper for all three, since what a band is made
     of stops mattering the moment somebody points at it. */
  const pickStretch = (band: { start: number; end: number }) => commit({ start: band.start, end: band.end });
  /* A mark is one day, and one day is not a reading: it sets the span to
     the door's own default window ending on it, the stretch a person means
     when they point at the day something happened. Bands set the span to
     themselves; marks set it to the month behind themselves. */
  const pickMark = (day: number) => commit(defaultSpan(railStart, day));

  /* A mark says what it is when pointed at: its name and day rise over it on hover, and a
     tap shows them for a few seconds as well as picking the stretch. The marks are hidden
     from the reader because the list under the rail holds the same facts as rows, so this
     label is for the eye only. */
  type MarkTip = { key: string; name: string; day: number; held: boolean };
  let tip = $state<MarkTip | null>(null);
  let tipTimer: ReturnType<typeof setTimeout> | undefined;
  const TIP_HOLD_MS = 3000;
  function hoverTip(event: PointerEvent, key: string, name: string, day: number) {
    if (event.pointerType !== 'mouse' || tip?.held) return;
    tip = { key, name, day, held: false };
  }
  function leaveTip(key: string) {
    if (tip && !tip.held && tip.key === key) tip = null;
  }
  function tapTip(key: string, name: string, day: number) {
    clearTimeout(tipTimer);
    tip = { key, name, day, held: true };
    tipTimer = setTimeout(() => {
      if (tip?.key === key) tip = null;
    }, TIP_HOLD_MS);
  }
  $effect(() => () => clearTimeout(tipTimer));
  /* Which way the label hangs: centred over the mark, or held to the side
     of it near either end of the rail so it never runs off the column. */
  const tipAnchor = (day: number) => {
    const at = railPosition(day, railStart, today);
    return at < 0.2 ? 'start' : at > 0.8 ? 'end' : 'middle';
  };
  /* Rises 4px into place as it fades in and only fades on the way out.
     Reduced motion keeps the fade. */
  function tipFade(_node: Element, _params?: unknown, options?: { direction?: 'in' | 'out' | 'both' }): TransitionConfig {
    const duration = motionDuration('--dur-fast');
    if (isReducedMotion() || options?.direction === 'out') return fadeOnly(duration);
    return { duration, easing: EASE_OUT, css: (t, u) => `opacity: ${t}; translate: 0 ${u * 4}px;` };
  }

  const valueText = (day: number) => fmtDay(day, { day: 'numeric', month: 'long', year: 'numeric' });
  /* The span written under the rail, in the words the range picker uses.
     Years only where they carry information: the start's when it is not
     this year, the end's when it is not this year either. */
  const dayWithYear = (day: number, year: number) =>
    fmtDay(
      day,
      localDateFromEpochDay(day).getFullYear() === year
        ? { day: 'numeric', month: 'short' }
        : { day: 'numeric', month: 'short', year: 'numeric' }
    );
  let spanDates = $derived(
    m.range_from_to({
      from: dayWithYear(live.start, localDateFromEpochDay(today).getFullYear()),
      to: dayWithYear(live.end, localDateFromEpochDay(today).getFullYear())
    })
  );

  /* The length counts rather than cutting, on the same rule the rest of
     this component follows: while a finger holds a handle the number is
     the day under it exactly, and every other change - a tap on a band, a
     mark, a key, the settle after a release - travels. `lastShown` mirrors
     the drawn number in a plain variable so the effect that writes it never
     reads its own state and re-runs itself, and so a count interrupted
     halfway carries on from the number on screen rather than from the one
     it was heading for. */
  const initialDays = initialSpan().end - initialSpan().start + 1;
  let shownDays = $state(initialDays);
  let lastShown = initialDays;
  $effect(() => {
    const days = live.end - live.start + 1;
    const held = dragging !== null;
    const show = (n: number) => {
      lastShown = n;
      shownDays = n;
    };
    if (!doorActive() || held) {
      show(days);
      return;
    }
    return countUp(lastShown, days, show);
  });
</script>

<div
  bind:this={root}
  class="span-tl"
  class:is-dragging={moving}
  class:is-active={active}
  data-span-timeline
  data-span-state={active ? 'raised' : 'rest'}
  data-rail-start={railStart}
  data-span-start={live.start}
  data-span-end={live.end}
  style:--tl-start="{handleXs.start}px"
  style:--tl-end="{handleXs.end}px"
  style:--tl-span-start="{startX}px"
  style:--tl-clip-right="{clipRight}px"
  style:--tl-has-regimen={hasRow('regimen')}
  style:--tl-has-tryout={hasRow('tryout')}
  style:--tl-flag={flagFill && flagFill !== 'none' ? flagFill : null}
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
  <div
    class="span-tl-rail"
    bind:this={rail}
    onclick={onRailClick}
    onpointerdowncapture={raise}
    onfocusin={raise}
    onfocusout={onFocusOut}
    {...roleAttrs(markRole)}
  >
    {#each ticks as tick (tick.year)}
      <span class="span-tl-tick" style:left="{railPosition(tick.epochDay, railStart, today) * 100}%" aria-hidden="true"></span>
    {/each}

    <!-- The whole history, low. The journal's own stretch first - from the
         first entry to today, in the page's second surface - so a rail with
         no eras still has a body, and the eras lie over it. -->
    <div class="span-tl-low" aria-hidden="true">
      {#if firstEntryDay !== null}
        {@const journal = segment(firstEntryDay, today)}
        <span class="span-tl-band span-tl-journal" style:left="{journal.left}%" style:width="{journal.width}%"></span>
      {/if}
      {#each bands as band, i (band.id)}
        {@const shape = segment(band.start, band.end)}
        <span
          class="span-tl-band"
          style:left="{shape.left}%"
          style:width="{shape.width}%"
          {...roleAttrs(bandRole(i))}
        ></span>
      {/each}
    </div>

    <!-- The same history at full height, clipped to the span, with the
         frame as this layer's own two edges. Drawing only: the clip would
         hide a control that stood outside the span, so the controls are
         the layer under this one. The clip is two windows moved by
         translate, each with its drawing moved back by the same amount
         (the styles say why), so the five wrappers stand at one indent. -->
    <div class="span-tl-window" aria-hidden="true">
    <div class="span-tl-window-start">
    <div class="span-tl-window-in">
    <div class="span-tl-window-end">
    <div class="span-tl-full">
      {#if firstEntryDay !== null}
        {@const journal = segment(firstEntryDay, today)}
        <span class="span-tl-band span-tl-journal" style:left="{journal.left}%" style:width="{journal.width}%"></span>
      {/if}
      {#each bands as band, i (band.id)}
        {@const shape = segment(band.start, band.end)}
        {@const left = shape.leftPx}
        {@const right = left + shape.widthPx}
        {@const shownFrom = Math.max(left, startX)}
        {@const shownTo = Math.min(right, railWidth - clipRight)}
        <!-- The name sits at the left edge of the part of the band the clip
             shows, not of the band: a band that runs on under the start
             handle would otherwise show only the tail of its name. It
             rides the clip's edge as the span moves. -->
        <span
          class="span-tl-band span-tl-era"
          class:is-open-start={band.openStart}
          class:is-open-end={band.openEnd}
          style:left="{left}px"
          style:width="{right - left}px"
          {...roleAttrs(bandRole(i))}
        >
          {#if shownTo - shownFrom >= NAME_MIN_PX}
            <span class="span-tl-era-name" style:left="{shownFrom - left + 8}px" style:max-width="{shownTo - shownFrom - 16}px"><span class="span-tl-era-text">{band.name}</span></span>
          {/if}
        </span>
      {/each}
    </div>
    </div>
    </div>
    </div>
    </div>

    <!-- The eras as targets: one transparent button per era, the rail's full height across
         the era's stretch, inside the span or out of it. Pointing anywhere in an era's
         column selects the era whole.

         This one and every other target drawn on the rail below - the history bands and the
         day marks - is for a finger or a pointer only: out of the tab order and hidden from
         assistive tech. They cannot all be 48px, and most cannot be 24: a band is 8px or
         6px high and two milestones a fortnight apart are three pixels apart. The list
         under the rail (SpanFacts) holds every one of these facts as a row at the target
         floor, with its dates written out, and sets the same span; that is the way in for
         Tab and TalkBack. The rail's own controls for them are the two handles, which are
         48px. -->
    <div class="span-tl-targets">
      {#each bands as band (band.id)}
        {@const shape = segment(band.start, band.end)}
        <button
          type="button"
          class="span-tl-era-target"
          style:left="{shape.left}%"
          style:width="{shape.width}%"
          data-span-era={band.id}
          data-no-press
          tabindex="-1"
          aria-hidden="true"
          aria-label={m.lookback_era_aria({ name: band.name })}
          onclick={() => pickStretch(band)}
        ></button>
      {/each}
    </div>

    <!-- The rest of the history, low: one lane per kind, each band its own
         control. Drawn and tapped by the same element, unlike the eras -
         nothing clips these, so the drawing can carry the target. -->
    {#each history as band (band.id)}
      {@const shape = segment(band.start, band.end)}
      <button
        type="button"
        class="span-tl-hband"
        class:is-open-start={band.openStart}
        class:is-open-end={band.openEnd}
        style:left="{shape.left}%"
        style:width="{shape.width}%"
        data-span-band={band.kind}
        data-no-press
        tabindex="-1"
        aria-hidden="true"
        aria-label={m.lookback_band_aria({
          name: bandName(band),
          from: valueText(band.start),
          to: valueText(band.end)
        })}
        onclick={() => pickStretch(band)}
      ></button>
    {/each}

    <!-- Milestones: a block each on the axis, in the flag's first colour. -->
    {#each marks as mark (mark.id)}
      <button
        type="button"
        class="span-tl-mark"
        style:left="{railPosition(mark.epochDay, railStart, today) * 100}%"
        style:--mark-reach={reachOf(`milestone:${mark.id}`)}
        data-span-milestone={mark.id}
        data-no-press
        tabindex="-1"
        aria-hidden="true"
        aria-label={m.lookback_mark_aria({ name: mark.name })}
        onpointerenter={(event) => hoverTip(event, `milestone:${mark.id}`, mark.name, mark.epochDay)}
        onpointerleave={() => leaveTip(`milestone:${mark.id}`)}
        onclick={() => {
          tapTip(`milestone:${mark.id}`, mark.name, mark.epochDay);
          pickMark(mark.epochDay);
        }}
      ></button>
    {/each}

    <!-- A surgery day: the same mark a milestone gets, because it is the
         same kind of thing on this rail - a day that happened. What tells
         them apart is the label and the legend, not the weight. -->
    {#each surgeries as mark (mark.id)}
      <button
        type="button"
        class="span-tl-mark"
        style:left="{railPosition(mark.epochDay, railStart, today) * 100}%"
        style:--mark-reach={reachOf(`surgery:${mark.id}`)}
        data-span-surgery={mark.id}
        data-no-press
        tabindex="-1"
        aria-hidden="true"
        aria-label={m.lookback_mark_aria({ name: mark.name ?? m.lookback_legend_surgery() })}
        onpointerenter={(event) => hoverTip(event, `surgery:${mark.id}`, mark.name ?? m.lookback_legend_surgery(), mark.epochDay)}
        onpointerleave={() => leaveTip(`surgery:${mark.id}`)}
        onclick={() => {
          tapTip(`surgery:${mark.id}`, mark.name ?? m.lookback_legend_surgery(), mark.epochDay);
          pickMark(mark.epochDay);
        }}
      ></button>
    {/each}

    {#key tip?.key}
      {#if tip}
        <span
          class="span-tl-tip"
          data-anchor={tipAnchor(tip.day)}
          style:left="{railPosition(tip.day, railStart, today) * 100}%"
          data-span-tip={tip.key}
          aria-hidden="true"
          transition:tipFade|global
        >
          <span class="span-tl-tip-name">{tip.name}</span>
          <span class="span-tl-tip-day">{valueText(tip.day)}</span>
        </span>
      {/if}
    {/key}

    <!-- Today, in ink: the one mark on the rail that is not the person's. -->
    <span class="span-tl-today" aria-label={m.tl_you_are_here()} role="img"></span>

    {#each ['start', 'end'] as const as handle (handle)}
      <!-- A div with the slider role rather than a button: slider is not a
           role a button may take, and a button's own role wins in some
           readers (after-release 21, audit L05-08). -->
      <div
        tabindex="0"
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
        <span class="span-tl-grip" aria-hidden="true"><span class="span-tl-grip-ink"></span></span>
      </div>
    {/each}
  </div>

  <!-- Keep the reading next to the rail handles. -->
  <p class="span-tl-state" data-span-state-line>
    {#key spanDates}<span class="span-tl-reading" out:crossfade use:dateFadeIn>{spanDates}{`, ${m.n_days({ n: shownDays })}`}</span>{/key}
  </p>

  <!-- The one-time hint, gone on the first move of either handle. Under
       the rail's own reading rather than on the rail (release audit U14:
       at rest it sat over the lanes it is about). In flow, and it fades
       where it stands rather than leaving: its line stays for the rest of
       this visit, so nothing under it moves, and the next visit never
       draws it. Not a control and not announced: the handles already
       carry their own names, and a slider that read out "drag the ends"
       every time it took focus would be worse than silent. -->
  {#if hintDrawn}
    <p class="span-tl-hint" class:is-hidden={!showHint} data-span-hint aria-hidden="true">
      {m.lookback_drag_hint()}
    </p>
  {/if}

  {#if legend.length}
    <ul class="span-tl-legend" data-span-legend aria-label={m.lookback_legend_group()}>
      {#each legend as kind (kind)}
        <li class="span-tl-key" data-span-key={kind}>
          <span class="span-tl-chip" data-span-chip={kind} aria-hidden="true"></span>
          {LEGEND_WORD[kind]()}
        </li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  .span-tl {
    position: relative;
    /* Room for the two handles to overhang the rail's ends. */
    padding-inline: calc(var(--handle) / 2);
    --handle: 48px;
    --grip: 14px;
    --rail-h: 52px;
    --low-h: 8px;
    /* Stack one lane per present history kind. Leave room for 12px axis marks
       and keep the era strip separate. Solid and outlined lanes have different
       heights. Presence flags reserve zero height when a lane is absent. */
    --row-regimen: 8px;
    --row-tryout: 6px;
    --mark-gutter: 7px;
    --row-rule: 2px;
    --tl-rows: max(var(--tl-has-regimen, 0), var(--tl-has-tryout, 0));
    --hist-h: calc(
      var(--tl-rows) * (var(--mark-gutter) + var(--row-rule)) +
        var(--tl-has-regimen, 0) * var(--row-regimen) + var(--tl-has-tryout, 0) * var(--row-tryout)
    );
    /* What is left for the span to stand up in. */
    --span-h: calc(var(--rail-h) - var(--hist-h));
    /* How much of the lifted layer and of a grip shows at rest. A share of
       the span's own height rather than a fixed 18px, so a rail carrying
       three lanes still has a rise worth watching: 2.9 is what puts a rail
       with no history back at the 18px this shipped with. The floor is the
       history strip plus five, because the resting span is meant to read as
       "a band a little taller than the history under it" and a share of a
       27px layer is not taller than an 8px strip. */
    --rest-h: max(calc(var(--low-h) + 5px), calc(var(--span-h) / 2.9));
    --rest-grip: 26px;
  }

  .span-tl-years {
    position: relative;
    height: 18px;
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

  /* Both layers stop above the history lanes: a band drawn behind the span
     would be covered by it exactly where somebody is looking. */
  .span-tl-low,
  .span-tl-window {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: var(--hist-h);
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
    /* Every block wears an edge, so eras with similar stripes still read
       as separate bands. */
    border: 1px solid var(--outline);
    border-radius: 0;
    font: inherit;
  }

  /* Two translated clipping boxes reveal the lifted bands. The outer box
     moves the start and top edges, and the inner moves the end. Counter-
     translate each box's contents by the same amount on the same timing
     to keep the drawing still through reversal or retargeting. A fixed
     parent clips the result so it cannot widen the page.

     Composited translate keeps the edges moving during readings updates.
     The old clip-path stalled for 80–110ms at 6x CPU slowdown and
     caught up by 125px in one frame. */
  .span-tl-window {
    overflow: clip;
  }
  .span-tl-window-start {
    position: absolute;
    inset: 0;
    overflow: clip;
    translate: var(--tl-span-start) calc(100% - var(--rest-h));
    transition: translate var(--dur-med) var(--ease-out);
  }
  .span-tl-window-in {
    position: absolute;
    inset: 0;
    translate: calc(-1 * var(--tl-span-start)) calc(var(--rest-h) - 100%);
    transition: translate var(--dur-med) var(--ease-out);
  }
  .is-active .span-tl-window-start {
    translate: var(--tl-span-start) 0;
  }
  .is-active .span-tl-window-in {
    translate: calc(-1 * var(--tl-span-start)) 0;
  }
  .span-tl-window-end {
    position: absolute;
    inset: 0;
    overflow: clip;
    translate: calc(-1 * var(--tl-clip-right)) 0;
    transition: translate var(--dur-med) var(--ease-out);
  }
  .span-tl-full {
    position: absolute;
    inset: 0;
    border-top: 3px solid var(--text);
    border-bottom: 3px solid var(--text);
    translate: var(--tl-clip-right) 0;
    transition: translate var(--dur-med) var(--ease-out);
  }

  .span-tl-full .span-tl-band {
    position: absolute;
    top: 0;
    bottom: 0;
    overflow: hidden;
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

  /* The name opens with the band rather than being revealed by it. The
     layer's own clip used to hide the names at rest, and it cannot once the
     history lanes have taken part of the rail's height: what is left for
     the span is shorter than a name is tall, so a resting rail showed the
     bottom five pixels of every era's name. So the name carries a clip of
     its own, opening upward on the same duration and curve the band's does
     - a wipe rather than a fade, which is rule 10's own answer. Drawn the
     way the window is, so it opens on the compositor with the band: the
     name's box slides up from a whole height below and its words slide
     down by the same, so only the box's top edge travels. */
  .span-tl-era-name {
    position: absolute;
    top: 6px;
    font-size: 0.8125rem;
    font-weight: var(--weight-bold);
    letter-spacing: 0.02em;
    line-height: 1.2;
    overflow: clip;
    translate: 0 100%;
    transition: translate var(--dur-med) var(--ease-out);
  }
  .span-tl-era-text {
    display: block;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    translate: 0 -100%;
    transition: translate var(--dur-med) var(--ease-out);
  }
  .is-active .span-tl-era-name,
  .is-active .span-tl-era-text {
    translate: 0 0;
  }
  /* A name drawn while its band is already open - the part of the band the
     span shows has just grown past NAME_MIN_PX - had no closed state to
     travel from, so it was painted whole in one frame (carpet 15 row 51,
     span-offer-appear, 0 to 0.9 between 51 and 68ms). It opens from closed
     like one that opens with its band. */
  @starting-style {
    .is-active .span-tl-era-name {
      translate: 0 100%;
    }
    .is-active .span-tl-era-text {
      translate: 0 -100%;
    }
  }

  .span-tl-targets {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: var(--hist-h);
    pointer-events: none;
  }
  .span-tl-era-target {
    position: absolute;
    top: 0;
    bottom: 0;
    padding: 0;
    margin: 0;
    border: 0;
    background: transparent;
    pointer-events: auto;
    cursor: pointer;
    z-index: 1;
  }

  /* Use a 1px page-coloured edge to distinguish adjacent ink
     bands. The band itself is the pointer target. Extending it
     would overlap consecutive episodes or neighbouring lanes.
     Keep bands out of the tab order because the dated list
     provides each fact at the full target size. */
  .span-tl-hband {
    position: absolute;
    box-sizing: border-box;
    min-width: 6px;
    padding: 0;
    margin: 0;
    border: 1px solid var(--bg);
    border-radius: 0;
    cursor: pointer;
    z-index: 1;
  }
  /* Both rows are the secondary ink, not the primary. Three weights on the
     rail and each says what it is: the flag is an era, full ink is the two
     things that are now - the span's own frame and the marks - and this
     grey is the context under them. Drawn in full ink first, and the render
     put the heaviest object on the rail under the one the rail exists to
     set. `--text-2` measures 4.90:1 on the page, well past the 3:1 a
     graphic owes.

     The regimen sits on the gutter and is solid: it is the stretch that
     runs, usually under everything else here, and a filled bar is what
     "this was true the whole time" looks like. */
  .span-tl-hband[data-span-band='regimen'] {
    bottom: var(--mark-gutter);
    height: var(--row-regimen);
    background: var(--text-2);
  }
  /* A tryout sits above it and is hollow: something held up against a life
     for a while rather than a fact of it, and an outline is the shape that
     says so without asking the flag for a second colour. */
  .span-tl-hband[data-span-band='tryout'] {
    bottom: calc(var(--mark-gutter) + var(--tl-has-regimen, 0) * var(--row-regimen));
    height: var(--row-tryout);
    background: var(--bg);
    border-color: var(--text-2);
  }
  .span-tl-hband.is-open-start { border-left: 0; }
  .span-tl-hband.is-open-end { border-right: 0; }

  /* A milestone is a 12px ink block edged in the page colour. Ink stays
     visible over any era band. The marks and today's line tell time,
     while the bands carry the person's eras. */
  .span-tl-mark {
    position: absolute;
    bottom: -7px;
    width: 12px;
    height: 12px;
    padding: 0;
    margin: 0;
    transform: translateX(-50%);
    background: var(--text);
    border: 1px solid var(--bg);
    /* A bar end's radius (rule 9), since the mark is a 12px block standing
       on the axis like a bar's foot; 6px would make it a disc, and discs
       are faces. */
    border-radius: 2px;
    cursor: pointer;
    z-index: 2;
  }

  /* A mark's name and day, over it. Opaque on the page's second
     surface inside a hairline, as the kit separates anything laid over
     marks: no shadow. Over everything on the rail, handles included: a
     tap brings a handle onto the very mark it names. */
  .span-tl-tip {
    position: absolute;
    bottom: 14px;
    z-index: 4;
    display: grid;
    gap: 2px;
    max-width: min(240px, 70vw);
    padding: var(--space-2) var(--space-3);
    background: var(--surface-2);
    border: 1px solid var(--outline);
    border-radius: var(--r-block);
    color: var(--text);
    font-size: var(--text-sm);
    line-height: 1.35;
    white-space: nowrap;
    pointer-events: none;
    transform: translateX(-50%);
  }
  .span-tl-tip[data-anchor='start'] { transform: translateX(-12px); }
  .span-tl-tip[data-anchor='end'] { transform: translateX(calc(-100% + 12px)); }
  .span-tl-tip-name {
    font-weight: var(--weight-bold);
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .span-tl-tip-day { color: var(--text-2); }

  /* The target is wider than the mark. */
  /* The target: the block, the 2px of gutter above it before the history
     lanes begin, and however much room it has sideways before the next
     mark (`markReach` above). Nothing below, because the line that says
     which span the rail is holding is 8px under the rail and a tap on it
     may not move the span. */
  .span-tl-mark::before {
    content: '';
    position: absolute;
    inset: -2px calc(-1 * var(--mark-reach, 0px)) 0;
  }

  /* Short, standing on the axis: a line the rail's whole height read as a
     mark of its own when the span stopped short of today (the critique's
     "detached tick"). */
  .span-tl-today {
    position: absolute;
    bottom: -4px;
    right: 0;
    width: 3px;
    height: calc(var(--low-h) + 12px);
    background: var(--text);
    pointer-events: none;
    z-index: 2;
  }

  /* The handles: the grip of ink is drawn in the middle of its day, and the button around
     it is the 48px target, reaching away from the span - left of the start's grip, right of
     the end's - so at a short span the two targets meet at the grips rather than lying on
     top of each other, and a finger on either grip gets the handle it can see. Placed by
     transform alone, so a move is a transform and nothing else.

     The target is the button's own box rather than a pseudo element around a 14px button: a
     hit area drawn by `::before` answers a finger, but the box an accessibility service
     measures and announces is the element's, and that was 14px wide. Same geometry as
     before: the handle's width plus the 6px the grip's far side carried, from the same left
     edge. */
  .span-tl-handle {
    position: absolute;
    top: -6px;
    bottom: -6px;
    width: calc(var(--handle) + 6px);
    padding: 0;
    margin: 0;
    border: 0;
    background: transparent;
    cursor: ew-resize;
    z-index: 3;
    touch-action: none;
    transition: transform var(--dur-med) var(--ease-out);
  }
  .span-tl-handle.is-start {
    left: calc(var(--grip) / 2 - var(--handle));
    transform: translateX(var(--tl-start));
  }
  .span-tl-handle.is-end {
    left: calc(var(--grip) / -2 - 6px);
    transform: translateX(var(--tl-end));
  }

  /* The grip rises with the window, on the compositor the same way: its
     rounded box slides up from where only the resting 26px show, and the
     ink inside slides down by the same, so the grip and the band it
     frames keep rising together through a busy main thread. */
  .span-tl-grip {
    position: absolute;
    top: 0;
    bottom: 0;
    width: var(--grip);
    border-radius: var(--r-block);
    overflow: clip;
    translate: 0 calc(100% - var(--rest-grip));
    transition:
      translate var(--dur-med) var(--ease-out),
      scale var(--dur-fast) var(--ease-out);
  }
  .span-tl-grip-ink {
    position: absolute;
    inset: 0;
    background: var(--text);
    border-radius: var(--r-block);
    translate: 0 calc(var(--rest-grip) - 100%);
    transition: translate var(--dur-med) var(--ease-out);
  }
  .is-start .span-tl-grip { left: calc(var(--handle) - var(--grip)); }
  .is-end .span-tl-grip { left: 6px; }
  .is-active .span-tl-grip,
  .is-active .span-tl-grip-ink {
    translate: 0 0;
  }
  .span-tl-grip-ink::after {
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
  .is-dragging .span-tl-window-start,
  .is-dragging .span-tl-window-in,
  .is-dragging .span-tl-window-end,
  .is-dragging .span-tl-full {
    transition: none;
  }
  .span-tl-handle.is-held .span-tl-grip {
    scale: 1.25 1;
  }

  /* The keyboard's ring goes round the grip, as a box of its own over the
     grip's place at full height: drawn on the grip, it sat inside the
     grip's clip and was never painted (carpet 15 row 51), and the grip's
     box travels with the rise, so a ring on it would rise from below the
     rail. Focus raises the rail, so the grip fills this box a moment
     later. Instant, like every other control's ring in the kit. The 2px
     between grip and ring is filled with the page's ground rather than
     left open: in dark the ring is a light pink, and across the light
     blue of an era band it measured 1.09:1, so the ground keeps it at
     least 6:1 against what touches it on one side wherever it runs. */
  .span-tl-handle:focus-visible {
    outline: none;
  }
  .span-tl-handle::after {
    content: '';
    position: absolute;
    top: -2px;
    bottom: -2px;
    box-sizing: border-box;
    width: calc(var(--grip) + 4px);
    border-radius: calc(var(--r-block) + 2px);
    pointer-events: none;
  }
  .span-tl-handle.is-start::after { left: calc(var(--handle) - var(--grip) - 2px); }
  .span-tl-handle.is-end::after { left: 4px; }
  .span-tl-handle:focus-visible::after {
    border: 2px solid var(--bg);
    outline: var(--focus-ring-width) solid var(--focus-ring);
  }

  /* The one-time hint, a line of small type under the reading. */
  .span-tl-hint {
    margin: var(--space-1) 0 0;
    color: var(--text-2);
    font-size: var(--text-xs);
    font-weight: var(--weight-medium);
    transition: opacity var(--dur-med) var(--ease-out);
  }
  .span-tl-hint.is-hidden {
    opacity: 0;
  }

  /* The span, written once, directly under the rail. */
  .span-tl-state {
    margin: var(--space-2) 0 0;
    font-size: var(--text-sm);
    color: var(--text-2);
  }
  .span-tl-reading {
    font-variant-numeric: tabular-nums;
  }

  /* The legend: one line, wrapping where it has to, naming only the kinds
     this journal has. Small type on the page, so every chip owes its own
     edge rather than a contrast floor its fill would fail. */
  .span-tl-legend {
    display: flex;
    flex-wrap: wrap;
    gap: 2px var(--space-3);
    margin: var(--space-1) 0 0;
    padding: 0;
    list-style: none;
    font-size: var(--text-xs);
    color: var(--text-2);
  }
  .span-tl-key {
    display: flex;
    align-items: center;
    gap: 5px;
  }
  /* Each key is its own mark at its own size, not one swatch recoloured
     four ways: what tells the kinds apart on the rail is shape, so a legend
     of identical chips would be a legend of a different rail. */
  .span-tl-chip {
    display: block;
    box-sizing: border-box;
    width: 14px;
    border: 1px solid var(--text-2);
  }
  /* The eras are the one kind whose colour is plural - they run the flag,
     one colour per era - so their key is the flag itself rather than any
     one stripe, which is also what keeps it clear of everything else here.
     The unlocked app always uses the flag, disguise or not (FA 42), so the
     variable is set here; the outline alone is the fallback for a flag with
     no colour of its own. */
  .span-tl-chip[data-span-chip='era'] {
    height: var(--low-h);
    background: var(--tl-flag, transparent);
  }
  .span-tl-chip[data-span-chip='regimen'] {
    height: var(--row-regimen);
    background: var(--text-2);
    border-color: var(--bg);
  }
  .span-tl-chip[data-span-chip='tryout'] {
    height: var(--row-tryout);
    background: var(--bg);
    border-color: var(--text-2);
  }
  /* A mark, drawn as one: the milestone block's own size and radius. One
     key for milestones and surgery days alike, since the rail draws them
     the same; only its word changes. */
  .span-tl-chip[data-span-chip='surgery'],
  .span-tl-chip[data-span-chip='milestone'],
  .span-tl-chip[data-span-chip='milestone-and-surgery'] {
    width: 8px;
    height: 8px;
    background: var(--text);
    border-color: var(--bg);
    border-radius: 2px;
  }
</style>
