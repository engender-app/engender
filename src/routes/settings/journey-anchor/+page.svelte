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

  let sorted = $derived(vocabulary.milestones);

  function pick(id: string | null) {
    prefs.journeyAnchorMilestoneId = id;
  }
</script>

<div class="screen">
  <ScreenHeader title={m.journey_anchor_title()} back="/settings" subtitle={m.journey_anchor_intro()} />

  <div class="list-group">
    <button
      class="list-row"
      data-selected={prefs.journeyAnchorMilestoneId === null ? 'true' : 'false'}
      data-pick-anchor="none"
      onclick={() => pick(null)}
    >
      <span class="row-text">
        <span class="row-title">{m.journey_anchor_none_title()}</span>
        <span class="row-subtitle">{m.journey_anchor_none_sub()}</span>
      </span>
      {#if prefs.journeyAnchorMilestoneId === null}<Icon name="check" size={20} />{/if}
    </button>
  </div>

  <SectionTitle text={m.ms_yours()} />
  <div class="list-group">
    {#each sorted as mi (mi.id)}
      <button
        class="list-row"
        data-selected={prefs.journeyAnchorMilestoneId === mi.id ? 'true' : 'false'}
        data-pick-anchor={mi.id}
        onclick={() => pick(mi.id)}
      >
        <span class="row-text">
          <span class="row-title">{mi.name}</span>
          <span class="row-subtitle">{fmtDay(mi.epochDay, { day: 'numeric', month: 'short', year: 'numeric' })}</span>
        </span>
        {#if prefs.journeyAnchorMilestoneId === mi.id}<Icon name="check" size={20} />{/if}
      </button>
    {:else}
      <p class="muted small" style="padding:var(--space-4)">{m.ms_none()}</p>
    {/each}
  </div>
</div>
