<script lang="ts">
  /* A schedule read a week at a time (phase 10 redesign ticket 44), for the
     two screens that used to draw a row per day: dilation, where
     `expectedSessionDays` puts a session on nearly every day of a taper
     that runs months, and wear.

     This is the journal-connected caller `BareStrip.svelte` names, the
     second one beside `WeekStrip.svelte` - and unlike that one it is not
     reading a metric, so it brings no heat ramp with it. What a day is
     comes back from `markOf` as one of `dayStrip.ts`'s three marks and
     turns into paint in exactly one place (`stripCellOf`), which is how
     both screens are held to drawing an expected-and-empty day and a
     not-expected one the same apart from the outline (ADR-0012: nothing
     here grades a day, so no colour ramp and no count).

     The page is seven days ending on today, stepped a week at a time, and
     the pager stops where the screen runs out of record rather than
     scrolling on into blank weeks. Paging rather than a horizontally
     scrolling rail: a taper runs for months, so a scroll would be long
     enough to lose your place in and has no landmark to find it by, while
     the log under this strip is where an old record is actually reached.
     Apple Health's medication strip and Bevel's day row are the two the
     Mobbin pass settled this against - both compress a schedule into cells
     that say logged or not and nothing more, and neither counts.

     Nothing moves when the page changes: the seven columns stay where they
     are and their fill and hairline transition in place (kit.css), so no
     cell is ever painted at a destination it did not travel to. The week's
     own words are the one thing that swaps, and they crossfade. */
  import { m } from '$lib/paraglide/messages';
  import Icon from '$lib/components/Icon.svelte';
  import BareStrip from '$lib/components/kit/BareStrip.svelte';
  import { fmtDay } from '$lib/data/dates';
  import { crossfade } from '$lib/motion/reveal';
  import type { Role } from '$lib/theme/roles';
  import { canPageBack, stripCellOf, stripSlots, stripWindow, type DayMark } from './dayStrip';

  let {
    today,
    markOf,
    labelOf,
    earliest,
    onPick,
    role,
    weeksBack = $bindable(0)
  }: {
    today: number;
    /** What the screen has to say about one day. */
    markOf: (epochDay: number) => DayMark;
    /** What a screen reader hears for that day, before this component
        says which one is today. The two screens disagree about one of the
        three marks - a day wear logged nothing is a day with nothing on
        it, while the same day on a taper is a day the schedule asked for -
        so the words stay with the screen. */
    labelOf: (epochDay: number, mark: DayMark) => string;
    /** The first day this screen has any record of, or null for a journal
        with nothing in it yet. Where paging back stops. */
    earliest: number | null;
    onPick: (epochDay: number) => void;
    role?: Role;
    /** Which page is showing, bound out so the log under the strip can
        list the same week the strip is drawing. */
    weeksBack?: number;
  } = $props();

  let shown = $derived(stripWindow(today, weeksBack));
  /* Which cell is today is drawn as a ring (kit.css) and said in the
     label, because the ring is the one thing on this strip a screen reader
     cannot reach - and the row under the strip says "Today" out loud, so
     without this the two surfaces disagree about the same day. */
  let days = $derived(
    stripSlots(shown, today, markOf).map((slot) => {
      const state = labelOf(slot.epochDay, slot.mark);
      return {
        key: slot.epochDay,
        name: fmtDay(slot.epochDay, { weekday: 'narrow' }),
        isToday: slot.isToday,
        label: slot.isToday ? m.strip_day_today_state({ state }) : state,
        ...stripCellOf(slot.mark)
      };
    })
  );

  const short = (epochDay: number) => fmtDay(epochDay, { day: 'numeric', month: 'short' });
  let weekLabel = $derived(m.strip_week_range({ from: short(shown.first), to: short(shown.last) }));

  /* Paging onto the last week the screen has anything for disables the
     control that was just pressed, and a browser answers a focused element
     going disabled by dropping focus on <body> - so a keyboard or screen
     reader lands nowhere at exactly the moment it reaches the end of the
     record. The other control is always live on that step, because a page
     back always leaves a page forward. */
  let earlierButton = $state<HTMLButtonElement | null>(null);
  let laterButton = $state<HTMLButtonElement | null>(null);

  function page(by: number) {
    weeksBack += by;
    const leaving = by > 0 ? earlierButton : laterButton;
    const landing = by > 0 ? laterButton : earlierButton;
    if (document.activeElement !== leaving) return;
    queueMicrotask(() => {
      if (leaving?.disabled) landing?.focus();
    });
  }
</script>

<div class="day-strip">
  <div class="day-strip-head">
    <button
      class="icon-btn"
      data-strip-earlier
      bind:this={earlierButton}
      aria-label={m.strip_week_earlier()}
      disabled={!canPageBack(shown, earliest)}
      onclick={() => page(1)}
    >
      <Icon name="chevronLeft" size={20} />
    </button>
    <!-- The words are the only thing that changes place when the page
         does, so they are the only thing that fades. -->
    {#key weekLabel}
      <span class="day-strip-week" data-strip-week out:crossfade>{weekLabel}</span>
    {/key}
    <button
      class="icon-btn"
      data-strip-later
      bind:this={laterButton}
      aria-label={m.strip_week_later()}
      disabled={weeksBack === 0}
      onclick={() => page(-1)}
    >
      <Icon name="chevronRight" size={20} />
    </button>
  </div>
  <BareStrip {days} {role} onPick={(key) => onPick(Number(key))} />
</div>

<style>
  /* Block, not grid. The strip centres itself with `margin-inline: auto`
     against a `max-width` of its own (kit.css), and an auto inline margin
     on a grid item replaces the stretch it would otherwise get - which
     collapsed the seven `1fr` columns to their content and drew a 150px
     strip in a 340px column. In normal flow the strip fills the width and
     its own cap does the centring, which is what that cap was written
     for. */
  .day-strip-head {
    display: grid;
    /* The two controls take the same width, so the week's words sit centred
       over the strip below them rather than wherever the longer of two
       month abbreviations happens to leave them. */
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    margin-bottom: var(--space-3);
  }

  /* One cell for both the label and the copy of it leaving, so a crossfade
     never takes the row's height with it. */
  .day-strip-week {
    grid-area: 1 / 2;
    text-align: center;
    font-size: var(--text-sm);
    font-weight: var(--weight-medium);
    color: var(--text-2);
  }
</style>
