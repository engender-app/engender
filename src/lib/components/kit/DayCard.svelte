<script lang="ts">
  /* Entries grouped under a bar of ink (ux-carpet ticket 282, kit.css).
     The role still goes on the section, where the entries' tags and marks
     inherit it; the bar itself carries no colour of its own.

     The bar's words arrive written. Most callers hand it the day, formatted
     against the active locale in $lib/data/dates - a component that took
     an epoch day and formatted it here would be a second place that
     decides how this app writes a date. A day's own screen hands it the
     entry count instead, since its header already names the day
     (DayRecords.svelte, phase 14 ticket 18), so the prop is the bar's
     heading rather than a date. */
  import type { Snippet } from 'svelte';
  import { roleAttrs } from './role';
  import type { Role } from '$lib/theme/roles';

  let {
    heading,
    role,
    key,
    tight = false,
    children
  }: {
    /** The bar's words: the day, or on a day's own screen the count. */
    heading: string;
    role?: Role;
    /** The day this card is for, for the walkthrough's handle (ADR-0029):
        an epoch day rather than the date as written. */
    key?: string;
    /** Half the room between the bar and the first entry, for a list
        whose first entry has to start high on the screen (search's
        results, ticket 16). */
    tight?: boolean;
    children: Snippet;
  } = $props();
</script>

<section class="kit-day" class:is-tight={tight} data-kit-surface data-day-card={key} {...roleAttrs(role)}>
  <h3 class="kit-day-bar">
    {heading}
  </h3>
  <div class="kit-day-body">{@render children()}</div>
</section>
