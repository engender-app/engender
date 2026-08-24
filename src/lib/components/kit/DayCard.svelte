<script lang="ts">
  /* Entries grouped under a tinted date bar. The tint is the area's own
     flag stripe, which is what makes a run of days read as one part of a
     screen instead of as a stack of identical cards.

     The date arrives formatted. Dates are formatted against the active
     locale in $lib/data/dates, and a component that took an epoch day and
     formatted it here would be a second place that decides how this app
     writes a date. */
  import type { Snippet } from 'svelte';
  import { roleStyle } from './role';
  import type { Role } from '$lib/theme/roles';

  let {
    date,
    aside,
    role,
    key,
    children
  }: {
    date: string;
    /** The right-hand end of the bar: an entry count, a time, a weekday. */
    aside?: string;
    role?: Role;
    /** The day this card is for, for the walkthrough's handle (ADR-0029):
        an epoch day rather than the date as written. */
    key?: string;
    children: Snippet;
  } = $props();
</script>

<section class="kit-day" data-day-card={key} style={roleStyle(role)}>
  <h3 class="kit-day-bar">
    {date}
    {#if aside}<span class="kit-day-aside">{aside}</span>{/if}
  </h3>
  <div class="kit-day-body">{@render children()}</div>
</section>
