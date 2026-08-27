<script lang="ts">
  /* A choice among a few peers. The pill behind the chosen one is a single
     element that slides between them rather than a background that appears on
     one and disappears from another: the point of a segmented control is that
     the options are a set, and a pill crossing the set says which one you came
     from as well as which one you are on.

     It stretches along the way. Nothing physical changes position without
     deforming a little, and a pill that arrives the same width it left reads
     as a diagram of a slide rather than as a thing sliding. */
  let {
    name,
    options,
    value,
    onChange,
    compact = false,
    key
  }: {
    name: string;
    /** A `href` makes the segment a link and the group a nav: each choice is
        its own screen at its own URL, so switching is navigation and belongs
        in history. Wrapped's four cadences are that, and they had a
        hand-written copy of this control with no pill on it, so the same
        gesture looked like two different controls one tab apart (Alicja,
        2026-08-25). */
    options: { value: string; label: string; href?: string }[];
    value: string;
    onChange?: (v: string) => void;
    /** For a set of short labels - a range in days, a number of steps. The
        buttons keep their 48dp press height and the pill is drawn shorter
        inside it, so what slides reads as a pill crossing the set rather
        than as a dot moving between dots. Six segments reading "7d" to
        "365d" were 52px wide and 42px tall, which is a circle, and a circle
        sliding says nothing about the set it is crossing (Alicja,
        2026-08-25). */
    compact?: boolean;
    /** The group's own identity for the walkthrough's handle (ADR-0029). */
    key?: string;
  } = $props();

  let links = $derived(options.some((o) => o.href !== undefined));
  let buttons = $state<(HTMLElement | undefined)[]>([]);
  let pill = $state({ x: 0, w: 0 });

  /* The track scrolls rather than shrinks when its segments run wider than
     it is (Alicja, 2026-08-26, "the pill came out 48 by 48" - shrinking was
     tried and rejected). But its scrollbar is hidden (`.segmented`'s own
     rule, below) for the same reason a native one is hidden everywhere else
     in the app, and a control that scrolls with no visible scrollbar and no
     other hint looks exactly like one that has simply run out of room -
     "pain"/"severity" cut "severe" off flush against the sheet's edge with
     nothing to suggest there was more (Alicja, 2026-08-27). These two flags
     draw a fade over whichever edge still has content past it, which is the
     hint a hidden scrollbar took away. */
  let track = $state<HTMLElement | undefined>();
  let canScrollStart = $state(false);
  let canScrollEnd = $state(false);

  function updateScrollFade() {
    if (!track) return;
    canScrollStart = track.scrollLeft > 1;
    canScrollEnd = track.scrollLeft < track.scrollWidth - track.clientWidth - 1;
  }

  // Re-measured whenever the option set changes shape, not only on scroll.
  $effect(() => {
    void options;
    updateScrollFade();
  });

  $effect(() => {
    if (!track) return;
    const el = track;
    el.addEventListener('scroll', updateScrollFade, { passive: true });
    window.addEventListener('resize', updateScrollFade);
    return () => {
      el.removeEventListener('scroll', updateScrollFade);
      window.removeEventListener('resize', updateScrollFade);
    };
  });
  /** Set while the pill is crossing, which is what plays the stretch. Not set
      on the first measurement: the control does not slide into its own initial
      state, it starts there. */
  let sliding = $state(false);
  let placed = false;

  $effect(() => {
    const target = buttons[options.findIndex((o) => o.value === value)];
    if (!target) return;
    const next = { x: target.offsetLeft, w: target.offsetWidth };
    if (next.x === pill.x && next.w === pill.w) return;
    if (placed) sliding = true;
    placed = true;
    pill = next;
  });
</script>

{#snippet pillMark()}
  <span
    class="segment-pill"
    class:is-sliding={sliding}
    aria-hidden="true"
    onanimationend={() => (sliding = false)}
  ></span>
{/snippet}

<!-- A nav of links or a radiogroup of buttons, written out rather than
     resolved through <svelte:element>: the two carry different keyboard
     behaviour and different announcements, and the tag has to be legible to
     the compiler for it to check either. The pill and its measuring are the
     same either way, which is the whole point of the two living here. -->
{#if links}
  <nav
    bind:this={track}
    class="segmented"
    class:is-compact={compact}
    class:can-scroll-start={canScrollStart}
    class:can-scroll-end={canScrollEnd}
    data-segmented={key}
    aria-label={name}
    style:--seg-x="{pill.x}px"
    style:--seg-w="{pill.w}px"
  >
    {@render pillMark()}
    {#each options as o, i (o.value)}
      <!-- Replaces rather than pushes. A switcher shows a different view of
           the screen you are already on, so each flick of it is not a place
           to come back to: pushed, the back arrow spent one tap per switch
           undoing them instead of leaving the screen (Alicja, 2026-08-26).
           `screen-transition.ts` already says the same thing about these in
           its own table, where crossing them is tier 3 rather than a
           navigation. data-no-press (ticket 15): the pill crossing the set
           is already this control's press response. -->
      <a
        bind:this={buttons[i]}
        class="segment"
        class:is-active={o.value === value}
        aria-current={o.value === value ? 'page' : undefined}
        data-segment={o.value}
        data-sveltekit-replacestate
        data-no-press
        href={o.href}>{o.label}</a
      >
    {/each}
  </nav>
{:else}
  <div
    bind:this={track}
    class="segmented"
    class:is-compact={compact}
    class:can-scroll-start={canScrollStart}
    class:can-scroll-end={canScrollEnd}
    data-segmented={key}
    role="radiogroup"
    aria-label={name}
    style:--seg-x="{pill.x}px"
    style:--seg-w="{pill.w}px"
  >
    {@render pillMark()}
    {#each options as o, i (o.value)}
      <!-- data-no-press (ticket 15): the pill crossing the set is already
           this control's press response; scaling the label too would answer
           the same touch twice. -->
      <button
        bind:this={buttons[i]}
        class="segment"
        class:is-active={o.value === value}
        role="radio"
        aria-checked={o.value === value}
        data-segment={o.value}
        data-no-press
        onclick={() => onChange?.(o.value)}>{o.label}</button
      >
    {/each}
  </div>
{/if}
