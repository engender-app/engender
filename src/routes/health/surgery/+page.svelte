<script lang="ts">
  import { travelOnChange } from '$lib/motion/reorder.svelte';
  /* Procedures, dates and your own recovery log, on the surface kit (phase
     5 UX ticket 25 and phase 5 deepening ticket 12).

     The index of procedures: the ones still running, then the ones the
     person archived. Each card opens the procedure's own screen
     (`[id]/+page.svelte`, prh12 bug 20), which lays out its five phases,
     its log and its own facts. Tapping a card used to slide that whole log
     open under the list, a thousand pixels below the card on a phone, with
     the name, type and date editable only in a sheet behind a pencil. */
  import { m } from '$lib/paraglide/messages';
  import { journal, liveList, liveQuery } from '$lib/data/live/journal.svelte';
  import { dilationEligible } from '$lib/data/taperSchedule';
  import { epochDayFromDateInputValue } from '$lib/data/epochDay';
  import { currentDay } from '$lib/stores/today.svelte';
  import type { Procedure, ProcedureKind } from '$lib/data/types';
  import type { ProcedurePhoto } from '$lib/data/journal/procedures';
  import { disclose, resize } from '$lib/motion/reveal';
  import Icon from '$lib/components/Icon.svelte';
  import HostedRows from '$lib/components/HostedRows.svelte';
  import ProcedureFields from '$lib/components/ProcedureFields.svelte';
  import ScreenHeader from '$lib/components/ScreenHeader.svelte';
  import ListCard from '$lib/components/kit/ListCard.svelte';
  import Notice from '$lib/components/kit/Notice.svelte';
  import SectionHeading from '$lib/components/kit/SectionHeading.svelte';
  import ProcedureRecoveryCard from '$lib/components/ProcedureRecoveryCard.svelte';
  import { recordEditor } from '$lib/components/kit/recordEditor.svelte';
  import { blankCostDraft, costDraftOk, costFromDraft, type CostDraft } from '$lib/components/costDraft';
  import { deviceDefaultCurrency } from '$lib/data/cost';
  import RecordSheet from '$lib/components/kit/RecordSheet.svelte';
  import { activeFlag } from '$lib/theme/activeFlag.svelte';
  import { roleAt } from '$lib/theme/roles';
  import ReadGate from '$lib/components/kit/ReadGate.svelte';

  const SECTION_ROLE = { procedures: 0 };

  const today = $derived(currentDay());

  let proceduresQuery = liveList((j) => j.procedures.getProcedures());
  let procedures = $derived(proceduresQuery.rows);
  /* Archived only by the person's own switch (functional-audit ticket 24):
     a surgery date never moves a procedure here on its own. */
  let ongoingProcedures = $derived(procedures.filter((procedure) => !procedure.archived));
  let archivedProcedures = $derived(procedures.filter((procedure) => procedure.archived));
  let procedureGroups = $derived([
    { key: 'ongoing', title: m.surgery_ongoing_title(), procedures: ongoingProcedures },
    { key: 'archive', title: m.surgery_archive_title(), procedures: archivedProcedures }
  ].filter((group) => group.procedures.length));

  let procedureRows = $derived(procedureGroups.flatMap((group, index) => [
    { key: `heading-${index}`, group: group.key, heading: group.title, procedure: null },
    ...group.procedures.map((procedure) => ({
      key: procedure.id, group: group.key, heading: null, procedure
    }))
  ]));

  /* A procedure moving between Ongoing and the archive travels there
     instead of cutting; headings and cards that come or go disclose. */
  travelOnChange(
    () => [...document.querySelectorAll<HTMLElement>('.procedure-row[data-travel-key]')],
    (el) => el.dataset.travelKey ?? '',
    () => procedureRows
  );

  /* Every procedure's recovery photos, in one read (ticket 52): each card
     draws its own strip from them. */
  let allPhotosQuery = liveQuery((j) => j.procedures.photosByProcedure());
  let photosByProcedure = $derived(allPhotosQuery.value ?? new Map<string, ProcedurePhoto[]>());

  /* A new procedure only. Editing one happens on its own screen. */
  const record = recordEditor<
    Procedure,
    { id?: string; name: string; date: string; kind: ProcedureKind | null; dilationOptIn: boolean; archived: boolean; cost: CostDraft }
  >({
    /* No kind until one is picked (prh12 bug 18): a default of Custom read
       as an answer already given, so nobody saw a type was being asked for. */
    blank: () => ({ name: '', date: '', kind: null, dilationOptIn: false, archived: false, cost: blankCostDraft(deviceDefaultCurrency()) }),
    async upsert(draft) {
      const name = draft.name.trim();
      if (!name || !draft.kind || !costDraftOk(draft.cost)) return false;
      await journal.procedures.upsertProcedure({
        name,
        // An empty date field leaves the date unset rather than defaulting to
        // today: a procedure without one yet is an ordinary state here.
        surgeryEpochDay: epochDayFromDateInputValue(draft.date) ?? null,
        kind: draft.kind,
        dilationOptIn: draft.kind === 'custom' && draft.dilationOptIn,
        cost: costFromDraft(draft.cost)
      });
    },
    findById: (id) => procedures.find((p) => p.id === id)
  });
</script>

<div class="screen">
  <ScreenHeader title={m.surgery_journey_title()} back="/more">
    {#snippet actions()}
      <button class="icon-btn press" data-add aria-label={m.surgery_add()} onclick={() => record.openEditor(null)}>
        <Icon name="plus" size={22} />
      </button>
    {/snippet}
  </ScreenHeader>

  <ReadGate read={proceduresQuery} variant="line" count={3}>
    {#snippet rows()}
      {#each procedureRows as { key, procedure, group, heading } (key)}
        <div class="procedure-row" data-procedure-group={procedure ? group : undefined} data-procedure-heading={heading ? key : undefined}
          data-travel-key={key} use:resize transition:disclose>
          {#if heading}
            <SectionHeading text={heading} />
          {:else if procedure}
            <ListCard role={roleAt(activeFlag.roles, SECTION_ROLE.procedures)}>
              <ProcedureRecoveryCard
                {procedure}
                {today}
                photos={photosByProcedure.get(procedure.id) ?? []}
              />
            </ListCard>
          {/if}
        </div>
      {/each}
    {/snippet}
    {#snippet empty()}
      <Notice
        icon="clipboard"
        key="surgery-empty"
        role={roleAt(activeFlag.roles, SECTION_ROLE.procedures)}
        title={m.empty_list_title()}
        action={{ label: m.surgery_add(), primary: true, onclick: () => record.openEditor(null) }}
      />
    {/snippet}
  </ReadGate>

  <!-- Dilation, hosted here (phase 9 carpet ticket 16). It was a top-level
       Health row, which put a dilation log in front of everyone who opened
       More whatever their surgery was or was not. The gate is ticket 17's:
       a vaginoplasty, or a custom procedure whose own dilation toggle is
       on. Vulvoplasty is deliberately not in this OR - there is no canal to
       keep. Directly under the cards since audit item 13. -->
  {#if procedures.some(dilationEligible)}
    <HostedRows host="surgery" keys={['dilation']} card />
  {/if}

  <RecordSheet
    {record}
    handle="procedure"
    canSave={(draft) => draft.kind !== null && costDraftOk(draft.cost)}
    newTitle={m.surgery_new_sheet()}
    saveLabel={m.save()}
  >
    {#snippet fields(editor)}
      <ProcedureFields
        bind:name={editor.name}
        bind:kind={editor.kind}
        bind:date={editor.date}
        bind:cost={editor.cost}
        bind:dilationOptIn={editor.dilationOptIn}
        bind:archived={editor.archived}
      />
    {/snippet}
  </RecordSheet>
</div>

<style>
  .procedure-row {
    transition: translate var(--dur-med) var(--ease-out);
  }
</style>
