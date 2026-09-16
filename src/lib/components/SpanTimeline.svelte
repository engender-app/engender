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
     handle follows it exactly, to the day under the finger with no snap
     and no transition, and the transitions run only on the moves that are
     not the finger's - a tap on an era, a tap on a milestone, a key press -
     and on the settle after a release, when the day snaps to its grain or
     to a magnet and the handle, the clip and the frame travel there on
     --dur-med (redesign ticket 19; ticket 11 snapped on every move, so the
     handle stepped under the finger and the release had nothing left to
     settle). A video trimmer's bracket works the same way (Mobbin: the
     Shopee and Google Photos trimmers), and it is the movement that tells a
     person the span they let go of is a whole number of weeks. Reduced
     motion clamps every one of those to the 1ms base.css already imposes on
     transitions; nothing here animates by script.

     The span is committed on release, not on every move: the charts under
     the door re-read on commit, and re-reading six queries per pointer
     event is not what a drag is for. `onLive` is for the one line that has
     to follow the finger, the span written under the rail.

     ## What the rail says about itself (phase 11 ticket 06)

     Three things the rail had not been saying, and none of them is a
     decoration.

     **It draws the stretches it never drew.** Under the eras lie one lane
     per kind of stretch the journal holds - a regimen episode, a tryout -
     and a procedure's surgery day is a mark on the axis like a milestone's.
     Each of those is tap-to-select the way an era already was, so "my moods
     over the HRT episode" is a stretch somebody can point at rather than
     one they have to reconstruct with two handles. The lanes sit below the
     lifted layer rather than behind it: a band drawn behind the span would
     be covered by it exactly where the person is looking.

     **Colour on this rail means an era, and nothing else.** The first build
     gave the lanes flag stripes of their own and drew a third lane for the
     journaling pauses, and the renders were unreadable (Alicja, 2026-09-16:
     "they're crowded, they use the same colors, it looks bad"): trans,
     nonbinary and pansexual yield two band colours, so the regimen lane
     came out the same blue as the first era and the tryout lane the same
     pink as the second, three lanes deep at 6px each.

     So the eras keep the flag, which is theirs - one colour per era, the
     way ticket 11 settled - and the two rows are drawn in ink: the regimen
     solid, the tryout hollow, both in the secondary weight. That is the
     call the milestone mark on this same rail already made, and its own
     note says why - a stripe sitting under the eras' colours vanishes into
     the band of its own hue, and DIRECTION rule 4 gives ink to the smallest
     things. It cannot collide on any palette or under disguise, because it
     never asks the flag for anything.

     Three weights, and each says what it is: the flag is an era, full ink
     is the two things that are now - the span's own frame and the marks -
     and the secondary ink is the context under them. Drawn at full ink
     first, and the render put the heaviest object on the rail under the one
     the rail exists to set.

     And the breaks came off the rail entirely: a break is the absence of a
     journal rather than a stretch of a life, and the chart's annotation
     band still draws them where they explain a flat stretch.

     **It says it can be dragged, and what it is showing.** The span, its
     length and the legend sit directly under the rail against the handles
     rather than two elements away as a subtitle of the door's title, and on
     a journal where nobody has dragged it yet a one-time line sits between
     the handles (Mobbin: Google Photos' trim tooltip, where the bracket
     shape alone was not enough either). It fades on the first move of a
     handle and never comes back - one preference, keyed the way the other
     one-time hints are. The length counts rather than cutting when the span
     changes by something other than a finger, which is the same rule the
     rest of this component follows and the same primitive a live tile's
     value uses. */
  import { m } from '$lib/paraglide/messages';
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
  import { fadeOnly, motionDuration } from '$lib/motion/tokens';
  import type { Era, Milestone } from '$lib/data/types';
  import { chromaticRoles, roleAt, type Role } from '$lib/theme/roles';
  import { roleAttrs } from './kit/role';

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
        kind here whose colour is plural. `'none'` under disguise
        (ADR-0035), where the key falls back to an outline with no fill. */
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

  /* Which history rows this journal earns. A kind with nothing in it takes
     no row and no height, so a journal with only tryouts gets one row
     rather than one row and an empty one. */
  let rows = $derived(historyKindsPresent(history));
  let legend = $derived(railLegendKinds(history, surgeries, bands.length > 0));
  const hasRow = (kind: RailHistoryKind) => (rows.includes(kind) ? 1 : 0);

  /* One band of the flag per era, in order, wrapping over the flag's
     colours - and, on a flag with a single colour (agender), over its
     shades too, so its second and third era are black and grey rather than
     green three times (Alicja, on the first renders: "we can't have all
     eras in the same colour"). A black or white block is a block here
     because every band wears the 1px edge rule 4 gives it; a flag with two
     or more colours never needs one. Nothing is skipped, since the marks
     are ink and take no band, and neither does a history lane. */
  let markRole = $derived(roleAt(roles, 0));
  let bandRoles = $derived.by(() => {
    const colours = chromaticRoles(roles);
    if (colours.length >= 2) return colours;
    return [...colours, ...roles.filter((role) => !colours.includes(role))];
  });
  const bandRole = (index: number): Role | undefined =>
    bandRoles.length ? bandRoles[index % bandRoles.length] : undefined;

  const LEGEND_WORD: Record<RailLegendKind, () => string> = {
    era: () => m.lookback_legend_eras(),
    regimen: () => m.lookback_legend_regimen(),
    tryout: () => m.lookback_legend_tryouts(),
    surgery: () => m.lookback_legend_surgery()
  };
  /* The query types a band's name nullable because a journaling pause has
     none, and neither kind drawn here is that one - so the fallback is the
     kind's own word rather than a band with no label at all. */
  const bandName = (band: RailBand) => band.name ?? LEGEND_WORD[band.kind]();

  /* The span as the finger has it, which is the settled span whenever no
     finger holds a handle. */
  let live = $state<Span>({ start: 0, end: 0 });
  let dragging = $state<SpanHandle | null>(null);
  /* Set on the first move after a handle is taken, not on the take: a tap
     on a grip is a take and a release with no move between, and it has to
     raise the rail with the transition on - the first recording showed the
     span cut to full height while the grips grew, because the take alone
     had switched the transition off. */
  let moving = $state(false);

  /* At rest the rail is low: the span is a band a little taller than the
     history under it and the handles are two short grips on the axis,
     suggested rather than offered (Alicja, on the first renders: "the
     handles are suggested but are not as high/big. they only get bigger
     when the user taps"). The first touch or focus anywhere on the rail
     raises it - the lifted bands, the frame, the era names and the full
     grips clip open upwards on --dur-med - and a touch or focus that leaves
     the rail lowers it again. The rail's box never changes height, so
     nothing under it moves either way. */
  let root = $state<HTMLElement | undefined>();
  let active = $state(false);
  const raise = () => (active = true);
  function onFocusOut(event: FocusEvent) {
    if (root && event.relatedTarget instanceof Node && root.contains(event.relatedTarget)) return;
    active = false;
  }
  $effect(() => {
    if (!active) return;
    const lower = (event: PointerEvent) => {
      if (root && event.target instanceof Node && root.contains(event.target)) return;
      /* A control that leaves the screen with the span - the way into its
         retrospective - keeps the rail raised, so the stretch the person
         chose is the last thing standing while the door goes rather than
         a thing folding away under a finger that just used it (redesign
         ticket 19). The host marks it; the rail knows nothing about
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
  const hintFade = (_node: Element) => fadeOnly(motionDuration('--dur-med'));
  function answerHint() {
    if (hintGone || hintSeen) return;
    hintGone = true;
    onHintSeen?.();
  }

  const x = (day: number) => railPosition(day, railStart, today) * railWidth;
  let startX = $derived(x(live.start));
  let endX = $derived(x(live.end));
  /* Between the two handles, and held inside the rail by its own half-width
     so a span sitting at either end does not push the line off the screen -
     which is what the default span, the last thirty days against today's
     edge, does every first time. */
  let hintWidth = $state(0);
  let hintX = $derived(
    Math.min(railWidth - hintWidth / 2, Math.max(hintWidth / 2, (startX + endX) / 2))
  );
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
  const commit = (next: Span) => {
    settle(next);
    onChange(next);
  };

  /* Handles: pointer capture so the drag survives leaving the rail, the
     raw day while held, and the snap plus the commit on release - in the
     same tick the drag class comes off, so the settle is the first move the
     transitions see. `touch-action: none` on the rail is what keeps the
     page from scrolling under a finger that is dragging sideways. */
  function onHandleDown(event: PointerEvent, handle: SpanHandle) {
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    dragging = handle;
  }
  function onHandleMove(event: PointerEvent, handle: SpanHandle) {
    if (dragging !== handle) return;
    moving = true;
    answerHint();
    settle(moveHandle(live, handle, rawDayAtClientX(event.clientX)));
  }
  function onHandleUp(handle: SpanHandle) {
    if (dragging !== handle) return;
    dragging = null;
    moving = false;
    commit(moveHandle(live, handle, snapTo(handle === 'start' ? live.start : live.end)));
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
    answerHint();
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
  /* A stretch on the rail - an era, an episode, a tryout - sets the span to
     its own two days. One helper for all three, since what a band is made
     of stops mattering the moment somebody points at it. */
  const pickStretch = (band: { start: number; end: number }) => commit({ start: band.start, end: band.end });
  /* A mark is one day, and one day is not a reading: it sets the span to
     the door's own default window ending on it, the stretch a person means
     when they point at the day something happened. Bands set the span to
     themselves; marks set it to the month behind themselves. */
  const pickMark = (day: number) => commit(defaultSpan(railStart, day));

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
    m.wrapped_week_range({
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
  let shownDays = $state(0);
  let lastShown = 0;
  $effect(() => {
    const days = live.end - live.start + 1;
    const held = dragging !== null;
    const show = (n: number) => {
      lastShown = n;
      shownDays = n;
    };
    if (held) {
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
  style:--tl-start="{startX}px"
  style:--tl-end="{endX}px"
  style:--tl-hint-x="{hintX}px"
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

    <!-- The same history at full height, clipped to the span, with the
         frame as this layer's own two edges. Drawing only: the clip would
         hide a control that stood outside the span, so the controls are
         the layer under this one. -->
    <div class="span-tl-full" aria-hidden="true">
      {#if firstEntryDay !== null}
        <span class="span-tl-band span-tl-journal" style:left="{railPosition(firstEntryDay, railStart, today) * 100}%" style:width="{(1 - railPosition(firstEntryDay, railStart, today)) * 100}%"></span>
      {/if}
      {#each bands as band, i (band.id)}
        {@const left = railPosition(band.start, railStart, today) * railWidth}
        {@const right = railPosition(band.end, railStart, today) * railWidth}
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
            <span class="span-tl-era-name" style:left="{shownFrom - left + 8}px" style:max-width="{shownTo - shownFrom - 16}px">{band.name}</span>
          {/if}
        </span>
      {/each}
    </div>

    <!-- The eras as controls: one transparent button per era, the rail's
         full height across the era's stretch, inside the span or out of it.
         Pointing anywhere in an era's column selects the era whole. -->
    <div class="span-tl-targets">
      {#each bands as band (band.id)}
        <button
          type="button"
          class="span-tl-era-target"
          style:left="{railPosition(band.start, railStart, today) * 100}%"
          style:width="{(railPosition(band.end, railStart, today) - railPosition(band.start, railStart, today)) * 100}%"
          data-span-era={band.id}
          data-no-press
          aria-label={m.lookback_era_aria({ name: band.name })}
          onclick={() => pickStretch(band)}
        ></button>
      {/each}
    </div>

    <!-- The rest of the history, low: one lane per kind, each band its own
         control. Drawn and tapped by the same element, unlike the eras -
         nothing clips these, so the drawing can carry the target. -->
    {#each history as band (band.id)}
      <button
        type="button"
        class="span-tl-hband"
        class:is-open-start={band.openStart}
        class:is-open-end={band.openEnd}
        style:left="{railPosition(band.start, railStart, today) * 100}%"
        style:width="{(railPosition(band.end, railStart, today) - railPosition(band.start, railStart, today)) * 100}%"
        data-span-band={band.kind}
        data-no-press
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
        data-span-milestone={mark.id}
        data-no-press
        aria-label={m.lookback_mark_aria({ name: mark.name })}
        onclick={() => pickMark(mark.epochDay)}
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
        data-span-surgery={mark.id}
        data-no-press
        aria-label={m.lookback_mark_aria({ name: mark.name ?? m.lookback_legend_surgery() })}
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

    <!-- The one-time hint, between the handles it is about, gone on the
         first move of either. Not a control and not announced: the handles
         already carry their own names, and a slider that read out "drag the
         ends" every time it took focus would be worse than silent. -->
    {#if showHint}
      <span
        class="span-tl-hint"
        bind:clientWidth={hintWidth}
        data-span-hint
        aria-hidden="true"
        transition:hintFade>{m.lookback_drag_hint()}</span
      >
    {/if}
  </div>

  <!-- What the rail is showing, against the handles rather than two
       elements away under the title (DIRECTION.md rule 7's own "say it
       once, where it is true"). -->
  <p class="span-tl-state" data-span-state-line>
    {spanDates}<span class="span-tl-days">{`, ${m.n_days({ n: shownDays })}`}</span>
  </p>

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
    /* One lane per history kind this journal has, stacked off the axis.
       Zero lanes leaves every measurement below exactly where it was
       before the history layer existed.

       The gutter is the marks' own room: a milestone or a surgery day is a
       12px block standing on the axis, so the rows start above where those
       blocks reach and no row is ever drawn under one. The rule keeps the
       eras' strip off the rows, so the two registers read as two.

       Two heights rather than one repeated: four bands of the same weight
       was what made the first build unreadable, and a solid bar and an
       outlined one do not need the same room to be told apart. Each row's
       presence is a 0 or a 1 from the component, since CSS cannot make a
       height conditional on what a journal holds - and with both at 0 every
       measurement below lands exactly where it did before the rows
       existed. */
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
  .span-tl-full {
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
    clip-path: inset(calc(100% - var(--rest-h)) var(--tl-clip-right) 0 var(--tl-start));
    transition: clip-path var(--dur-med) var(--ease-out);
  }
  .is-active .span-tl-full {
    clip-path: inset(0 var(--tl-clip-right) 0 var(--tl-start));
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
     - a wipe rather than a fade, which is rule 10's own answer. */
  .span-tl-era-name {
    position: absolute;
    top: 6px;
    font-size: 0.8125rem;
    font-weight: var(--weight-bold);
    letter-spacing: 0.02em;
    line-height: 1.2;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    clip-path: inset(100% 0 0 0);
    transition: clip-path var(--dur-med) var(--ease-out);
  }
  .is-active .span-tl-era-name {
    clip-path: inset(0);
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
  .span-tl-era-target:focus-visible {
    outline: 2px solid var(--focus-ring);
    outline-offset: -2px;
  }

  /* A history band: a lane's worth of stripe, drawn and tapped by the same
     element. The 1px edge every block on this rail wears is what keeps two
     episodes that meet on consecutive days from reading as one. It is the
     page rather than `--outline` here, because the band is ink: an outline
     on ink is a darker line on a dark bar, and a gap of page is a gap.

     The target grows 3px every way, the way a milestone's grows around its
     mark: the rail's height is fixed, so the hit box is what gives rather
     than the drawing. A band still carries a name and a tab stop, which is
     the path that does not depend on aim. */
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
  .span-tl-hband::before {
    content: '';
    position: absolute;
    inset: -3px;
  }
  .span-tl-hband:focus-visible {
    outline: 2px solid var(--focus-ring);
    outline-offset: 1px;
    z-index: 2;
  }

  /* A milestone: a 12px block of ink on the axis, edged in the page so it
     reads on any band. Ink rather than a stripe, because it sits on the
     eras' colours and a stripe would vanish into the band of its own hue;
     the marks and today's line are the rail's time marks, and the colours
     are the person's eras (DIRECTION.md rule 4: ink for the smallest
     things). */
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

  /* The target is wider than the mark. */
  .span-tl-mark::before {
    content: '';
    position: absolute;
    inset: -18px -12px;
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

  /* The handles: the grip of ink is the element, centred on its day and
     placed by transform alone so a move is a transform and nothing else;
     the 48px target is a pseudo-element reaching away from the span - left
     of the start's grip, right of the end's - so at a short span the two
     targets meet at the grips rather than lying on top of each other, and
     a finger on either grip gets the handle it can see. */
  .span-tl-handle {
    position: absolute;
    top: -6px;
    bottom: -6px;
    left: calc(var(--grip) / -2);
    width: var(--grip);
    padding: 0;
    margin: 0;
    border: 0;
    background: transparent;
    cursor: ew-resize;
    z-index: 3;
    touch-action: none;
    transition: transform var(--dur-med) var(--ease-out);
  }
  .span-tl-handle::before {
    content: '';
    position: absolute;
    top: 0;
    bottom: 0;
  }
  .span-tl-handle.is-start { transform: translateX(var(--tl-start)); }
  .span-tl-handle.is-start::before { left: calc(var(--grip) - var(--handle)); right: -6px; }
  .span-tl-handle.is-end { transform: translateX(var(--tl-end)); }
  .span-tl-handle.is-end::before { left: -6px; right: calc(var(--grip) - var(--handle)); }

  .span-tl-grip {
    position: absolute;
    inset: 0;
    background: var(--text);
    border-radius: var(--r-block);
    clip-path: inset(calc(100% - var(--rest-grip)) 0 0 0 round var(--r-block));
    transition:
      clip-path var(--dur-med) var(--ease-out),
      transform var(--dur-fast) var(--ease-out);
  }
  .is-active .span-tl-grip {
    clip-path: inset(0 round var(--r-block));
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

  .span-tl-handle:focus-visible {
    outline: none;
  }
  .span-tl-handle:focus-visible .span-tl-grip {
    outline: 2px solid var(--focus-ring);
    outline-offset: 2px;
  }

  /* The one-time hint, sitting between the two grips it is about, on the
     page's second surface inside the outline every kit element separates
     with (the kit refuses shadows). At the top of the rail rather than
     across it: that band is the part of the lifted layer the rest state
     leaves empty, so the hint covers nothing a resting rail is drawing, and
     it is gone by the time a drag raises the layer into it. */
  .span-tl-hint {
    position: absolute;
    top: -1px;
    left: var(--tl-hint-x);
    transform: translateX(-50%);
    max-width: 100%;
    padding: 2px 8px;
    background: var(--surface-2);
    border: 1px solid var(--outline);
    border-radius: var(--r-block);
    color: var(--text-2);
    font-size: var(--text-xs);
    font-weight: var(--weight-medium);
    line-height: 1.2;
    white-space: nowrap;
    pointer-events: none;
    z-index: 4;
  }

  /* The span, written once, directly under the rail. */
  .span-tl-state {
    margin: var(--space-2) 0 0;
    font-size: var(--text-sm);
    color: var(--text-2);
  }
  .span-tl-days {
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
     Under disguise roles.ts hands out no gradient at all (ADR-0035), the
     variable is unset, and the key falls back to the outline over nothing,
     which is what "no colour" looks like on that theme. */
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
  /* A mark, drawn as one: the milestone block's own size and radius. */
  .span-tl-chip[data-span-chip='surgery'] {
    width: 8px;
    height: 8px;
    background: var(--text);
    border-color: var(--bg);
    border-radius: 2px;
  }
</style>
