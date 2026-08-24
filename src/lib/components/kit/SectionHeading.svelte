<script lang="ts">
  /* A screen reads as a few named areas rather than as one column of cards
     (DIRECTION.md 3c), and this is what names them: the display face at the
     screen-title size, with no icon. The rows underneath carry the icons.

     The text arrives as a string rather than as copy written here, so the
     screen tickets pass a message key's value and the kit ships no wording
     of its own. */
  import type { Snippet } from 'svelte';

  let {
    text,
    action
  }: {
    text: string;
    /** A link out of the area, right-aligned on the heading's own line. */
    action?: Snippet;
  } = $props();
</script>

<div class="kit-heading" data-section-heading>
  <h2>{text}</h2>
  {#if action}{@render action()}{/if}
</div>
