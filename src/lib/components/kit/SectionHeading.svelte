<script lang="ts">
  /* A screen reads as a few named areas rather than as one column of cards
     (DIRECTION.md 3c), and this is what names them: the display face at the
     screen-title size, with no icon. The rows underneath carry the icons.

     The text arrives as a string rather than as copy written here, so the
     screen tickets pass a message key's value and the kit ships no wording
     of its own. */
  import type { Snippet } from 'svelte';
  import { crossfadeDuration, fadeOnly } from '$lib/motion/tokens';

  let {
    text,
    id,
    focusable = false,
    action,
    sub
  }: {
    text: string;
    /** A second line under the heading saying which part of the area comes
        first - the Journal's month over its first day (ux-carpet ticket 282).
        An empty string holds the line's room with nothing on it yet, for a
        sub-line that waits on a read: the text then fades in on a line
        that is already there, and nothing under the heading moves.
        Omitted, there is no second line. */
    sub?: string;
    /** An anchor for the area this names, when something links into the
        middle of a screen (phase 11 ticket 15: Safe space's way down lands
        on the letters screen's Open section). Omitted everywhere else - a
        heading needs no id to name an area, only to be addressed by one. */
    id?: string;
    /** Lets a same-page link move keyboard focus onto the named area. */
    focusable?: boolean;
    /** A control for the area as a whole, right-aligned on the heading's own
        line: a link out of it, an add button, or a state the whole area
        carries (the roadmap's "not my path" per track). Not a row's control
        - anything that acts on one thing in the area belongs beside that
        thing. Whatever goes here renders inside `[data-section-heading]`, so
        a test reading a heading's name must read its `h2` rather than the
        element's text. */
    action?: Snippet;
  } = $props();

  /* The old and the new line share one grid cell (the style below), so a change of
     month crossfades in place rather than one pushing the other. */
  const subFade = (_node: Element) => fadeOnly(crossfadeDuration());
</script>

<div class="kit-heading" data-section-heading id={focusable ? undefined : id}>
  {#if focusable}
    <h2 {id} tabindex="-1">{text}</h2>
  {:else}
    <h2>{text}</h2>
  {/if}
  {#if action}{@render action()}{/if}
  {#if sub !== undefined}
    <p class="kit-heading-sub">
      {#key sub}
        <span transition:subFade>{sub}</span>
      {/key}
    </p>
  {/if}
</div>

<style>
  /* The heading's second line: secondary text under the words, on a line
     of its own whatever the action beside them does. One grid cell, so an
     outgoing and an incoming line crossfade in place, and a line-height's
     floor, so an empty one still holds its room. */
  .kit-heading-sub {
    flex-basis: 100%;
    display: grid;
    min-height: 1.3em;
    margin: calc(-1 * var(--space-2)) 0 0;
    color: var(--text-2);
    font-size: var(--text-sm);
    font-weight: var(--weight-medium);
    line-height: 1.3;
  }
  .kit-heading-sub > * { grid-area: 1 / 1; }
</style>
