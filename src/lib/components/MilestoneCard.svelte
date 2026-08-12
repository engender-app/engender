<script lang="ts">
  import { m } from '$lib/paraglide/messages';
  import Icon from './Icon.svelte';
  import PhotoThumb from './PhotoThumb.svelte';
  import { fmtDay } from '$lib/data/dates';
  import type { Milestone } from '$lib/data/types';
  import type { MilestoneStatus } from '$lib/data/milestoneStatus';

  let { milestone, s, href = '/timeline' }: { milestone: Milestone; s: MilestoneStatus; href?: string } = $props();

  let status = $derived.by(() => {
    if (s.type === 'countdown') return m.ms_status_in_days({ days: m.n_days({ n: s.days ?? 0 }) });
    if (s.type === 'today') return m.ms_status_today();
    const base = m.ms_status_years_ago({ years: m.n_years({ n: s.years ?? 0 }) });
    if (s.isAnnivToday) return base;
    return `${base} · ${m.ms_status_next_in({ days: m.n_days({ n: s.inDays ?? 0 }) })}`;
  });
  let badge = $derived(s.type === 'today' ? m.ms_status_today() : s.isAnnivToday ? m.ms_status_anniversary() : null);
</script>

<a class="milestone-card" {href}>
  {#if milestone.photo}
    <PhotoThumb photo={milestone.photo} size={44} />
  {:else}
    <span class="milestone-icon"><Icon name="flag" size={20} /></span>
  {/if}
  <span class="milestone-text">
    <span class="milestone-name">{milestone.name}</span>
    <span class="milestone-status">{fmtDay(milestone.epochDay, { day: 'numeric', month: 'short', year: 'numeric' })} · {status}</span>
    {#if badge}<span class="milestone-today"><Icon name="sparkle" size={14} /> {badge}</span>{/if}
  </span>
</a>
