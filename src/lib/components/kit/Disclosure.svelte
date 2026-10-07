<script lang="ts">
  /* A fold: a full-width row with its chevron at the far edge, and the
     block it opens growing under it (`disclose`). The app's one disclosure
     marker (after-release 28, audit V12/L07-18). Manage tags, Affirmations
     and Body regions used native <details>, which drew the browser's
     triangle beside every other fold's chevron and opened in one frame.

     `.disclosure-toggle` and `.disclosure-chev` are components.css's, the
     same rule SpanFacts and YearDaysList draw their folds with. `strong`
     sets the label in the text colour at body weight for a fold that names
     a group of rows (the managed lists) rather than offering "this, as a
     list" under a chart. */
  import type { Snippet } from 'svelte';
  import { disclose } from '$lib/motion/reveal';
  import Icon from '../Icon.svelte';

  let {
    label,
    open = $bindable(false),
    strong = false,
    id,
    class: className = '',
    children,
    ...rest
  }: {
    label: string;
    open?: boolean;
    strong?: boolean;
    /** Names the opened block for `aria-controls`. */
    id: string;
    class?: string;
    children: Snippet;
    [attribute: string]: unknown;
  } = $props();
</script>

<div class="disclosure {className}" {...rest}>
  <button
    type="button"
    class="disclosure-toggle"
    class:is-strong={strong}
    aria-expanded={open}
    aria-controls={id}
    data-disclosure-toggle
    onclick={() => (open = !open)}
  >
    <span>{label}</span>
    <span class="disclosure-chev"><Icon name="chevronDown" size={18} /></span>
  </button>
  {#if open}
    <div class="disclosed" {id} transition:disclose>
      {@render children()}
    </div>
  {/if}
</div>

<style>
  /* A fold that names a group of rows: the label in the text colour at body
     size, as the group's own title. */
  .disclosure-toggle.is-strong {
    color: var(--text);
    font-size: inherit;
    font-weight: var(--weight-bold);
  }
</style>
