<script lang="ts">
  /* The Journal's month picker, the body of the sheet the month label opens
     (ticket 281). It was flatpickr inline: a whole day grid to choose a
     month from, weeks starting on Sunday over a grid that starts on Monday,
     and thin arrows under the year's heavy chevrons. The sheet only ever
     jumps to a month, so the control is twelve months and a year.

     The year steps on a drum (motion/drum.ts), turning the way the year
     went. The months are blocks, one per month, and the one the cursor is
     on wears the inverted pill the segmented control uses - one shape for
     the set, travelling on motion/indicator.ts rather than lit on one cell
     and dark on another. The cursor starts on the month the grid behind the
     sheet is showing and only the keyboard moves it: a tap picks at once,
     so a pointer never sees the pill travel, and it does not have to wait
     through a travel before the sheet closes either.

     A dot says a month has entries, in role 0 (DIRECTION.md, "colour that
     carries a value takes role 0"), read as the year's day counts folded
     into months. Each cell keeps its own dot and only its opacity changes,
     so stepping the year crossfades each dot to that year's answer where it
     stands; a month with entries in both years never blinks.

     The date picker's title opens it too (phase 12 pickers, ticket 01),
     with two differences a Journal has no use for: months outside the
     picker's bounds are shut, and there is no journal behind it to count,
     so no dots and no "This month" (the picker's own Today does that). */
  import { tick } from 'svelte';
  import { m } from '$lib/paraglide/messages';
  import { intlLocale } from '$lib/data/dates';
  import { liveList } from '$lib/data/live/journal.svelte';
  import { drumIn, drumOut } from '$lib/motion/drum';
  import { boxesMatch, gridSchedules, insets, LEAD, PLACE, type Box, type Insets, type Schedule } from '$lib/motion/indicator';
  import { activeFlag } from '$lib/theme/activeFlag.svelte';
  import { roleAt } from '$lib/theme/roles';
  import { roleAttrs } from './kit/role';
  import Icon from './Icon.svelte';
  import { monthKey } from './datePicker';
  import { entryMonths, monthStep, yearBounds } from './monthJump';

  let {
    year,
    month,
    onYear,
    onPick,
    from = -Infinity,
    to = Infinity,
    journal = true
  }: {
    year: number;
    month: number;
    /** Step the grid behind the sheet a year, leaving the sheet open. */
    onYear: (delta: 1 | -1) => void;
    /** Move the grid to this month and close the sheet. */
    onPick: (year: number, month: number) => void;
    /** Inclusive bounds as month keys, `year * 12 + month`. */
    from?: number;
    to?: number;
    /** The Journal's own sheet: dots for months with entries, and a way
        back to this month. */
    journal?: boolean;
  } = $props();

  const now = new Date();
  const MONTHS = Array.from({ length: 12 }, (_, i) => i);

  /* Names from the active locale, both lengths: the short one is what fits
     a block at 200% zoom, the long one is what a screen reader says. */
  let names = $derived.by(() => {
    const short = new Intl.DateTimeFormat(intlLocale(), { month: 'short' });
    const long = new Intl.DateTimeFormat(intlLocale(), { month: 'long' });
    return MONTHS.map((i) => {
      const d = new Date(2000, i, 1);
      return { short: short.format(d).replace(/\.$/, ''), long: long.format(d) };
    });
  });

  let bounds = $derived(yearBounds(year));
  // svelte-ignore state_referenced_locally
  const counts = journal ? liveList((j) => j.stats.entryCountsByDay(bounds.first, bounds.last)) : null;
  let withEntries = $derived(entryMonths(counts?.rows.map((r) => r.day) ?? []));
  const shut = (i: number) => monthKey(year, i) < from || monthKey(year, i) > to;

  /* The cursor. Opening on the month the grid shows is the promise the
     label makes (the sheet is mounted per opening, so this runs each
     time); stepping the year leaves it on the same month. */
  // svelte-ignore state_referenced_locally
  let cursor = $state(month);

  /* The drum's direction is the year's last step, held beside the key the
     numeral is swapped on. */
  let turn = $state<1 | -1>(1);
  function stepYear(delta: 1 | -1) {
    turn = delta;
    onYear(delta);
  }

  let grid = $state<HTMLElement | undefined>();
  let cells: HTMLButtonElement[] = $state([]);

  function columns(): number {
    const top = cells[0]?.offsetTop;
    return Math.max(1, cells.filter((c) => c.offsetTop === top).length);
  }

  async function onKeydown(event: KeyboardEvent) {
    const next = monthStep(event.key, cursor, columns());
    if (next === null) return;
    event.preventDefault();
    if (shut(next)) return;
    cursor = next;
    await tick();
    cells[next]?.focus();
  }

  /* The pill: the same measuring Segmented does, on both axes. Placed, not
     slid, the first time and on any relayout that did not move the
     cursor, so a rotation or a zoom moves it as one piece. */
  type Pill = { box: Box; at: Insets; shown: boolean; cursor: number; s: Record<keyof Insets, Schedule> };
  const still = { left: PLACE, right: PLACE, top: PLACE, bottom: PLACE };
  let pill = $state<Pill>({
    box: { x: 0, y: 0, w: 0, h: 0 },
    at: { left: 0, right: 0, top: 0, bottom: 0 },
    shown: false,
    cursor: -1,
    s: still
  });

  function measure(cell: HTMLElement, host: HTMLElement) {
    const box = { x: cell.offsetLeft, y: cell.offsetTop, w: cell.offsetWidth, h: cell.offsetHeight };
    return { box, at: insets(box, { w: host.clientWidth, h: host.clientHeight }) };
  }

  function place(to: number) {
    const cell = cells[to];
    if (!cell || !grid) return;
    const { box, at } = measure(cell, grid);
    if (pill.shown && boxesMatch(pill.box, box)) return;
    const s = !pill.shown ? still : pill.cursor === to ? { left: LEAD, right: LEAD, top: LEAD, bottom: LEAD } : gridSchedules(pill.box, box);
    pill = { box, at, shown: true, cursor: to, s };
  }

  /* The first placement waits for a painted frame, Segmented's reason: the
     pill's resting opacity has to have been painted for its fade to run
     from it, or it arrives lit in one frame. */
  $effect(() => {
    if (!grid) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const frame = requestAnimationFrame(() => {
      timer = setTimeout(() => place(cursor));
    });
    const observer = new ResizeObserver(() => {
      if (pill.shown) place(pill.cursor);
    });
    observer.observe(grid);
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(timer);
      observer.disconnect();
    };
  });

  $effect(() => {
    const to = cursor;
    if (pill.shown) place(to);
  });

  const isNow = (i: number) => year === now.getFullYear() && i === now.getMonth();
</script>

<div class="month-jump">
  <div class="month-jump-year">
    <button class="icon-btn press" aria-label={m.prev_year()} disabled={monthKey(year, 0) - 1 < from} onclick={() => stepYear(-1)}>
      <Icon name="chevronLeft" size={22} />
    </button>
    <!-- The live region stands still and only the numeral inside it is
         swapped, the month label's own arrangement: the incoming year is
         announced once and the outgoing one says nothing. -->
    <strong class="month-jump-numeral" aria-live="polite">
      {#key year}
        <span in:drumIn={{ dir: turn }} out:drumOut={{ dir: turn }}>{year}</span>
      {/key}
    </strong>
    <button class="icon-btn press" aria-label={m.next_year()} disabled={monthKey(year + 1, 0) > to} onclick={() => stepYear(1)}>
      <Icon name="chevronRight" size={22} />
    </button>
  </div>

  <div
    bind:this={grid}
    class="month-jump-grid"
    role="radiogroup"
    tabindex="-1"
    aria-label={m.cal_jump_month()}
    onkeydown={onKeydown}
    {...roleAttrs(roleAt(activeFlag.roles, 0))}
    style:--mj-left="{pill.at.left}px"
    style:--mj-right="{pill.at.right}px"
    style:--mj-top="{pill.at.top}px"
    style:--mj-bottom="{pill.at.bottom}px"
    style:--mj-left-dur={pill.s.left.dur}
    style:--mj-left-ease={pill.s.left.ease}
    style:--mj-left-delay={pill.s.left.delay}
    style:--mj-right-dur={pill.s.right.dur}
    style:--mj-right-ease={pill.s.right.ease}
    style:--mj-right-delay={pill.s.right.delay}
    style:--mj-top-dur={pill.s.top.dur}
    style:--mj-top-ease={pill.s.top.ease}
    style:--mj-top-delay={pill.s.top.delay}
    style:--mj-bottom-dur={pill.s.bottom.dur}
    style:--mj-bottom-ease={pill.s.bottom.ease}
    style:--mj-bottom-delay={pill.s.bottom.delay}
  >
    <span class="month-jump-pill" class:is-shown={pill.shown} aria-hidden="true"></span>
    {#each MONTHS as i (i)}
      <!-- No press on the block: the pill is this control's answer to a key, and a
           tap closes the sheet, so a scale on the block would be a third
           response to one touch. -->
      <button
        bind:this={cells[i]}
        class="month-jump-cell"
        class:is-active={i === cursor}
        class:is-now={isNow(i)}
        role="radio"
        aria-checked={i === cursor}
        aria-current={isNow(i) ? 'date' : undefined}
        tabindex={i === cursor ? 0 : -1}
        data-month-jump={i}
        data-no-press
        disabled={shut(i)}
        onclick={() => onPick(year, i)}
      >
        <span aria-hidden="true">{names[i].short}</span>
        <span class="visually-hidden">{names[i].long}{withEntries.has(i) ? `, ${m.cal_jump_has_entries()}` : ''}</span>
        <span class="month-jump-dot" class:is-on={withEntries.has(i)} aria-hidden="true"></span>
      </button>
    {/each}
  </div>

  {#if journal}
    <button class="btn btn-soft btn-block" data-month-jump-now onclick={() => onPick(now.getFullYear(), now.getMonth())}>
      {m.cal_jump_this_month()}
    </button>
  {/if}
</div>

<style>
  .month-jump {
    display: grid;
    gap: var(--space-4);
  }

  .month-jump-year {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  /* The drum's block: both faces in one cell, clipped at the line box so a
     face is only ever seen inside it. clip rather than hidden, which would
     make it a scroll container the browser is free to scroll. */
  .month-jump-numeral {
    display: grid;
    overflow: clip;
    font-family: var(--font-display);
    font-weight: var(--weight-display);
    font-size: var(--text-lg);
    font-variant-numeric: tabular-nums;
    line-height: 1.2;
  }
  .month-jump-numeral > span { grid-area: 1 / 1; }

  /* Four across at a phone's width. Each column is at least a quarter less
     its gaps and never under the touch floor, so at 200% zoom the grid
     drops to three or two columns rather than shrinking the blocks. */
  .month-jump-grid {
    position: relative;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(max(var(--touch-target), calc(25% - var(--space-2))), 1fr));
    gap: var(--space-2);
    outline: none;
  }

  /* A block of ink under the chosen month, the segmented control's pill
     (components.css .segment-pill) crossing a grid instead of a row. All
     four insets travel, each on the clock its axis gave it. */
  .month-jump-pill {
    position: absolute;
    left: var(--mj-left);
    right: var(--mj-right);
    top: var(--mj-top);
    bottom: var(--mj-bottom);
    border-radius: var(--r-block);
    background: var(--text);
    opacity: 0;
    pointer-events: none;
    transition:
      left var(--mj-left-dur) var(--mj-left-ease) var(--mj-left-delay),
      right var(--mj-right-dur) var(--mj-right-ease) var(--mj-right-delay),
      top var(--mj-top-dur) var(--mj-top-ease) var(--mj-top-delay),
      bottom var(--mj-bottom-dur) var(--mj-bottom-ease) var(--mj-bottom-delay),
      opacity var(--dur-fast) var(--ease-out);
  }
  .month-jump-pill.is-shown { opacity: 1; }

  /* A key, rule 13's drawing: a block with a 1px outline edge, at the
     PinPad key's 56px rather than the 48px floor, so the label and the dot
     under it both clear the edge. Positioned so it paints over the pill. */
  .month-jump-cell {
    position: relative;
    display: grid;
    place-items: center;
    min-height: 56px;
    padding: 0 var(--space-1);
    border: 1px solid var(--outline);
    border-radius: var(--r-block);
    background: none;
    color: var(--text);
    font: inherit;
    font-size: var(--text-md);
    font-weight: var(--weight-bold);
    cursor: pointer;
    transition: color var(--dur-med) var(--ease-out);
  }
  /* The label whitens on an ease-in while the pill arrives on an ease-out,
     so it is still dark while the ink travels under it and finishes as the
     ink lands - .segment.is-active's reasoning. */
  .month-jump-cell.is-active {
    color: var(--bg);
    transition-timing-function: cubic-bezier(0.7, 0, 0.84, 0);
  }
  .month-jump-cell > span:first-child { grid-area: 1 / 1; }
  /* Outside the picker's bounds: struck through rather than only greyed,
     so the difference does not rest on colour alone. */
  .month-jump-cell:disabled {
    color: var(--text-2);
    text-decoration: line-through;
    cursor: default;
  }

  /* Today's ring, HeatMap's drawing of the same fact: 2px of accent a
     pixel clear of the block. Drawn on its own box rather than as the
     block's outline, because the keyboard ring below is the outline, and
     with both on one property focusing this month took today's ring off
     it. 8px is rule 5's track corner, the one that stays concentric
     around a 6px block. */
  .month-jump-cell.is-now::before {
    content: '';
    position: absolute;
    inset: -4px;
    border: 2px solid var(--accent);
    border-radius: 8px;
    pointer-events: none;
  }
  /* The keyboard ring draws inside the block, so it never sits on top of
     today's ring outside it. */
  .month-jump-cell:focus-visible {
    outline: 2px solid var(--focus-ring);
    outline-offset: -4px;
  }

  /* Under the label rather than beside it, so a short name and a long one
     keep their dot in the same place. The edge in the sheet's own ground
     keeps it apart from the ink when the pill is under it. */
  .month-jump-dot {
    grid-area: 1 / 1;
    align-self: end;
    margin-bottom: 8px;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--role-mark-in);
    border: 1px solid var(--surface);
    opacity: 0;
    transition: opacity var(--dur-med) var(--ease-out);
  }
  .month-jump-dot.is-on { opacity: 1; }
</style>
