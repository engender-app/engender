<script lang="ts">
  /* The milestone timeline (phase 5 UX ticket 23's rebuild of ticket 18's
     screen). Past and future on one rail, the long empty stretches
     compressed, and a marker for where today falls among them.

     What the rail is built from is $lib/data/timelineItems - the ordering,
     the gap rule and today's place are calendar arithmetic and belong in a
     module with tests rather than in markup. That is also where the defect
     went: the marker used to be inserted only between two milestones, so a
     journal whose milestones were all still ahead drew a timeline of the
     future with no present on it.

     Milestones are mirrored (ADR-0004), so this screen needs no loading
     state: they arrive with boot, bounded at tens of rows and already in
     date order from the journal.

     The rail takes the flag rather than the accent, the same rule every
     other area of the app follows (DIRECTION.md). A future milestone is the
     same mark drawn hollow, which is the one place on this screen where
     colour carries a meaning - and it is a fact about time, not a judgement,
     so ADR-0012 has nothing to say about it. */
  import { m } from '$lib/paraglide/messages';
  import { todayEpochDay, calendarDuration } from '$lib/data/epochDay';
  import { milestoneStatus } from '$lib/data/milestoneStatus';
  import { timelineItems } from '$lib/data/timelineItems';
  import { fmtDay, fmtDuration } from '$lib/data/dates';
  import type { Milestone } from '$lib/data/types';
  import { vocabulary } from '$lib/data/vocabulary/vocabulary';
  import { activeFlag } from '$lib/theme/activeFlag.svelte';
  import { roleAt } from '$lib/theme/roles';
  import { roleStyle } from '$lib/components/kit/role';
  import Icon from '$lib/components/Icon.svelte';
  import PhotoThumb from '$lib/components/PhotoThumb.svelte';
  import EmptyState from '$lib/components/EmptyState.svelte';
  import ScreenHeader from '$lib/components/ScreenHeader.svelte';

  let today = $derived(todayEpochDay());
  let items = $derived(timelineItems(vocabulary.milestones, today));

  const statusOf = (milestone: Milestone) => {
    const s = milestoneStatus(milestone, today);
    if (s.type === 'countdown') return m.ms_status_in_days({ days: m.n_days({ n: s.days ?? 0 }) });
    if (s.type === 'today') return m.ms_status_today();
    return m.ms_status_years_ago({ years: m.n_years({ n: s.years ?? 0 }) });
  };

  const gapLabel = (fromEpochDay: number, toEpochDay: number) =>
    fmtDuration(calendarDuration(fromEpochDay, toEpochDay));
</script>

<div class="screen">
  <ScreenHeader title={m.timeline()} subtitle={m.tl_intro()} screen="timeline" back="/">
    {#snippet actions()}
      <a class="icon-btn press" href="/settings/milestones" aria-label={m.tl_add_aria()}>
        <Icon name="plus" size={22} />
      </a>
    {/snippet}
  </ScreenHeader>

  {#if items.length}
    <!-- One role for the whole rail rather than one per item: the rail is a
         single area of the screen, and a colour per milestone would make the
         palette a sequence of unrelated marks. -->
    <div class="timeline" style={roleStyle(roleAt(activeFlag.roles, 0))}>
      {#each items as item (item.id)}
        {#if item.kind === 'today'}
          <div class="tl-item tl-today" data-tl-today>
            <span class="tl-dot is-today"></span>
            <p class="tl-here">{m.tl_you_are_here()}</p>
          </div>
        {:else if item.kind === 'gap'}
          {@const label = gapLabel(item.fromEpochDay, item.toEpochDay)}
          <div class="tl-gap" data-tl-gap aria-label={m.tl_gap_aria({ duration: label })}>
            <span class="tl-gap-line"></span>
            <span class="tl-gap-label">{m.tl_gap_label({ duration: label })}</span>
            <span class="tl-gap-line"></span>
          </div>
        {:else}
          <div class="tl-item" class:is-future={item.future} data-tl-item={item.milestone.id}>
            <span class="tl-dot"></span>
            <div class="tl-body">
              <div class="tl-head">
                <span class="tl-name" data-tl-name>{item.milestone.name}</span>
                {#if item.future}<span class="tl-count">{statusOf(item.milestone)}</span>{/if}
              </div>
              <span class="tl-date">
                {fmtDay(item.milestone.epochDay, { day: 'numeric', month: 'long', year: 'numeric' })}{item.future
                  ? ''
                  : ` · ${statusOf(item.milestone)}`}
              </span>
              {#if item.milestone.photo}
                <div class="tl-photo"><PhotoThumb photo={item.milestone.photo} size={88} /></div>
              {/if}
            </div>
          </div>
        {/if}
      {/each}
    </div>
  {:else}
    <EmptyState title={m.tl_empty_title()} text={m.tl_empty_body()}>
      {#snippet action()}
        <a class="btn btn-primary" href="/settings/milestones"><span>{m.tl_empty_action()}</span></a>
      {/snippet}
    </EmptyState>
  {/if}
</div>
