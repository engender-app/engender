<script lang="ts">
  /* Entries grouped under a date bar of ink (ux-carpet ticket 282,
     kit.css). The role still goes on the section, where the entries' tags
     and marks inherit it; the bar itself carries no colour of its own.

     The date arrives formatted. Dates are formatted against the active
     locale in $lib/data/dates, and a component that took an epoch day and
     formatted it here would be a second place that decides how this app
     writes a date. */
  import type { Snippet } from 'svelte';
  import { roleAttrs } from './role';
  import type { Role } from '$lib/theme/roles';

  let {
    date,
    aside,
    role,
    key,
    tight = false,
    children
  }: {
    date: string;
    /** The right-hand end of the bar: an entry count, a time, a weekday. */
    aside?: string;
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
    {date}
    {#if aside}<span class="kit-day-aside">{aside}</span>{/if}
  </h3>
  <div class="kit-day-body">{@render children()}</div>
</section>
