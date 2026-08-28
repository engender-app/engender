<script lang="ts">
  /* Journey anchor (phase 5 ticket 25, ADR-0010): which milestone durations,
     stats ranges and wrapped figures are measured from. A single global
     choice, mirroring `activeScales` (settings/+page.svelte's scales sheet) -
     one active pick rather than a per-surface one. Nothing computed here is
     stored; picking a milestone only ever writes its id.

     Grounded in Chuanromanee & Metoyer (CHI 2023): participants could not
     name a single start to their own transition, so "None" sits at the top
     of the list as a legitimate resting state rather than a gap under the
     real options - the intro copy says so, and nothing on this screen or
     anywhere else treats an unset anchor as unfinished setup. */
  import { m } from '$lib/paraglide/messages';
  import { fmtDay } from '$lib/data/dates';
  import { prefs } from '$lib/data/prefs/store.svelte';
  import { vocabulary } from '$lib/data/vocabulary/vocabulary';
  import Icon from '$lib/components/Icon.svelte';
  import ScreenHeader from '$lib/components/ScreenHeader.svelte';
  import SectionTitle from '$lib/components/SectionTitle.svelte';
  import ListCard from '$lib/components/kit/ListCard.svelte';

  let sorted = $derived(vocabulary.milestones);

  function pick(id: string | null) {
    prefs.journeyAnchorMilestoneId = id;
  }
</script>

<div class="screen">
  <ScreenHeader title={m.journey_anchor_title()} back="/settings" subtitle={m.journey_anchor_intro()} />

  <!-- Both lists below stay hand-written rather than going through ListRow
       (ticket 18): this is a mutually-exclusive pick, and ListRow's
       `checked` draws Check.svelte's box, which that component documents
       as deliberately never a radio's circle - the wrong shape for "one of
       these", not the tickable "any of these" a checkbox says. -->
  <ListCard>
    <button
      type="button"
      class="kit-row"
      data-selected={prefs.journeyAnchorMilestoneId === null ? 'true' : 'false'}
      data-pick-anchor="none"
      onclick={() => pick(null)}
    >
      <span class="kit-row-text">
        <span class="kit-row-title">{m.journey_anchor_none_title()}</span>
        <span class="kit-row-sub">{m.journey_anchor_none_sub()}</span>
      </span>
      {#if prefs.journeyAnchorMilestoneId === null}<Icon name="check" size={20} />{/if}
    </button>
  </ListCard>

  <SectionTitle text={m.ms_yours()} />
  <ListCard>
    {#each sorted as mi (mi.id)}
      <button
        type="button"
        class="kit-row"
        data-selected={prefs.journeyAnchorMilestoneId === mi.id ? 'true' : 'false'}
        data-pick-anchor={mi.id}
        onclick={() => pick(mi.id)}
      >
        <span class="kit-row-text">
          <span class="kit-row-title">{mi.name}</span>
          <span class="kit-row-sub">{fmtDay(mi.epochDay, { day: 'numeric', month: 'short', year: 'numeric' })}</span>
        </span>
        {#if prefs.journeyAnchorMilestoneId === mi.id}<Icon name="check" size={20} />{/if}
      </button>
    {:else}
      <p class="muted small" style="padding:var(--space-4)">{m.ms_none()}</p>
    {/each}
  </ListCard>
</div>
