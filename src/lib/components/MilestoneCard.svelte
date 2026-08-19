<script lang="ts">
  import { m } from '$lib/paraglide/messages';
  import { journal } from '$lib/data/live/journal.svelte';
  import { todayEpochDay } from '$lib/data/epochDay';
  import Icon from './Icon.svelte';
  import PhotoThumb from './PhotoThumb.svelte';
  import FeltSenseOfferSheet from './FeltSenseOfferSheet.svelte';
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

  /* Offered, never required, each time this card shows the anniversary
     badge (CONTEXT: "Felt-sense entry") - a separate button rather than
     nesting one inside the card's own link, which invalid HTML and a
     screen reader would both trip over. */
  let offering = $state(false);
  async function saveOffer(input: { mood: number; note: string | null }) {
    await journal.feltSense.add({ milestoneId: milestone.id }, { epochDay: todayEpochDay(), ...input });
    offering = false;
  }
</script>

<div class="milestone-card" data-milestone-card>
  <a class="milestone-card-link" {href}>
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
  {#if s.isAnnivToday}
    <button class="icon-btn" aria-label={m.ms_feeling_anniv_title()} data-anniv-feeling onclick={() => (offering = true)}>
      <Icon name="heart" size={18} />
    </button>
  {/if}
</div>

{#if s.isAnnivToday}
  <FeltSenseOfferSheet
    open={offering}
    title={m.ms_feeling_anniv_title()}
    onSave={saveOffer}
    onSkip={() => (offering = false)}
  />
{/if}
