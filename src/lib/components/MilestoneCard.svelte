<script lang="ts">
  /* One upcoming milestone, as a row of Home's list card (phase 5 ticket
     21). It was a card in a horizontal scroller, which is the surface
     DIRECTION.md's decision 2b argues against: four near-identical cards
     side by side, none of them readable without swiping to it.

     Not `ListRow` itself, for the same reason `DayEntry` is not: the row
     carries a photo where the milestone has one, and a photo is not an
     icon disc. It writes the row's own inner classes instead, which is the
     kit's markup rather than a second version of it.

     The anniversary offer is a row of its own under the milestone's, rather
     than a button inside it. A button nested in a link is invalid markup
     and unreachable to a keyboard, and the felt-sense offer is a second
     destination rather than a control on the first - so the list card
     already has a shape for it, complete with the hairline that separates
     them (CONTEXT: "Felt-sense entry" - offered, never required). */
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

  let offering = $state(false);
  async function saveOffer(input: { mood: number; note: string | null }) {
    await journal.feltSense.add({ milestoneId: milestone.id }, { epochDay: todayEpochDay(), ...input });
    offering = false;
  }
</script>

<a class="kit-row" data-milestone-card={milestone.id} {href}>
  {#if milestone.photo}
    <span class="milestone-face"><PhotoThumb photo={milestone.photo} size={36} /></span>
  {:else}
    <span class="kit-row-ico"><Icon name="flag" size={20} /></span>
  {/if}
  <span class="kit-row-text">
    <span class="kit-row-title">{milestone.name}</span>
    <span class="kit-row-sub"
      >{fmtDay(milestone.epochDay, { day: 'numeric', month: 'short', year: 'numeric' })} · {status}</span
    >
  </span>
  <span class="kit-row-trail">
    {#if badge}<span class="kit-pill">{badge}</span>{/if}
    <Icon name="chevronRight" size={20} />
  </span>
</a>

{#if s.isAnnivToday}
  <button type="button" class="kit-row" data-anniv-feeling={milestone.id} onclick={() => (offering = true)}>
    <span class="kit-row-ico"><Icon name="heart" size={20} /></span>
    <span class="kit-row-text">
      <span class="kit-row-title">{m.ms_feeling_anniv_title()}</span>
    </span>
    <span class="kit-row-trail"><Icon name="chevronRight" size={20} /></span>
  </button>

  <FeltSenseOfferSheet
    open={offering}
    title={m.ms_feeling_anniv_title()}
    onSave={saveOffer}
    onSkip={() => (offering = false)}
  />
{/if}
