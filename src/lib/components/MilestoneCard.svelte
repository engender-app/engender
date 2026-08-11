<script lang="ts">
  import Icon from './Icon.svelte';
  import PhotoThumb from './PhotoThumb.svelte';
  import { fmtDay } from '$lib/data/dates';
  import type { Milestone } from '$lib/data/types';
  import type { MilestoneStatus } from '$lib/data/milestoneStatus';

  let { m, s, href = '/timeline' }: { m: Milestone; s: MilestoneStatus; href?: string } = $props();

  let status = $derived.by(() => {
    if (s.type === 'countdown') return `in ${s.days} day${s.days === 1 ? '' : 's'}`;
    if (s.type === 'today') return 'today';
    let base = `${s.years} year${s.years === 1 ? '' : 's'} ago`;
    if (!s.isAnnivToday) base += ` · next in ${s.inDays} d`;
    return base;
  });
  let badge = $derived(s.type === 'today' ? 'today' : s.isAnnivToday ? 'anniversary' : null);
</script>

<a class="milestone-card" {href}>
  {#if m.photo}
    <PhotoThumb photo={m.photo} size={44} />
  {:else}
    <span class="milestone-icon"><Icon name="flag" size={20} /></span>
  {/if}
  <span class="milestone-text">
    <span class="milestone-name">{m.name}</span>
    <span class="milestone-status">{fmtDay(m.epochDay, { day: 'numeric', month: 'short', year: 'numeric' })} · {status}</span>
    {#if badge}<span class="milestone-today"><Icon name="sparkle" size={14} /> {badge}</span>{/if}
  </span>
</a>
