<script lang="ts">
  /* The time picker's body (phase 12 pickers, ticket 02), the same in the
     phone's sheet and the desktop's popover (PickerHost.svelte).

     **Two drums.** The hour and the minute are each a column of rows that
     scrolls under a fixed band, the row in the band being the one chosen.
     The column is the browser's own scroller with mandatory snap, so a
     flick carries on under its own momentum and comes to rest on a row,
     and nothing of ours runs per frame while it does: the band and the
     fade at the column's ends are drawn still, over and under a scroll the
     compositor owns. A drum the picker turns itself - a key, a tap on a
     row, a typed time - travels there on the browser's smooth scroll, and
     under reduced motion fades out, moves, and fades back instead.

     The band is a block of the second surface rather than the ink the
     date picker's chosen day wears. Ink would need the digit crossing it
     to turn pale exactly where it crosses, and every way of drawing that
     either repaints out of step with the scroll (a copy of the column
     moved from a scroll handler) or does not repaint at all in Chromium
     (text clipped to a background on a scrolled box). A band the digits
     pass over unchanged has nothing to fall behind.

     **One value.** The typed entry under the drums says what the drums
     do: a drum coming to rest writes its time there, and a time typed
     there turns the drums to it. Use time takes whichever was touched
     last - the drums' own value, so an arrow and Enter in quick
     succession commit the stepped time even though the drum is still on
     its way and the entry not yet written; or the entry, so a half-typed
     time is refused rather than half applied. */
  import { untrack } from 'svelte';
  import { m } from '$lib/paraglide/messages';
  import { crossfadeDuration, isReducedMotion } from '$lib/motion/tokens';
  import { drumIndex, drumStep, formatTime, parseTime } from './timePicker';

  let {
    value,
    required = false,
    onPick,
    onClear
  }: {
    value: string;
    /** No Clear: the caller always stores a time. */
    required?: boolean;
    onPick: (value: string) => void;
    onClear: () => void;
  } = $props();

  /* An empty field opens on the hour it is now, the nearest guess at a
     time someone is about to record. */
  const now = new Date();
  // svelte-ignore state_referenced_locally
  const start = parseTime(value) ?? { hour: now.getHours(), minute: now.getMinutes() };
  let hour = $state(start.hour);
  let minute = $state(start.minute);
  // svelte-ignore state_referenced_locally
  let typed = $state(value);
  let entry = $state<HTMLInputElement>();
  let lastTouched: 'drums' | 'entry' = 'drums';

  type Drum = { key: 'hour' | 'minute'; count: number; label: string };
  const HOURS: Drum = { key: 'hour', count: 24, label: m.time_picker_hour() };
  const MINUTES: Drum = { key: 'minute', count: 60, label: m.time_picker_minute() };
  const DRUMS = [HOURS, MINUTES];
  const pad = (n: number) => String(n).padStart(2, '0');
  const read = (key: Drum['key']) => (key === 'hour' ? hour : minute);
  const write = (key: Drum['key'], n: number) => (key === 'hour' ? (hour = n) : (minute = n));

  const nodes: Partial<Record<Drum['key'], HTMLElement>> = {};
  const rowHeight = (node: HTMLElement) => (node.firstElementChild as HTMLElement | null)?.offsetHeight || 48;
  /** Where the drum is going, while the picker is turning it. A scroll on
      the way there is the travel, not a choice. */
  const travellingTo: Partial<Record<Drum['key'], number>> = {};
  /** A reduced-motion fade under way, and the scroll it lands on: a second
      turn during it moves the landing rather than starting another fade. */
  const fading: Partial<Record<Drum['key'], { top: number }>> = {};
  const settleTimers: Partial<Record<Drum['key'], ReturnType<typeof setTimeout>>> = {};

  /* The quiet spell after the last scroll event that means a drum is at
     rest, for engines without `scrollend`; snapping has finished by then. */
  const SETTLE_QUIET = 140;

  function onScroll(drum: Drum) {
    const node = nodes[drum.key];
    if (!node) return;
    const at = drumIndex(node.scrollTop, rowHeight(node), drum.count);
    if (travellingTo[drum.key] === undefined) {
      write(drum.key, at);
      lastTouched = 'drums';
    }
    clearTimeout(settleTimers[drum.key]);
    settleTimers[drum.key] = setTimeout(() => settle(drum), SETTLE_QUIET);
  }

  /** A drum at rest: whatever it rests on is the time, and the entry says
      so - including a travel a finger caught and carried somewhere else. */
  function settle(drum: Drum) {
    const node = nodes[drum.key];
    clearTimeout(settleTimers[drum.key]);
    if (!node) return;
    const at = drumIndex(node.scrollTop, rowHeight(node), drum.count);
    travellingTo[drum.key] = undefined;
    write(drum.key, at);
    typed = formatTime(hour, minute);
    entry?.setCustomValidity('');
  }

  /** Turn a drum to a row. */
  function turn(drum: Drum, to: number) {
    const node = nodes[drum.key];
    if (!node) return;
    write(drum.key, to);
    lastTouched = 'drums';
    const top = to * rowHeight(node);
    if (Math.abs(node.scrollTop - top) < 1) {
      travellingTo[drum.key] = undefined;
      return;
    }
    travellingTo[drum.key] = to;
    if (!isReducedMotion()) {
      node.scrollTo({ top, behavior: 'smooth' });
      return;
    }
    /* Reduced motion: the column fades out where it is, moves while
       unseen, and fades back in. The fade in starts before the fade out is
       let go, so no frame shows the column at full opacity between them. */
    const fade = fading[drum.key];
    if (fade) {
      fade.top = top;
      return;
    }
    const landing = (fading[drum.key] = { top });
    const half = crossfadeDuration() / 2;
    const out = node.animate([{ opacity: 1 }, { opacity: 0 }], { duration: half, fill: 'forwards' });
    out.onfinish = () => {
      fading[drum.key] = undefined;
      node.scrollTop = landing.top;
      node.animate([{ opacity: 0 }, { opacity: 1 }], { duration: half });
      out.cancel();
    };
  }

  function onDrumKeydown(drum: Drum, event: KeyboardEvent) {
    if (event.key === 'Enter') {
      event.preventDefault();
      apply();
      return;
    }
    const to = drumStep(event.key, read(drum.key), drum.count);
    if (to === null) return;
    event.preventDefault();
    turn(drum, to);
  }

  /** A tap on a row other than the band's brings it to the band. */
  function onDrumClick(drum: Drum, event: MouseEvent) {
    const row = (event.target as HTMLElement).closest<HTMLElement>('[data-time-picker-row]');
    if (row) turn(drum, Number(row.dataset.timePickerRow));
  }

  /** The drum opens on its row with nothing travelling: the scroll is set
      before the first frame is painted. Untracked, or every change of the
      value would re-run the attachment and set the scroll again, cutting
      straight to the row a travel or a finger was on its way to. */
  function holdDrum(drum: Drum) {
    return (node: HTMLElement) => {
      nodes[drum.key] = node;
      node.scrollTop = untrack(() => read(drum.key)) * rowHeight(node);
      const end = () => settle(drum);
      node.addEventListener('scrollend', end);
      return () => {
        node.removeEventListener('scrollend', end);
        clearTimeout(settleTimers[drum.key]);
        delete nodes[drum.key];
      };
    };
  }

  function onTyped() {
    entry?.setCustomValidity('');
    const time = parseTime(typed);
    if (!time) return;
    turn(HOURS, time.hour);
    turn(MINUTES, time.minute);
    lastTouched = 'entry';
  }

  function apply() {
    const time = lastTouched === 'drums' ? { hour, minute } : parseTime(typed);
    if (!time) {
      entry?.setCustomValidity(m.time_picker_invalid());
      entry?.reportValidity();
      return;
    }
    onPick(formatTime(time.hour, time.minute));
  }
</script>

<div class="time-picker">
  <div class="tp-drums">
    <span class="tp-band" aria-hidden="true"></span>
    {#each DRUMS as drum, i (drum.key)}
      {#if i > 0}<span class="tp-colon" aria-hidden="true">:</span>{/if}
      <!-- The column is the spinbutton: arrows step it and it says its
           value, and the rows inside it are the drawing of that value. -->
      <div class="tp-col">
        <div
          class="tp-drum"
          role="spinbutton"
          tabindex="0"
          aria-label={drum.label}
          aria-valuemin={0}
          aria-valuemax={drum.count - 1}
          aria-valuenow={read(drum.key)}
          aria-valuetext={pad(read(drum.key))}
          data-time-picker-drum={drum.key}
          data-sheet-no-drag
          data-sheet-focus={i === 0 ? '' : undefined}
          onscroll={() => onScroll(drum)}
          onkeydown={(event) => onDrumKeydown(drum, event)}
          onclick={(event) => onDrumClick(drum, event)}
          {@attach holdDrum(drum)}
        >
          {#each { length: drum.count }, n}
            <div class="tp-row" aria-hidden="true" data-time-picker-row={n}>{pad(n)}</div>
          {/each}
        </div>
        <span class="tp-ring" aria-hidden="true"></span>
      </div>
    {/each}
  </div>

  <div class="tp-entry">
    <label class="tp-entry-label">
      {m.time_picker_entry()}
      <input
        bind:this={entry}
        bind:value={typed}
        class="input"
        type="text"
        inputmode="decimal"
        autocomplete="off"
        data-time-picker-entry
        oninput={onTyped}
        onkeydown={(event) => {
          if (event.key !== 'Enter') return;
          event.preventDefault();
          apply();
        }}
      />
    </label>
    <button type="button" class="btn btn-primary" data-time-picker-apply onclick={apply}>{m.time_picker_apply()}</button>
  </div>

  {#if !required}
    <button type="button" class="btn btn-ghost tp-clear" data-time-picker-clear disabled={!value} onclick={onClear}>{m.time_picker_clear()}</button>
  {/if}
</div>

<style>
  .time-picker {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: var(--space-4);
  }

  /* Five rows tall, the band on the middle one. The colon sits in the
     band's row, so it reads as part of the time the band holds. */
  .tp-drums {
    --tp-row: var(--touch-target);
    position: relative;
    display: flex;
    justify-content: center;
    align-items: center;
    gap: var(--space-1);
  }
  .tp-band {
    position: absolute;
    inset-inline: 0;
    top: calc(2 * var(--tp-row));
    height: var(--tp-row);
    border-radius: var(--r-block);
    background: var(--surface-2);
    pointer-events: none;
  }
  .tp-colon {
    position: relative;
    font-family: var(--font-display);
    font-weight: var(--weight-display);
    font-size: var(--text-lg);
    line-height: var(--tp-row);
  }

  /* Padding of two rows at each end, so the first and last rows can come
     to rest in the band. The fade is a mask on the column's own box, which
     stays still while the rows scroll under it, so it costs no frame. */
  .tp-drum {
    position: relative;
    box-sizing: border-box;
    width: 5.5rem;
    height: calc(5 * var(--tp-row));
    padding-block: calc(2 * var(--tp-row));
    overflow-y: auto;
    overscroll-behavior: contain;
    scroll-snap-type: y mandatory;
    scrollbar-width: none;
    border-radius: var(--r-block);
    mask-image: linear-gradient(transparent, #000 45%, #000 55%, transparent);
    outline: none;
  }
  .tp-drum::-webkit-scrollbar { display: none; }

  /* The keyboard ring goes round the band's row, where the value is, not
     the whole column, half of which the mask fades out. It is its own box
     beside the scroller, since anything inside it would scroll away. */
  .tp-col { position: relative; }
  .tp-ring {
    position: absolute;
    inset-inline: 0;
    top: calc(2 * var(--tp-row));
    height: var(--tp-row);
    border-radius: var(--r-block);
    pointer-events: none;
  }
  .tp-col:has(.tp-drum:focus-visible) .tp-ring {
    outline: 2px solid var(--focus-ring);
    outline-offset: -2px;
  }

  .tp-row {
    height: var(--tp-row);
    display: grid;
    place-items: center;
    scroll-snap-align: center;
    color: var(--text);
    font-family: var(--font-display);
    font-weight: var(--weight-display);
    font-size: var(--text-lg);
    font-variant-numeric: tabular-nums;
    user-select: none;
    cursor: pointer;
  }

  .tp-entry {
    display: flex;
    flex-wrap: wrap;
    align-items: end;
    gap: var(--space-2);
  }
  .tp-entry-label {
    flex: 1 1 8rem;
    min-width: 0;
    display: grid;
    gap: var(--space-1);
    font-size: var(--text-sm);
    color: var(--text);
  }
  .tp-entry .btn,
  .tp-clear {
    min-height: var(--touch-target);
    white-space: normal;
  }
</style>
