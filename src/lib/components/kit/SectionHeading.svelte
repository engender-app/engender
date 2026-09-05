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
    /** A control for the area as a whole, right-aligned on the heading's own
        line: a link out of it, an add button, or a state the whole area
        carries (the roadmap's "not my path" per track). Not a row's control
        - anything that acts on one thing in the area belongs beside that
        thing. Whatever goes here renders inside `[data-section-heading]`, so
        a test reading a heading's name must read its `h2` rather than the
        element's text. */
    action?: Snippet;
  } = $props();
</script>

<div class="kit-heading" data-section-heading>
  <h2>{text}</h2>
  {#if action}{@render action()}{/if}
</div>
