<script lang="ts">
  /* One picker for a document's link (phase 8 features ticket 56, ADR-0065):
     all four kinds together, each in its own labelled section, so choosing
     a target is one sheet rather than a kind-picker feeding a second sheet.
     Clearing is the same sheet, not a separate control - a "no link" row at
     the top when one is already set.

     Roadmap goals are the one kind with no date, so "most recent first"
     does not apply to them (types.ts, DocumentTarget's own comment): built-in
     goals list in the pack's own order and custom ones follow, newest added
     first. The other three sort by their own day, nearest first. */
  import { m } from '$lib/paraglide/messages';
  import { liveList } from '$lib/data/live/journal.svelte';
  import { fmtDay } from '$lib/data/dates';
  import { POLISH_PACK } from '$lib/data/roadmap';
  import { roadmapGoalTitle } from '$lib/data/vocabulary/roadmapLabels';
  import type { DocumentTarget } from '$lib/data/types';
  import Sheet from './Sheet.svelte';
  import Notice from './kit/Notice.svelte';
  import ListCard from './kit/ListCard.svelte';
  import ListRow from './kit/ListRow.svelte';
  import SectionHeading from './kit/SectionHeading.svelte';

  let {
    open,
    current,
    onPick,
    onClose
  }: {
    open: boolean;
    current: DocumentTarget | null;
    onPick: (target: DocumentTarget | null) => void;
    onClose: () => void;
  } = $props();

  const dayLabel = (epochDay: number) => fmtDay(epochDay, { day: 'numeric', month: 'long', year: 'numeric' });

  let milestonesQuery = liveList((j) => j.milestones.getMilestones());
  let milestones = $derived([...milestonesQuery.rows].sort((a, b) => b.epochDay - a.epochDay));

  let proceduresQuery = liveList((j) => j.procedures.getProcedures());
  let procedures = $derived(
    [...proceduresQuery.rows].sort((a, b) => (b.surgeryEpochDay ?? -Infinity) - (a.surgeryEpochDay ?? -Infinity))
  );

  let episodesQuery = liveList((j) => j.regimen.getEpisodes());
  let episodes = $derived([...episodesQuery.rows].sort((a, b) => b.startEpochDay - a.startEpochDay));

  let customGoalsQuery = liveList((j) => j.roadmap.getCustomGoals());
  let goalRows = $derived([
    ...POLISH_PACK.goals.map((goal) => ({ id: goal.key, label: roadmapGoalTitle(goal.key) })),
    ...[...customGoalsQuery.rows].reverse().map((goal) => ({ id: goal.id, label: goal.text }))
  ]);

  let nothingToLinkTo = $derived(
    milestones.length === 0 && procedures.length === 0 && episodes.length === 0 && goalRows.length === 0
  );

  function pick(target: DocumentTarget) {
    onPick(target);
    onClose();
  }
</script>

<Sheet {open} title={m.document_link_sheet()} {onClose}>
  <h3>{m.document_link_sheet()}</h3>

  {#if current}
    <ListCard>
      <ListRow
        key="clear"
        data-clear-target
        icon="x"
        title={m.document_link_clear()}
        onclick={() => {
          onPick(null);
          onClose();
        }}
      />
    </ListCard>
  {/if}

  {#if nothingToLinkTo}
    <Notice icon="documents" title={m.document_link_empty_title()} text={m.document_link_empty_body()} />
  {/if}

  {#if milestones.length > 0}
    <SectionHeading text={m.milestones()} />
    <ListCard>
      {#each milestones as milestone (milestone.id)}
        <ListRow
          key={milestone.id}
          data-pick-target={`milestone:${milestone.id}`}
          icon="sparkle"
          title={milestone.name}
          subtitle={dayLabel(milestone.epochDay)}
          onclick={() => pick({ kind: 'milestone', id: milestone.id })}
        />
      {/each}
    </ListCard>
  {/if}

  {#if procedures.length > 0}
    <SectionHeading text={m.surgery_journey_title()} />
    <ListCard>
      {#each procedures as procedure (procedure.id)}
        <ListRow
          key={procedure.id}
          data-pick-target={`procedure:${procedure.id}`}
          icon="flag"
          title={procedure.name}
          subtitle={procedure.surgeryEpochDay !== null ? dayLabel(procedure.surgeryEpochDay) : m.surgery_day_unscheduled()}
          onclick={() => pick({ kind: 'procedure', id: procedure.id })}
        />
      {/each}
    </ListCard>
  {/if}

  {#if episodes.length > 0}
    <SectionHeading text={m.regimen()} />
    <ListCard>
      {#each episodes as episode (episode.id)}
        <ListRow
          key={episode.id}
          data-pick-target={`episode:${episode.id}`}
          icon="timeline"
          title={episode.drug}
          subtitle={dayLabel(episode.startEpochDay)}
          onclick={() => pick({ kind: 'episode', id: episode.id })}
        />
      {/each}
    </ListCard>
  {/if}

  {#if goalRows.length > 0}
    <SectionHeading text={m.roadmap_title()} />
    <ListCard>
      {#each goalRows as goal (goal.id)}
        <ListRow
          key={goal.id}
          data-pick-target={`goal:${goal.id}`}
          icon="globe"
          title={goal.label}
          onclick={() => pick({ kind: 'goal', id: goal.id })}
        />
      {/each}
    </ListCard>
  {/if}
</Sheet>
