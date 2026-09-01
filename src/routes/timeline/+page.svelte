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
  import { resolveMilestoneOrigin } from '$lib/data/provenance';
  import { timelineItems } from '$lib/data/timelineItems';
  import { fmtDay, fmtDuration } from '$lib/data/dates';
  import type { Milestone } from '$lib/data/types';
  import { vocabulary } from '$lib/data/vocabulary/vocabulary';
  import { activeFlag } from '$lib/theme/activeFlag.svelte';
  import { roleAt } from '$lib/theme/roles';
  import { roleAttrs } from '$lib/components/kit/role';
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
    <div class="timeline" {...roleAttrs(roleAt(activeFlag.roles, 0))}>
      {#each items as item (item.id)}
        {#if item.kind === 'today'}
          <div class="tl-item tl-today" data-tl-today>
            <span class="tl-dot is-today"></span>
            <p class="tl-here">{m.tl_you_are_here()}</p>
          </div>
        {:else if item.kind === 'gap'}
          {@const label = gapLabel(item.fromEpochDay, item.toEpochDay)}
          <!-- The axis runs behind this rather than being interrupted by it,
               so the label is the only thing here: two dashed rules either
               side of it were what broke the line into pieces. -->
          <div class="tl-gap" data-tl-gap aria-label={m.tl_gap_aria({ duration: label })}>
            <span class="tl-gap-label">{m.tl_gap_label({ duration: label })}</span>
          </div>
        {:else}
          {@const origin = resolveMilestoneOrigin(item.milestone)}
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
              {#if origin}
                <p class="tl-provenance muted small">
                  {origin.text}
                  {#if origin.href}<a href={origin.href}>{m.prov_open_source()}</a>{/if}
                </p>
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

<style>
  /* Back to the shape that worked (Alicja, 2026-08-25: "it looks much better
     before - what have you done? we want the vertical time axis on the left
     just like before"). The axis is a continuous line down the left, every
     milestone is a point on it, and the description sits beside the point.

     What this ticket's own rebuild had got wrong: it kept the same parts and
     loosened all of them. The rail was 32% of a stripe on a dark ground, so it
     read as a suggestion; the dots sat outside a card with no card edge to
     measure against; and the axis stopped and restarted around the gap and the
     today marker, so there was no continuous line at all. The parts are the
     old ones again, tightened rather than restyled: the axis runs the whole
     height without a break, the dots are on it, and the only thing kept from
     the rebuild is that it wears the flag instead of the accent - which is the
     rule every other area of the app follows. */
  .timeline {
    position: relative;
    padding-left: 30px;
  }

  /* One line, top to bottom, behind everything - including the gap and the
     today marker, which used to interrupt it. A timeline whose axis stops is
     not an axis. */
  .timeline::before {
    content: '';
    position: absolute;
    left: 5px;
    top: 6px;
    bottom: 6px;
    width: 2px;
    border-radius: 1px;
    background: color-mix(in oklab, var(--role-draw) 60%, var(--bg));
  }

  .tl-item {
    position: relative;
    margin-bottom: var(--space-4);
  }

  /* The point on the axis, centred on the line and cut out of it by a ring in
     the page colour, so the line appears to pass behind rather than through. */
  .tl-dot {
    position: absolute;
    left: -30px;
    top: 18px;
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: var(--role-draw);
    box-shadow: 0 0 0 4px var(--bg);
  }

  /* Ahead rather than behind: the same point, unfilled. */
  .tl-item.is-future .tl-dot {
    background: var(--bg);
    box-shadow: 0 0 0 4px var(--bg), inset 0 0 0 2px var(--role-draw);
  }

  /* Today is the one mark on the axis that is not a milestone, so it is the
     one drawn in the text colour rather than the flag's. */
  .tl-today {
    margin: var(--space-5) 0;
    min-height: 20px;
  }

  .tl-today .tl-dot {
    top: 2px;
    background: var(--text);
    box-shadow: 0 0 0 4px var(--bg);
  }

  .tl-here {
    margin: 0;
    padding-top: 1px;
    font-size: var(--text-sm);
    font-weight: var(--weight-bold);
    color: var(--text);
  }

  .tl-body {
    background: var(--surface);
    border: 1px solid var(--outline);
    border-radius: var(--r-card);
    padding: var(--space-4);
  }

  .tl-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--space-3);
  }

  .tl-name {
    font-weight: var(--weight-bold);
    min-width: 0;
  }

  .tl-count {
    flex: 0 0 auto;
    font-size: var(--text-xs);
    font-weight: var(--weight-bold);
    color: var(--role-ink);
    background: var(--role-tint);
    border: var(--role-hairline);
    padding: 3px 10px;
    border-radius: var(--radius-pill);
  }

  .tl-date {
    display: block;
    margin-top: var(--space-1);
    font-size: var(--text-sm);
    color: var(--text-2);
  }

  .tl-photo { margin-top: var(--space-3); }

  .tl-provenance {
    margin: var(--space-1) 0 0;
  }

  .tl-provenance a {
    color: inherit;
    text-decoration: underline;
  }

  /* The compressed stretch. It sits on the axis rather than replacing it: the
     line runs behind, and this is a label with the page colour behind it so
     the line does not cross the words. */
  .tl-gap {
    position: relative;
    display: flex;
    align-items: center;
    margin: var(--space-5) 0;
    padding-left: 6px;
    color: var(--text-2);
    font-size: var(--text-xs);
  }

  .tl-gap-label {
    background: var(--bg);
    padding: 2px 8px 2px 0;
  }
</style>
