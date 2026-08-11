<script lang="ts">
  /* What entry lists, stats, search and recap show while the worker answers
     (ADR-0004). Deliberately not a spinner: the mockup's language is soft
     surfaces that stagger in (DESIGN.md item 10), and a placeholder shaped
     like the thing it is waiting for keeps the page from jumping when the
     real content lands.

     `variant` picks a shape, not a screen, so the same three cover every
     waiting surface in the app. Anything longer than one round trip on OPFS
     is unusual, so these are rarely on screen for long - which is also why
     they carry no text of their own to translate. */
  let {
    variant = 'card',
    count = 3
  }: {
    /** Shapes, not screens: `card` is an entry card, `block` is a card around
        one large area (a chart, a form section), `line` is a row of text in a
        list. */
    variant?: 'card' | 'block' | 'line';
    count?: number;
  } = $props();
</script>

<div class="skeleton-stack" aria-hidden="true">
  {#each Array.from({ length: count }) as _, i (i)}
    <div class="skeleton-{variant} stagger-in" style="--stagger-i:{i}">
      {#if variant === 'card'}
        <span class="skeleton skeleton-dot"></span>
        <span class="skeleton-lines">
          <span class="skeleton skeleton-line is-short"></span>
          <span class="skeleton skeleton-line"></span>
        </span>
      {:else if variant === 'block'}
        <span class="skeleton skeleton-line is-short"></span>
        <span class="skeleton skeleton-fill"></span>
      {:else}
        <span class="skeleton skeleton-line"></span>
      {/if}
    </div>
  {/each}
</div>
