<script lang="ts">
  /* The date picker's body (phase 12 pickers, ticket 01), the same in the
     phone's sheet and the desktop's popover (PickerHost.svelte).

     **One surface, three months on it.** The grid is a track of three
     months side by side - the one shown and its neighbours - and the track
     is what moves: under a finger it follows the finger, and on release it
     settles a whole month over or springs back (datePicker.ts's
     settleStep). When it lands, the neighbour it came to rest on becomes
     the shown month and the track goes back to zero in the same flush, so
     the month that is on screen never leaves it and nothing re-renders
     under the eye - which is what a flatpickr grid, rebuilt on every
     month change, could never do. Every month is six weeks tall, so the
     surface does not change height between them either.

     A jump further than one month (Today, the month drum, Shift+PageDown)
     puts the destination into the neighbour's place off screen and travels
     one month's width to it. Past a bound there is no neighbour, and the
     track stretches instead of moving (rubberBand) and springs back.

     **Grabbing a moving track.** A finger, a key or a button that arrives
     while the track is settling does not wait for it or cut it short: the
     settle is stopped where it has got to, and if it was already past half
     way the months are rebased by one (the neighbour becomes the shown
     month, and the track moves back by a width). Both are the same picture,
     so the new movement starts from exactly what was painted.

     The title turns sideways on the drum the year uses (motion/drum.ts),
     at the moment the month is decided rather than when the track lands,
     and tapping it lays MonthJump over the grid - content crossfading on a
     surface that keeps its height, since the grid stays in flow under it. */
  import { flushSync, tick } from 'svelte';
  import { m } from '$lib/paraglide/messages';
  import { fmtDay, fmtMonthYear } from '$lib/data/dates';
  import { dateInputValueFromEpochDay } from '$lib/data/epochDay';
  import { currentDay } from '$lib/stores/today.svelte';
  import { drumIn, drumOut } from '$lib/motion/drum';
  import { crossfadeDuration, EASE_OUT_CSS, fadeOnly, isReducedMotion, motionDuration } from '$lib/motion/tokens';
  import Icon from './Icon.svelte';
  import MonthJump from './MonthJump.svelte';
  import { registerOverlayRegion } from './overlayLock';
  import { dayInMonth, dayStep, keyMonth, keyYear, monthCells, monthKey, monthOfDay, parseIsoDate, rubberBand, settleStep } from './datePicker';

  let {
    value,
    min,
    max,
    onPick,
    onClear
  }: {
    value: string;
    /** Inclusive bounds, `yyyy-mm-dd`. */
    min?: string;
    max?: string;
    onPick: (value: string) => void;
    onClear: () => void;
  } = $props();

  const titleId = $props.id();
  const today = $derived(currentDay());
  /* The months sit this far apart on the track, so a neighbour sliding in
     is a separate page rather than a continuation of the one leaving. */
  const GUTTER = 16;
  /* The gesture's clocks: the velocity window, and the trackpad's quiet
     and deaf spells (both explained where the wheel is read). */
  const VELOCITY_WINDOW = 80;
  const WHEEL_QUIET = 120;
  const WHEEL_DEAF = 160;

  let minDay = $derived(min ? parseIsoDate(min) : null);
  let maxDay = $derived(max ? parseIsoDate(max) : null);
  let firstKey = $derived(minDay === null ? -Infinity : monthOfDay(minDay));
  let lastKey = $derived(maxDay === null ? Infinity : monthOfDay(maxDay));
  let selected = $derived(value ? parseIsoDate(value) : null);

  const inRange = (day: number) => (minDay === null || day >= minDay) && (maxDay === null || day <= maxDay);
  const clampDay = (day: number) => Math.min(Math.max(day, minDay ?? day), maxDay ?? day);

  /* The day the keyboard is on. The picker is mounted per opening, so this
     starts on the chosen day, or today, each time. */
  // svelte-ignore state_referenced_locally
  let cursor = $state(clampDay(selected ?? today));
  // svelte-ignore state_referenced_locally
  const start = monthOfDay(cursor);
  let panels = $state({ back: start - 1, shown: start, fwd: start + 1 });
  let title = $state<{ key: number; dir: 1 | -1 }>({ key: start, dir: 1 });

  let slots = $derived(
    [
      { key: panels.back, at: -1 },
      { key: panels.shown, at: 0 },
      { key: panels.fwd, at: 1 }
    ].filter((slot) => slot.key >= firstKey && slot.key <= lastKey)
  );

  const canStep = (dir: -1 | 1) => (dir > 0 ? panels.fwd <= lastKey : panels.back >= firstKey);

  /* ---------- the track ---------- */

  let viewport = $state<HTMLElement>();
  let track = $state<HTMLElement>();
  let x = $state(0);
  let anim: { animation: Animation; kind: 'slide' | 'fade' } | null = null;

  const width = () => (viewport?.clientWidth ?? 320) + GUTTER;

  function shift(step: -1 | 0 | 1) {
    if (step === 1) panels = { back: panels.shown, shown: panels.fwd, fwd: panels.fwd + 1 };
    else if (step === -1) panels = { back: panels.back - 1, shown: panels.back, fwd: panels.shown };
  }

  /** Stop whatever the track is doing and hold it where it was painted. */
  function grab() {
    if (!anim || !track) return;
    const { animation, kind } = anim;
    anim = null;
    if (kind === 'fade') {
      animation.finish();
      return;
    }
    const painted = new DOMMatrixReadOnly(getComputedStyle(track).transform).m41;
    const w = width();
    flushSync(() => {
      x = painted;
      if (x <= -w / 2) {
        shift(1);
        x += w;
      } else if (x >= w / 2) {
        shift(-1);
        x -= w;
      }
    });
    animation.cancel();
  }

  /** Carry the track to rest: a month forward, back, or where it started. */
  function settle(step: -1 | 0 | 1) {
    if (!track || !viewport) return;
    const target = step > 0 ? panels.fwd : step < 0 ? panels.back : panels.shown;
    if (target !== title.key) title = { key: target, dir: target > title.key ? 1 : -1 };
    const land = () => {
      x = 0;
      shift(step);
      panels = { back: panels.shown - 1, shown: panels.shown, fwd: panels.shown + 1 };
    };
    if (isReducedMotion()) {
      /* The substitute for a slide is a crossfade, never a cut: the track
         fades out where the finger left it, lands, and fades back in. The
         new animation starts before the old one is cancelled, so no frame
         shows the track at full opacity in between. */
      const half = crossfadeDuration() / 2;
      const out = viewport.animate([{ opacity: 1 }, { opacity: 0 }], { duration: half, fill: 'forwards' });
      anim = { animation: out, kind: 'fade' };
      out.onfinish = () => {
        if (anim?.animation === out) anim = null;
        flushSync(land);
        viewport?.animate([{ opacity: 0 }, { opacity: 1 }], { duration: half });
        out.cancel();
      };
      return;
    }
    const from = x;
    const to = -step * width();
    if (from === to) {
      flushSync(land);
      return;
    }
    const animation = track.animate(
      [{ transform: `translate3d(${from}px, 0, 0)` }, { transform: `translate3d(${to}px, 0, 0)` }],
      { duration: motionDuration('--dur-med'), easing: EASE_OUT_CSS, fill: 'forwards' }
    );
    anim = { animation, kind: 'slide' };
    animation.onfinish = () => {
      if (anim?.animation !== animation) return;
      anim = null;
      /* Land and let go in one task: the held last keyframe and the
         rebased track are the same picture, so cancelling after the flush
         hands over without a frame of either. */
      flushSync(land);
      animation.cancel();
    };
  }

  /** A month forward or back, from a button, a key or the wheel. */
  function go(step: -1 | 1) {
    grab();
    if (canStep(step)) settle(step);
    else settle(0);
  }

  /** Any month, travelling one month's width to it. */
  function jumpTo(key: number) {
    grab();
    if (key === panels.shown) {
      settle(0);
      return;
    }
    const step = key > panels.shown ? 1 : -1;
    if (step > 0) panels.fwd = key;
    else panels.back = key;
    settle(step);
  }

  /** The drag's offset as the track draws it: stretched past a bound, and
      never more than one month either way. */
  function shape(raw: number): number {
    const w = width();
    if ((raw < 0 && !canStep(1)) || (raw > 0 && !canStep(-1))) return rubberBand(raw, w);
    return Math.max(-w, Math.min(w, raw));
  }

  /* Velocity is read off the last 80ms of movement, so a finger that
     stopped before lifting counts as stopped. */
  type Sample = { t: number; x: number };
  function velocity(samples: Sample[]): number {
    const last = samples[samples.length - 1];
    const first = samples.find((s) => last.t - s.t <= VELOCITY_WINDOW) ?? last;
    return last.t === first.t ? 0 : (last.x - first.x) / (last.t - first.t);
  }

  /* ---------- a finger or a pointer ---------- */

  let drag: { id: number; x0: number; y0: number; base: number; axis: 'x' | 'y' | null; samples: Sample[] } | null = null;
  let swallowClick = false;

  function onPointerDown(event: PointerEvent) {
    if (drag || jumping || (event.pointerType === 'mouse' && event.button !== 0)) return;
    swallowClick = false;
    grab();
    drag = { id: event.pointerId, x0: event.clientX, y0: event.clientY, base: x, axis: null, samples: [] };
  }

  function onPointerMove(event: PointerEvent) {
    if (!drag || event.pointerId !== drag.id) return;
    const dx = event.clientX - drag.x0;
    const dy = event.clientY - drag.y0;
    /* The axis is decided at 4px, which is also where a sheet starts its
       own drag (Sheet.svelte): this listener runs first, so a sideways
       gesture is ours before the sheet sees enough of it to move. */
    if (!drag.axis) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 4) return;
      drag.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
      if (drag.axis === 'x') viewport?.setPointerCapture(event.pointerId);
    }
    if (drag.axis !== 'x') return;
    event.stopPropagation();
    x = shape(drag.base + dx);
    drag.samples.push({ t: event.timeStamp, x });
  }

  function onPointerEnd(event: PointerEvent) {
    if (!drag || event.pointerId !== drag.id) return;
    const { axis, samples } = drag;
    drag = null;
    if (axis === 'x') {
      swallowClick = true;
      const step = event.type === 'pointercancel' ? 0 : settleStep(x, velocity(samples), width(), canStep(-1), canStep(1));
      settle(step);
    } else if (x !== 0) {
      settle(0);
    }
  }

  /* Once the gesture is sideways, the browser is told not to start a pan:
     a diagonal that drifts vertical would otherwise cancel the pointer
     half way through. Svelte registers touchmove as passive, so by hand. */
  function holdSideways(node: HTMLElement) {
    const onTouchMove = (event: TouchEvent) => {
      if (drag?.axis === 'x' && event.cancelable) event.preventDefault();
    };
    node.addEventListener('touchmove', onTouchMove, { passive: false });
    return () => node.removeEventListener('touchmove', onTouchMove);
  }

  /* A drag that ends over a day is not a tap on it. */
  function onClickCapture(event: MouseEvent) {
    if (!swallowClick) return;
    swallowClick = false;
    event.preventDefault();
    event.stopPropagation();
  }

  /* ---------- a trackpad ---------- */

  /* A two-finger swipe arrives as a stream of horizontal wheel deltas and
     is tracked like a finger; it lets go when the stream has been quiet
     for 120ms. The momentum a trackpad keeps sending after that would turn
     a second month, so the wheel stays deaf until that stream stops too. */
  let wheel: { base: number; sum: number; samples: Sample[]; timer: ReturnType<typeof setTimeout> } | null = null;
  let wheelDeafUntil = 0;

  function onWheel(event: WheelEvent) {
    const dx = event.deltaMode === 1 ? event.deltaX * 16 : event.deltaX;
    if (jumping || Math.abs(dx) <= Math.abs(event.deltaY)) return;
    event.preventDefault();
    if (event.timeStamp < wheelDeafUntil) {
      wheelDeafUntil = event.timeStamp + WHEEL_DEAF;
      return;
    }
    if (!wheel) {
      grab();
      wheel = { base: x, sum: 0, samples: [], timer: setTimeout(releaseWheel) };
    }
    clearTimeout(wheel.timer);
    wheel.sum -= dx;
    x = shape(wheel.base + wheel.sum);
    wheel.samples.push({ t: event.timeStamp, x });
    wheel.timer = setTimeout(releaseWheel, WHEEL_QUIET);
  }

  function releaseWheel() {
    if (!wheel) return;
    const samples = wheel.samples;
    wheel = null;
    wheelDeafUntil = performance.now() + WHEEL_DEAF;
    settle(samples.length ? settleStep(x, velocity(samples), width(), canStep(-1), canStep(1)) : 0);
  }

  $effect(() => () => {
    if (wheel) clearTimeout(wheel.timer);
  });

  /* ---------- the keyboard ---------- */

  async function moveCursor(day: number) {
    cursor = day;
    const key = monthOfDay(day);
    if (key === panels.shown + 1 && !anim) go(1);
    else if (key === panels.shown - 1 && !anim) go(-1);
    else if (key !== panels.shown) jumpTo(key);
    await tick();
    viewport?.querySelector<HTMLElement>(`[data-day="${day}"]`)?.focus({ preventScroll: true });
  }

  function onGridKeydown(event: KeyboardEvent) {
    const next = dayStep(cursor, event.key, event.shiftKey);
    if (next === null) return;
    event.preventDefault();
    const paging = event.key === 'PageUp' || event.key === 'PageDown';
    if (!inRange(next) && !paging) return;
    const to = clampDay(next);
    if (to !== cursor) void moveCursor(to);
  }

  /* ---------- the month drum ---------- */

  let jumping = $state(false);
  let jumpYear = $state(keyYear(start));
  let titleButton = $state<HTMLElement>();

  async function openJump() {
    grab();
    settle(0);
    jumpYear = keyYear(panels.shown);
    jumping = true;
    await tick();
    jumpEl?.querySelector<HTMLElement>('[data-month-jump][tabindex="0"]')?.focus({ preventScroll: true });
  }

  async function closeJump() {
    jumping = false;
    await tick();
    viewport?.querySelector<HTMLElement>(`[data-day="${cursor}"]`)?.focus({ preventScroll: true });
  }

  /* Escape and Back close the drum before they close the picker: it is a
     region of the surface it sits on, and gets dismissal first. */
  let jumpEl: HTMLElement | undefined;
  function ownJump(node: HTMLElement) {
    jumpEl = node;
    if (!titleButton) return;
    return registerOverlayRegion(titleButton, node, { dismiss: () => void closeJump() });
  }

  function pickMonth(year: number, month: number) {
    const key = monthKey(year, month);
    cursor = clampDay(dayInMonth(cursor, key));
    jumpTo(key);
    void closeJump();
  }

  const fadeIn = (_node: Element) => fadeOnly(crossfadeDuration());

  const fmtDayOfMonth = (day: number) => fmtDay(day, { day: 'numeric' });

  /* ---------- the actions ---------- */

  // svelte-ignore state_referenced_locally
  let typed = $state(value);
  let entry = $state<HTMLInputElement>();

  function applyTyped() {
    const day = parseIsoDate(typed);
    if (!entry) return;
    if (day === null || !inRange(day)) {
      entry.setCustomValidity(m.date_picker_invalid());
      entry.reportValidity();
      return;
    }
    onPick(dateInputValueFromEpochDay(day));
  }

  function goToday() {
    void moveCursor(today);
  }

  const DAY_LABEL: Intl.DateTimeFormatOptions = { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' };
  const WEEKDAYS = Array.from({ length: 7 }, (_, i) => fmtDay(4 + i, { weekday: 'narrow' }));

  /* A month's cells as weeks, each blank marked for the narrow layout:
     leading blanks go, and trailing ones are kept up to 31 so every month
     wraps to the same number of rows there too. */
  function weeks(key: number) {
    const cells = monthCells(key);
    const length = cells.filter((c) => c !== null).length;
    const lead = cells.findIndex((c) => c !== null);
    return Array.from({ length: 6 }, (_, w) =>
      cells.slice(w * 7, w * 7 + 7).map((day, i) => {
        const index = w * 7 + i;
        const blank = day === null ? (index < lead ? 'lead' : index - lead < 31 ? 'pad' : 'tail') : null;
        return { day, blank };
      })
    );
  }
</script>

<div class="date-picker">
  <div class="dp-head">
    <button
      bind:this={titleButton}
      type="button"
      class="dp-title"
      data-no-press
      data-date-picker-title
      aria-expanded={jumping}
      onclick={() => (jumping ? closeJump() : openJump())}
    >
      <span class="dp-title-face" id={titleId} aria-live="polite">
        {#key title.key}
          <span in:drumIn={{ dir: title.dir, axis: 'x' }} out:drumOut={{ dir: title.dir, axis: 'x' }}>
            {fmtMonthYear(keyYear(title.key), keyMonth(title.key))}
          </span>
        {/key}
      </span>
      <span class="dp-caret" class:is-open={jumping} aria-hidden="true"><Icon name="chevronDown" size={20} /></span>
    </button>
    <button
      type="button"
      class="icon-btn press dp-prev"
      aria-label={m.prev_month()}
      data-date-picker-prev
      disabled={jumping || title.key <= firstKey}
      onclick={() => go(-1)}
    >
      <Icon name="chevronLeft" size={22} />
    </button>
    <button
      type="button"
      class="icon-btn press"
      aria-label={m.next_month()}
      data-date-picker-next
      disabled={jumping || title.key >= lastKey}
      onclick={() => go(1)}
    >
      <Icon name="chevronRight" size={22} />
    </button>
  </div>

  <div class="dp-body">
    <div class="dp-days" class:is-away={jumping} inert={jumping}>
      <div class="dp-weekdays" aria-hidden="true">
        {#each WEEKDAYS as name, i (i)}<span>{name}</span>{/each}
      </div>
      <div
        bind:this={viewport}
        class="dp-viewport"
        role="presentation"
        data-date-picker-viewport
        onpointerdown={onPointerDown}
        onpointermove={onPointerMove}
        onpointerup={onPointerEnd}
        onpointercancel={onPointerEnd}
        onclickcapture={onClickCapture}
        onwheel={onWheel}
        {@attach holdSideways}
      >
        <div bind:this={track} class="dp-track" style:--dp-gutter="{GUTTER}px" style:transform={x ? `translate3d(${x}px, 0, 0)` : undefined}>
          {#each slots as slot (slot.key)}
            <div
              class="dp-month"
              style:--dp-at={slot.at}
              role={slot.at === 0 ? 'grid' : undefined}
              aria-labelledby={slot.at === 0 ? titleId : undefined}
              aria-hidden={slot.at === 0 ? undefined : 'true'}
              data-date-picker-month={slot.key}
              onkeydown={onGridKeydown}
            >
              {#each weeks(slot.key) as week, w (w)}
                <div class="dp-week" role="row">
                  {#each week as cell, i (i)}
                    <div
                      class="dp-cell"
                      class:dp-lead={cell.blank === 'lead'}
                      class:dp-pad={cell.blank === 'pad'}
                      class:dp-tail={cell.blank === 'tail'}
                      role="gridcell"
                      aria-selected={cell.day !== null && cell.day === selected}
                    >
                      {#if cell.day !== null}
                        <button
                          type="button"
                          class="dp-day"
                          class:is-selected={cell.day === selected}
                          class:is-today={cell.day === today}
                          data-no-press
                          data-day={cell.day}
                          data-sheet-focus={slot.at === 0 && cell.day === cursor ? '' : undefined}
                          tabindex={cell.day === cursor ? 0 : -1}
                          aria-label={fmtDay(cell.day, DAY_LABEL)}
                          aria-current={cell.day === today ? 'date' : undefined}
                          disabled={!inRange(cell.day)}
                          onclick={() => onPick(dateInputValueFromEpochDay(cell.day!))}
                        >
                          {fmtDayOfMonth(cell.day)}
                        </button>
                      {/if}
                    </div>
                  {/each}
                </div>
              {/each}
            </div>
          {/each}
        </div>
      </div>
    </div>

    {#if jumping}
      <div
        class="dp-jump"
        in:fadeIn
        out:fadeIn
        {@attach ownJump}
      >
        <MonthJump
          year={jumpYear}
          month={keyMonth(panels.shown)}
          from={firstKey}
          to={lastKey}
          journal={false}
          onYear={(delta) => (jumpYear += delta)}
          onPick={pickMonth}
        />
      </div>
    {/if}
  </div>

  <div class="dp-entry">
    <label class="dp-entry-label">
      {m.date_picker_entry()}
      <input
        bind:this={entry}
        bind:value={typed}
        class="input"
        type="text"
        autocomplete="off"
        data-date-picker-entry
        oninput={() => entry?.setCustomValidity('')}
        onkeydown={(event) => {
          if (event.key !== 'Enter') return;
          event.preventDefault();
          applyTyped();
        }}
      />
    </label>
    <button type="button" class="btn btn-primary" data-date-picker-apply onclick={applyTyped}>{m.date_picker_apply()}</button>
  </div>

  <div class="dp-actions">
    <button type="button" class="btn btn-soft" data-date-picker-today disabled={!inRange(today)} onclick={goToday}>{m.today()}</button>
    <button type="button" class="btn btn-ghost" data-date-picker-clear disabled={!value} onclick={onClear}>{m.date_picker_clear()}</button>
  </div>
</div>

<style>
  .date-picker {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: var(--space-4);
    container: date-picker / inline-size;
  }

  .dp-head {
    display: flex;
    align-items: center;
    gap: var(--space-1);
  }

  /* The title is the month drum's door, so it is a control the full width
     the arrows leave it, with the caret saying it opens something. */
  .dp-title {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: var(--space-2);
    min-height: var(--touch-target);
    margin-left: calc(-1 * var(--space-2));
    padding: 0 var(--space-2);
    border: none;
    border-radius: var(--r-block);
    background: none;
    color: var(--text);
    font: inherit;
    font-family: var(--font-display);
    font-weight: var(--weight-display);
    font-size: var(--text-lg);
    text-align: left;
    cursor: pointer;
    transition: background-color var(--dur-fast) var(--ease-out);
  }
  @media (hover: hover) {
    .dp-title:hover { background: var(--surface-2); }
  }
  .dp-title:focus-visible {
    outline: 2px solid var(--focus-ring);
    outline-offset: -2px;
  }

  /* Both faces in one cell, clipped at the line box - MonthJump's numeral,
     turned on its side. */
  .dp-title-face {
    display: grid;
    overflow: clip;
    min-width: 0;
  }
  .dp-title-face > span {
    grid-area: 1 / 1;
    white-space: nowrap;
  }

  .dp-caret {
    display: grid;
    color: var(--text-2);
    transition: rotate var(--dur-med) var(--ease-out);
  }
  .dp-caret.is-open { rotate: 180deg; }

  .dp-body { position: relative; }

  .dp-days { transition: opacity var(--dur-fast) var(--ease-out); }
  .dp-days.is-away { opacity: 0; }

  .dp-weekdays {
    display: grid;
    grid-template-columns: repeat(7, minmax(0, 1fr));
    margin-bottom: var(--space-1);
    color: var(--text-2);
    font-size: var(--text-xs);
    font-weight: var(--weight-medium);
    text-align: center;
    text-transform: uppercase;
  }

  /* clip rather than hidden: a hidden box is a scroll container, and a
     focused day in a neighbour month would scroll it. pan-y leaves the
     vertical to the sheet; the sideways gesture is ours. */
  .dp-viewport {
    overflow: clip;
    touch-action: pan-y;
  }

  .dp-track { display: grid; }

  /* Six rows of one target each, stated rather than left to the content:
     a month whose sixth week is blank would otherwise collapse that row
     and stretch the other five into its room, so two months side by side
     on the track had their weeks at different heights. */
  .dp-month {
    grid-area: 1 / 1;
    display: grid;
    grid-template-columns: repeat(7, minmax(0, 1fr));
    grid-template-rows: repeat(6, var(--touch-target));
    transform: translateX(calc(var(--dp-at) * (100% + var(--dp-gutter))));
  }
  .dp-week { display: contents; }
  .dp-cell { display: grid; }

  /* The target is the whole 48px cell with no gap between cells, so seven
     fit at 336px; the block a day draws sits 2px inside it, which is where
     the gap a person sees comes from. */
  .dp-day {
    position: relative;
    isolation: isolate;
    display: grid;
    place-items: center;
    min-height: var(--touch-target);
    padding: 0;
    border: none;
    background: none;
    color: var(--text);
    font: inherit;
    font-size: var(--text-md);
    font-variant-numeric: tabular-nums;
    cursor: pointer;
  }
  .dp-day::after {
    content: '';
    position: absolute;
    inset: 2px;
    z-index: -1;
    border-radius: var(--r-block);
    transition: background-color var(--dur-fast) var(--ease-out);
  }
  @media (hover: hover) {
    .dp-day:not(:disabled):hover::after { background: var(--surface-2); }
  }

  /* The chosen day is a block of ink, MonthJump's pill and the segmented
     control's, not an accent fill: one shape for "this one" across the
     app's pickers. */
  .dp-day.is-selected {
    color: var(--bg);
    font-weight: var(--weight-bold);
  }
  .dp-day.is-selected::after { background: var(--text); }

  /* Today's ring, 2px of accent on the block's own edge. */
  .dp-day.is-today::before {
    content: '';
    position: absolute;
    inset: 2px;
    border: 2px solid var(--accent);
    border-radius: var(--r-block);
    pointer-events: none;
  }
  .dp-day:focus-visible {
    outline: 2px solid var(--focus-ring);
    outline-offset: -6px;
  }

  /* Outside the bounds: struck through rather than only greyed. */
  .dp-day:disabled {
    color: var(--text-2);
    text-decoration: line-through;
    cursor: default;
  }

  /* The drum lies over the grid, which stays in flow under it, so the
     surface keeps its height across the swap. */
  .dp-jump {
    position: absolute;
    inset: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
    background: var(--surface);
  }

  .dp-entry {
    display: flex;
    flex-wrap: wrap;
    align-items: end;
    gap: var(--space-2);
  }
  .dp-entry-label {
    flex: 1 1 12rem;
    min-width: 0;
    display: grid;
    gap: var(--space-1);
    font-size: var(--text-sm);
    color: var(--text);
  }
  .dp-entry .btn,
  .dp-actions .btn {
    min-height: var(--touch-target);
    white-space: normal;
  }

  .dp-actions {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(8rem, 1fr));
    gap: var(--space-2);
  }

  /* Narrower than seven targets (200% zoom, the 320px floor): the days
     wrap in whatever columns fit, without weekday headings or leading
     blanks, and every month keeps 31 slots so it wraps to the same height. */
  @container date-picker (width < 336px) {
    .dp-weekdays { display: none; }
    /* The title takes its own line and may wrap; the arrows sit under it
       at the far edge. */
    .dp-head { flex-wrap: wrap; }
    .dp-title { flex-basis: 100%; }
    .dp-title-face > span { white-space: normal; }
    .dp-prev { margin-left: auto; }
    .dp-month {
      grid-template-columns: repeat(auto-fill, minmax(var(--touch-target), 1fr));
      grid-template-rows: none;
      grid-auto-rows: var(--touch-target);
    }
    .dp-lead,
    .dp-tail { display: none; }
    .dp-pad { visibility: hidden; }
  }
</style>
