<script lang="ts">
  /* One picker for a document's link (phase 8 features ticket 56, ADR-0065):
     all four kinds together, each in its own labelled section, so choosing
     a target is one sheet rather than a kind-picker feeding a second sheet.
     Clearing is the same sheet, not a separate control - a "remove the link"
     row at the top when one is already set.

     The four are read into one shape and drawn by one loop, rather than four
     blocks that differ only in which list they walk: the row is identical in
     all four, and the shape is what lets the kind a document is already
     filed under sort to the top. Otherwise a document linked to a roadmap
     goal opens this sheet with its own tick three screens down.

     Roadmap goals are the one kind with no date, so "most recent first" does
     not apply to them: built-in goals list in the pack's own order and custom
     ones follow, newest added first. The other three sort by their own day,
     nearest first. */
  import { m } from '$lib/paraglide/messages';
  import { liveList } from '$lib/data/live/journal.svelte';
  import { fmtDay } from '$lib/data/dates';
  import { POLISH_PACK } from '$lib/data/roadmap';
  import { roadmapGoalTitle } from '$lib/data/vocabulary/roadmapLabels';
  import { DOCUMENT_TARGET_ICON } from '$lib/data/vocabulary/documentTargetLabels';
  import type { DocumentTarget, DocumentTargetKind } from '$lib/data/types';
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

  type PickRow = { id: string; title: string; subtitle?: string };
  type PickSection = { kind: DocumentTargetKind; heading: string; rows: PickRow[] };

  const dayLabel = (epochDay: number) => fmtDay(epochDay, { day: 'numeric', month: 'long', year: 'numeric' });

  let milestonesQuery = liveList((j) => j.milestones.getMilestones());
  let proceduresQuery = liveList((j) => j.procedures.getProcedures());
  let episodesQuery = liveList((j) => j.regimen.getEpisodes());
  let customGoalsQuery = liveList((j) => j.roadmap.getCustomGoals());

  let sections = $derived.by((): PickSection[] => {
    const all: PickSection[] = [
      {
        kind: 'milestone',
        heading: m.milestones(),
        rows: [...milestonesQuery.rows]
          .sort((a, b) => b.epochDay - a.epochDay)
          .map((milestone) => ({ id: milestone.id, title: milestone.name, subtitle: dayLabel(milestone.epochDay) }))
      },
      {
        kind: 'procedure',
        heading: m.surgery_journey_title(),
        rows: [...proceduresQuery.rows]
          .sort((a, b) => (b.surgeryEpochDay ?? -Infinity) - (a.surgeryEpochDay ?? -Infinity))
          .map((procedure) => ({
            id: procedure.id,
            title: procedure.name,
            subtitle:
              procedure.surgeryEpochDay !== null ? dayLabel(procedure.surgeryEpochDay) : m.surgery_day_unscheduled()
          }))
      },
      {
        kind: 'episode',
        heading: m.regimen(),
        rows: [...episodesQuery.rows]
          .sort((a, b) => b.startEpochDay - a.startEpochDay)
          .map((episode) => ({ id: episode.id, title: episode.drug, subtitle: dayLabel(episode.startEpochDay) }))
      },
      {
        kind: 'goal',
        heading: m.roadmap_title(),
        rows: [
          ...POLISH_PACK.goals.map((goal) => ({ id: goal.key, title: roadmapGoalTitle(goal.key) })),
          ...[...customGoalsQuery.rows].reverse().map((goal) => ({ id: goal.id, title: goal.text }))
        ]
      }
    ];

    const withRows = all.filter((section) => section.rows.length > 0);
    if (!current) return withRows;

    /* The link the document already has, first in its section and that
       section first on the sheet. Without it the tick can be three screens
       down - the roadmap pack alone is nearly thirty rows - and the sheet
       opens on no answer to "what is this filed under now". Only the one
       row moves; everything under it keeps its own order. */
    return withRows
      .map((section) =>
        section.kind === current.kind
          ? {
              ...section,
              rows: [...section.rows].sort(
                (a, b) => Number(b.id === current.id) - Number(a.id === current.id)
              )
            }
          : section
      )
      .sort((a, b) => Number(b.kind === current.kind) - Number(a.kind === current.kind));
  });

  /* Every row carries a box rather than a chevron: it picks, it does not go
     anywhere, and the one that is already the link has to say so. */
  const isCurrent = (kind: DocumentTargetKind, id: string) => current?.kind === kind && current.id === id;

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
        chevron={false}
        icon="x"
        title={m.document_link_clear()}
        onclick={() => {
          onPick(null);
          onClose();
        }}
      />
    </ListCard>
  {/if}

  {#if sections.length === 0}
    <Notice icon="documents" title={m.document_link_empty_title()} text={m.document_link_empty_body()} />
  {/if}

  {#each sections as section (section.kind)}
    <SectionHeading text={section.heading} />
    <ListCard>
      {#each section.rows as row (row.id)}
        <ListRow
          key={row.id}
          data-pick-target={`${section.kind}:${row.id}`}
          checked={isCurrent(section.kind, row.id)}
          chevron={false}
          icon={DOCUMENT_TARGET_ICON[section.kind]}
          title={row.title}
          subtitle={row.subtitle}
          onclick={() => pick({ kind: section.kind, id: row.id })}
        />
      {/each}
    </ListCard>
  {/each}
</Sheet>
