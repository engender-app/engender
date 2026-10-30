<script lang="ts">
  import { offerUndo, undoable } from '$lib/stores/deleteUndo';
  import type { UndoableDelete } from '$lib/data/journal/undoableDelete';
  import { journalTextAutocomplete } from '$lib/platform';
  import ReadReserve from '$lib/components/kit/ReadReserve.svelte';
  import { readReserve, rememberReserve } from '$lib/data/homeReserve';
  import SourceRecordHandoff from '$lib/components/SourceRecordHandoff.svelte';
  /* The step-by-step checklist, on the surface kit (phase 5 UX ticket 25).

     The pack's provenance was five paragraphs stacked in one card - what
     the pack is, what it does not cover, what a marker means, that none of
     it is advice, and where it came from and when it was checked - which
     is the first thing on the screen and reads as a wall before a single
     step of the roadmap. It is a notice carrying the first two, which are
     the ones that change how the list is read, and a quiet block under it
     carrying the rest. Nothing is deleted: this is a bundled claim about
     somebody's legal and medical path and every word of it stays.

     The rows stay written out rather than built from ListRow: a row here
     is a three-state tick whose accessible name is the goal and its state
     together, and a ListRow announces a title and goes somewhere.

     Ticket 56/ADR-0068 splits the row in two rather than reaching for
     ListRow anyway: the tap that cycles the tick keeps `.kit-row-main`,
     and a trailing `.kit-row-act` opens the goal's own sheet - the same two
     classes ListRow's own `action` prop draws from, borrowed for their
     structure and CSS rather than through the component, since the box and
     the done/skip title colouring still don't fit ListRow's plain string
     title (ticket 16's own reason for hand-rolling these rows at all). The
     control shows on every row, ticked or not - ADR-0068: the Polish pack's
     "keep opinions" goal is exactly the case where paper arrives before a
     tick ever could.

     Functional audit ticket 34 left one built-in group, the Polish court
     procedure, behind a "Polish legal steps" switch that follows the app's
     language until somebody answers it. The social, presentational and
     medical tracks went, and with them the track switcher and the per-track
     "not my path", which the switch now says for the only group left. Under
     it, whatever the switch says, sit the person's own categories: each one
     named, renamed and removed by them, with goals of their own in it
     (round two, Alicja at sign-off: "it should be possible to add your own
     goal/category"). The roadmap-to-milestone prompt moved
     here from the notifications screen, beside the switch, since it is
     about this screen's ticks and nothing else. The count beside the
     heading says how many steps are still unchecked, in words rather than
     a percentage or a ring (ADR-0012, ticket 54's "no score, anywhere").
     The caveat and the marker note stay at the top, since both change how
     the list below is read; the sources line and the reviewed-on date
     carry no such warning and sit at the foot. */
  import { page } from '$app/state';
  import { m } from '$lib/paraglide/messages';
  import { attempt, deleter, writer } from '$lib/stores/attempt.svelte';
  import { toast } from '$lib/stores/toasts.svelte';
  import { journal, liveList, liveQuery } from '$lib/data/live/journal.svelte';
  import { fmtDay } from '$lib/data/dates';
  import { epochDayFromLocalDate } from '$lib/data/epochDay';
  import { getLocale } from '$lib/paraglide/runtime';
  import {
    LEGAL_GROUP,
    POLISH_INSTITUTIONS,
    POLISH_PACK,
    ownStepsLeft,
    polishLegalStepsShown,
    roadmapList,
    roadmapStepsLeft,
    type RoadmapGoalKey
  } from '$lib/data/roadmap';
  import { vocabulary } from '$lib/data/vocabulary/vocabulary';
  import type { RoadmapGoalStatus } from '$lib/data/types';
  import LinkedDocuments from '$lib/components/LinkedDocuments.svelte';
  import {
    roadmapGoalNote,
    roadmapGoalNoteSecondary,
    roadmapCategoryName,
    roadmapGoalTitle,
    roadmapInstitutionName,
    roadmapPackCaveat,
    roadmapPackMarkerNote,
    roadmapPackName,
    roadmapPackSources
  } from '$lib/data/vocabulary/roadmapLabels';
  import { prefs } from '$lib/data/prefs/store.svelte';
  import RoadmapMilestonePromptSheet from '$lib/components/RoadmapMilestonePromptSheet.svelte';
  import {
    OFFERS,
    answerOffer,
    milestoneMintedByGoal,
    type OfferAnswer,
    type RoadmapGoalMilestone
  } from '$lib/data/offers';
  import Icon from '$lib/components/Icon.svelte';
  import ScreenHeader from '$lib/components/ScreenHeader.svelte';
  import Switch from '$lib/components/Switch.svelte';
  import Sheet from '$lib/components/Sheet.svelte';
  import ConfirmDeleteSheet from '$lib/components/kit/ConfirmDeleteSheet.svelte';
  import Field from '$lib/components/kit/Field.svelte';
  import ListCard from '$lib/components/kit/ListCard.svelte';
  import ListRow from '$lib/components/kit/ListRow.svelte';
  import Notice from '$lib/components/kit/Notice.svelte';
  import SectionHeading from '$lib/components/kit/SectionHeading.svelte';
  import { collapse, disclose, resize } from '$lib/motion/reveal';
  import Institutions from './Institutions.svelte';
  import { crossfadeDuration, fadeOnly, motionDuration } from '$lib/motion/tokens';
  import { activeFlag } from '$lib/theme/activeFlag.svelte';
  import { roleAt } from '$lib/theme/roles';

  /* One bundled pack, so no picker: the phase 4 scope decision ships
     Polish only. A second pack would turn this into a choice, and nothing
     below assumes there is one. */
  const pack = POLISH_PACK;

  /* Closed by default (redesign ticket 16): the pack's own provenance used
     to be the first thing the screen said. */
  let packDetailsOpen = $state(false);

  let statusQuery = liveQuery((j) => j.roadmap.getGoalStatuses(pack.key));
  let statuses = $derived(statusQuery.value ?? {});

  let customQuery = liveList((j) => j.roadmap.getCustomGoals());
  let customGoals = $derived(customQuery.rows);

  let categoryQuery = liveList((j) => j.roadmap.getCategories());
  let categories = $derived(categoryQuery.rows);

  /* The institution list (functional audit ticket 35), read here rather
     than in its own component so the reserve below waits for it too. */
  let institutionQuery = liveList((j) => j.roadmap.getInstitutions());
  let institutionChangeQuery = liveList((j) => j.roadmap.getInstitutionChanges());
  let institutionsPanel = $state<ReturnType<typeof Institutions> | null>(null);

  /* The switch (functional audit ticket 34). Null until somebody touches
     it, and null follows the language: on for Polish, off otherwise. The
     ticks stay stored either way, so switching back brings back exactly
     what was ticked. */
  let polishShown = $derived(polishLegalStepsShown(prefs.roadmapPolishStepsChoice, getLocale()));

  let hiddenQuery = liveQuery((j) => j.roadmap.getHiddenGoals(pack.key));
  let hiddenGoals = $derived(hiddenQuery.value ?? []);
  let hiddenBuiltIns = $derived(pack.goals.filter((goal) => hiddenGoals.includes(goal.key)));
  let hiddenInstitutions = $derived(POLISH_INSTITUTIONS.filter((one) => hiddenGoals.includes(one.key)));
  let hiddenGoalsOpen = $state(false);
  let list = $derived(roadmapList(pack, polishShown, customGoals, hiddenGoals, categories));
  let stepsLeft = $derived(roadmapStepsLeft(list, (key) => statuses[key] ?? 'unchecked'));
  let anySteps = $derived(list.goals.length + list.legalGoals.length > 0);
  let loaded = $derived(
    !statusQuery.loading &&
      !customQuery.loading &&
      !hiddenQuery.loading &&
      !categoryQuery.loading &&
      !institutionQuery.loading &&
      !institutionChangeQuery.loading
  );
  const fadeCount = (_node: Element) =>
    fadeOnly(Math.max(motionDuration('--dur-fast'), crossfadeDuration()));

  /* Split by hand rather than run through epochDayFromDateInputValue: the
     review date is a bundled constant that roadmap.test.ts already asserts
     is an ISO day, so a nullable parser here would buy nothing but a branch
     no input can reach. */
  const [year, month, day] = pack.reviewedOn.split('-').map(Number);
  const reviewedLabel = fmtDay(epochDayFromLocalDate(new Date(year, month - 1, day)), {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });

  /* unchecked -> checked -> not-my-path -> unchecked. A tap cycles through
     all three rather than needing a separate affordance for "not my
     path": the ticket asks for a third state on the same tick, not a
     second control next to it. */
  function nextStatus(status: RoadmapGoalStatus): RoadmapGoalStatus {
    if (status === 'unchecked') return 'checked';
    if (status === 'checked') return 'not-my-path';
    return 'unchecked';
  }

  /* One entry in the offer registry (phase 8 features ticket 22,
     ADR-0045), and `answerOffer` below is the only path from a tick to a
     milestone. */
  const MILESTONE_OFFER = OFFERS['roadmap-goal-milestone'];
  let promptGoal = $state<{ key: string; title: string } | null>(null);

  /* ADR-0045's second half, which this screen did not keep: "each confirmed
     link is recorded ... so the same source doesn't offer to mint twice".
     Unchecking a goal and checking it again re-offered, and confirming a
     second time wrote a *second* milestone against the same
     `roadmapGoalKey`, because `upsertMilestone` inserts whenever it is
     handed no id. `milestoneMintedByGoal` is that lookup, which the surgery
     hub has always made in its own way through `linkedMilestone`. */
  const offerMilestone = (key: string, title: string) => {
    if (!prefs.roadmapMilestoneSyncEnabled) return;
    if (milestoneMintedByGoal(vocabulary.milestones, key)) return;
    promptGoal = { key, title };
  };

  const toggleBuiltIn = (goalKey: RoadmapGoalKey) => {
    const current = statuses[goalKey] ?? 'unchecked';
    const next = nextStatus(current);
    attempt(() => journal.roadmap.setGoalStatus(pack.key, goalKey, next), m.write_failed());
    if (current === 'unchecked' && next === 'checked') offerMilestone(goalKey, roadmapGoalTitle(goalKey));
  };

  const toggleCustom = (goal: { id: string; status: RoadmapGoalStatus; text: string }) => {
    const current = goal.status;
    const next = nextStatus(current);
    attempt(() => journal.roadmap.setCustomGoalStatus(goal.id, next), m.write_failed());
    if (current === 'unchecked' && next === 'checked') offerMilestone(goal.id, goal.text);
  };

  /* Closed once the write lands: the sheet holds its button while it runs
     and turns a rejection into a toast, keeping what was typed
     (after-release 06). */
  async function answerMilestoneOffer(given: OfferAnswer, data: RoadmapGoalMilestone | null) {
    if (promptGoal === null) return;
    const added = await answerOffer(MILESTONE_OFFER, data, given, journal);
    promptGoal = null;
    if (added) toast(m.roadmap_milestone_added());
  }

  function stateLabel(status: RoadmapGoalStatus): string {
    if (status === 'checked') return m.roadmap_state_checked();
    if (status === 'not-my-path') return m.roadmap_state_not_my_path();
    return m.roadmap_state_unchecked();
  }

  /* Which group the new-goal sheet adds to: LEGAL_GROUP or a category's
     uuid. Null while the sheet is closed. */
  let addingTo = $state<string | null>(null);
  let newGoalText = $state('');
  const startAddingGoal = (group: string) => {
    addingTo = group;
    newGoalText = '';
  };

  /* The goal sheet (ticket 56, ADR-0068): identity only, never a status
     snapshot, so the sheet keeps reading the live tick after it opens
     rather than showing what the status was the moment it was tapped. */
  let selectedGoal = $state<{ key: string; title: string; builtin: boolean } | null>(null);
  let selectedStatus = $derived<RoadmapGoalStatus>(
    !selectedGoal
      ? 'unchecked'
      : selectedGoal.builtin
        ? (statuses[selectedGoal.key] ?? 'unchecked')
        : (customGoals.find((goal) => goal.id === selectedGoal!.key)?.status ?? 'unchecked')
  );
  let selectedMilestone = $derived(selectedGoal ? milestoneMintedByGoal(vocabulary.milestones, selectedGoal.key) : null);

  /* Read live for the same reason the tick is (ticket 69): a custom goal's
     text is editable from inside this sheet, so the title it was opened
     under is a snapshot the moment somebody saves a new wording. A built-in
     goal's title is bundled text and has nowhere else to come from. */
  let selectedTitle = $derived(
    !selectedGoal
      ? ''
      : selectedGoal.builtin
        ? selectedGoal.title
        : (customGoals.find((goal) => goal.id === selectedGoal!.key)?.text ?? selectedGoal.title)
  );

  const openBuiltInGoal = (key: RoadmapGoalKey) => (selectedGoal = { key, title: roadmapGoalTitle(key), builtin: true });
  const openCustomGoal = (goal: { id: string; text: string }) => {
    selectedGoal = { key: goal.id, title: goal.text, builtin: false };
    goalDraft = goal.text;
  };

  /* Editing and deleting a custom goal (ticket 69, ADR-0068), both of them
     inside the sheet and neither of them offered on a built-in goal: there
     is no row to edit and nothing to delete.

     The write goes unawaited and uncaught, which is what the three writes
     above it do - the only way `updateCustomGoalText` throws is an id this
     screen's own live list still holds, and a single write here that
     reported a failure while the tick beside it did not would be the
     inconsistency, not the fix. */
  let goalDraft = $state('');
  let confirmingDelete = $state(false);

  /* The confirmation counts what it is about to unfile, so this asks for the
     documents a second time rather than reading them off LinkedDocuments
     inside the sheet - a shared component across four kinds does not grow a
     callback so that one caller can count its rows. One indexed read, only
     while a custom goal's sheet is open. */
  let goalDocuments = liveList((j) =>
    selectedGoal && !selectedGoal.builtin
      ? j.documents.getDocumentsLinkedTo('goal', selectedGoal.key)
      : Promise.resolve(undefined)
  );

  /* Held once rather than restated on the button: the walkthrough asserts on
     the disabled state, so the two must not be able to drift apart. */
  let goalRewording = $derived(goalDraft.trim());
  let canSaveGoal = $derived(
    selectedGoal !== null && !selectedGoal.builtin && goalRewording !== '' && goalRewording !== selectedTitle
  );

  /* On the confirm button as a handle rather than left for a test to read
     out of the sentence: the walkthrough has to be able to check the count
     without gripping the plural copy that carries it (ADR-0029). */
  let unfiledByDelete = $derived(goalDocuments.rows.length);

  const visibilityWrite = writer();
  let selectedHidden = $derived(!!selectedGoal?.builtin && hiddenGoals.includes(selectedGoal.key));
  const toggleGoalVisibility = async () => {
    if (!selectedGoal?.builtin) return;
    const key = selectedGoal.key;
    const hidden = !selectedHidden;
    if (await visibilityWrite.run(() => journal.roadmap.setGoalHidden(pack.key, key, hidden), m.write_failed())) {
      closeGoalSheet();
    }
  };

  const goalWrite = writer();
  const saveGoalText = async () => {
    if (!canSaveGoal) return;
    const key = selectedGoal!.key;
    const text = goalRewording;
    if (await goalWrite.run(() => journal.roadmap.updateCustomGoalText(key, text), m.write_failed())) {
      toast(m.saved(), { kind: 'record-saved' });
    }
  };

  /* Both sheets wait for the delete and then close together (after-release
     06): a failed one keeps the question up with the goal still there,
     rather than closing over a goal that never went. */
  const removing = deleter();
  const deleteGoal = async () => {
    if (!selectedGoal) return;
    const id = selectedGoal.key;
    let deletion: UndoableDelete | undefined;
    if (!(await removing.run(async () => { deletion = await undoable((j) => j.roadmap.deleteCustomGoal(id)); }))) return;
    confirmingDelete = false;
    closeGoalSheet();
    offerUndo(deletion!, m.record_deleted());
  };

  const addGoalWrite = writer();
  async function addGoal() {
    const text = newGoalText.trim();
    const group = addingTo;
    if (!text || group === null) return;
    if (!(await addGoalWrite.run(() => journal.roadmap.addCustomGoal(text, group), m.write_failed()))) return;
    addingTo = null;
    toast(m.saved(), { kind: 'record-saved' });
  }

  /* The person's categories (round two). A new one is a name and nothing
     else; renaming and removing live in its own sheet, opened from the
     pencil on its heading, the place a control for the area as a whole
     goes (SectionHeading's `action`). */
  let addingCategory = $state(false);
  let newCategoryName = $state('');
  const addCategoryWrite = writer();
  async function addCategory() {
    const name = newCategoryName.trim();
    if (!name) return;
    if (!(await addCategoryWrite.run(() => journal.roadmap.addCategory(name), m.write_failed()))) return;
    addingCategory = false;
    toast(m.saved(), { kind: 'record-saved' });
  }

  /* Identity only, like the goal sheet: the name shown is read live. */
  let selectedCategoryId = $state<string | null>(null);
  let selectedCategory = $derived(categories.find((one) => one.id === selectedCategoryId) ?? null);
  let selectedCategoryName = $derived(selectedCategory ? roadmapCategoryName(selectedCategory) : '');
  let categoryDraft = $state('');
  let goalsInSelectedCategory = $derived(customGoals.filter((goal) => goal.track === selectedCategoryId).length);
  const openCategory = (category: { id: string; name: string }) => {
    selectedCategoryId = category.id;
    categoryDraft = roadmapCategoryName(category);
  };
  let canSaveCategory = $derived(
    selectedCategory !== null && categoryDraft.trim() !== '' && categoryDraft.trim() !== selectedCategoryName
  );
  const categoryWrite = writer();
  const saveCategoryName = async () => {
    if (!canSaveCategory) return;
    const id = selectedCategoryId!;
    const name = categoryDraft.trim();
    if (await categoryWrite.run(() => journal.roadmap.renameCategory(id, name), m.write_failed())) {
      selectedCategoryId = null;
      toast(m.saved(), { kind: 'record-saved' });
    }
  };
  let confirmingCategoryDelete = $state(false);
  const removingCategory = deleter();
  const deleteCategory = async () => {
    const id = selectedCategoryId;
    if (id === null) return;
    if (!(await removingCategory.run(() => journal.roadmap.deleteCategory(id)))) return;
    confirmingCategoryDelete = false;
    selectedCategoryId = null;
    toast(m.record_deleted(), { kind: 'record-deleted' });
  };

  let sourceId = $derived(page.url.searchParams.get('goal'));
  let sourceBuiltin = $derived(pack.goals.find((goal) => goal.key === sourceId));
  let sourceCustom = $derived(customGoals.find((goal) => goal.id === sourceId));
  /* A document filed under an institution links here with the same
     `?goal=`, since the six that were steps kept their keys. */
  let sourceInstitution = $derived(
    sourceId !== null && (POLISH_INSTITUTIONS.some((one) => one.key === sourceId) || institutionQuery.rows.some((one) => one.id === sourceId))
  );
  function openSource() {
    if (sourceBuiltin) openBuiltInGoal(sourceBuiltin.key);
    else if (sourceCustom) openCustomGoal(sourceCustom);
    else if (sourceInstitution && sourceId !== null) institutionsPanel?.open(sourceId);
  }

  function closeGoalSheet() {
    selectedGoal = null;
  }


  /* Latched: a reserve must not put its placeholder back (ux-carpet ticket 205). */
  let roadmapRevealed = $state(false);
  $effect.pre(() => {
    if (!roadmapRevealed && loaded && vocabulary.ready) roadmapRevealed = true;
  });
  const roadmapEstimate = readReserve('roadmap');
  const roadmapRemember = (px: number) => rememberReserve('roadmap', px);
</script>

<!-- A goal's title with its strike: a copy of the words laid over them,
     transparent, whose inline background draws one 2px line per wrapped
     line (box-decoration-break: clone). The copy is clipped from the left
     and the clip opens when the goal is done, so the strike travels by
     clip-path alone (after-release 28, audit V08). -->
{#snippet struck(text: string)}
  <span class="roadmap-strike-text">{text}<span class="roadmap-strike-lines" aria-hidden="true"><span>{text}</span></span></span>
{/snippet}

<!-- A goal the person wrote, in whichever group it sits. -->
{#snippet customRow(goal: { id: string; track: string; text: string; status: RoadmapGoalStatus })}
  <div transition:collapse class="kit-row is-split" data-goal={goal.id} data-status={goal.status}>
    <button
      type="button"
      class="kit-row-main"
      aria-label={`${goal.text} — ${stateLabel(goal.status)}`}
      onclick={() => toggleCustom(goal)}
    >
      <span
        class="roadmap-box"
        class:roadmap-ticked={goal.status === 'checked'}
        class:roadmap-skip={goal.status === 'not-my-path'}
      >
        <span class="roadmap-tick" class:roadmap-tick-shown={goal.status === 'checked'} aria-hidden="true"><Icon name="check" size={20} /></span>
        <span class="roadmap-tick" class:roadmap-tick-shown={goal.status === 'not-my-path'} aria-hidden="true"><Icon name="x" size={16} /></span>
      </span>
      <span class="kit-row-text">
        <!-- A rewording crossfades the old words into the new in one grid
             cell, and `resize` carries the row's height when the new words
             take a line more or less, so nothing under the row steps. -->
        <span
          class="kit-row-title"
          class:roadmap-done={goal.status === 'checked'}
          class:roadmap-skip-text={goal.status === 'not-my-path'}
          use:resize
        >
          <span class="roadmap-fade">
            {#key goal.text}
              <span transition:fadeCount>{@render struck(goal.text)}</span>
            {/key}
          </span>
        </span>
      </span>
    </button>
    <button
      type="button"
      class="kit-row-act press"
      data-open-goal={goal.id}
      aria-label={m.roadmap_goal_open_aria({ goal: goal.text })}
      onclick={() => openCustomGoal(goal)}
    >
      <Icon name="chevronRight" size={18} />
    </button>
  </div>
{/snippet}

<!-- The last row of every group: a goal of the person's own, added to that
     group. -->
{#snippet addGoalRow(group: string)}
  <button class="kit-row" data-add-goal={group} onclick={() => startAddingGoal(group)}>
    <span class="roadmap-box add-icon"><Icon name="plus" size={20} /></span>
    <span class="kit-row-text"><span class="kit-row-title muted">{m.roadmap_new_goal()}</span></span>
  </button>
{/snippet}

<div class="screen">
  <ScreenHeader title={m.roadmap_title()} back="/more" />
  <SourceRecordHandoff
    id={sourceId}
    ready={!!sourceBuiltin || (!customQuery.loading && !customQuery.failed && !institutionQuery.loading && !institutionQuery.failed)}
    found={!!sourceBuiltin || !!sourceCustom || sourceInstitution}
    onOpen={openSource}
  />

  <!-- The two questions this screen answers for itself, above what they
       govern (functional audit ticket 34): whether the Polish steps show
       at all, and whether ticking one offers a milestone. Plain divs, the
       rule the notifications screen keeps for its switch rows: the row
       does nothing when tapped, the switch inside it does. -->
  <ListCard role={roleAt(activeFlag.roles, 0)}>
    <div class="kit-row" data-roadmap-polish-steps>
      <span class="kit-row-text">
        <span class="kit-row-title">{m.roadmap_polish_steps_title()}</span>
        <span class="kit-row-sub">{m.roadmap_polish_steps_sub()}</span>
      </span>
      <span class="kit-row-trail">
        <Switch checked={polishShown} label={m.roadmap_polish_steps_title()} onChange={(v) => (prefs.roadmapPolishStepsChoice = v)} />
      </span>
    </div>
    <div class="kit-row" data-roadmap-milestone-sync>
      <span class="kit-row-text">
        <span class="kit-row-title">{m.roadmap_milestone_sync_title()}</span>
        <span class="kit-row-sub">{m.roadmap_milestone_sync_sub()}</span>
      </span>
      <span class="kit-row-trail">
        <Switch checked={prefs.roadmapMilestoneSyncEnabled} label={m.roadmap_milestone_sync_title()} onChange={(v) => (prefs.roadmapMilestoneSyncEnabled = v)} />
      </span>
    </div>
  </ListCard>

  <!-- Held at last visit's height until the goals have answered, then faded in (ux-carpet ticket 211): the list and sources cut in at full opacity over the skeleton. -->
  <ReadReserve ready={roadmapRevealed} estimate={roadmapEstimate} onrest={roadmapRemember}>
    <!-- The pack's provenance, collapsed to one row (redesign ticket 16),
         and only while its steps show: with the switch off there is no
         Polish procedure on screen for it to qualify. -->
    {#if polishShown}
      <div data-roadmap-pack transition:disclose>
        <ListCard role={roleAt(activeFlag.roles, 0)}>
          <ListRow
            data-roadmap-pack-toggle
            onclick={() => (packDetailsOpen = !packDetailsOpen)}
            aria-expanded={packDetailsOpen}
            chevron={false}
            icon="globe"
            title={m.roadmap_pack_details_toggle()}
          >
            {#snippet trailing()}
              <Icon name={packDetailsOpen ? 'chevronDown' : 'chevronRight'} size={20} />
            {/snippet}
          </ListRow>
        </ListCard>
        {#if packDetailsOpen}
          <div data-roadmap-pack-details transition:disclose>
            <Notice
              icon="globe"
              key="roadmap-pack"
              title={roadmapPackName(pack.key)}
              text={roadmapPackCaveat(pack.key)}
            />
            <div class="roadmap-provenance">
              <p class="small">{roadmapPackMarkerNote(pack.key)}</p>
              <p class="small">{m.roadmap_not_advice()}</p>
            </div>
          </div>
        {/if}
        {#if hiddenBuiltIns.length + hiddenInstitutions.length > 0}
          <button class="btn btn-ghost press" data-show-hidden-goals onclick={() => (hiddenGoalsOpen = true)} transition:disclose>
            <span>{m.roadmap_hidden_goals_count({ n: hiddenBuiltIns.length + hiddenInstitutions.length })}</span>
          </button>
        {/if}
      </div>
    {/if}

    <!-- The Polish legal steps, the one built-in group, and the goals the
         person added to it; all of it shows and hides with the switch, as
         one block that travels only the part the screen shows (`onScreen`:
         the group is about 3000px, and travelled whole its edge crossed the
         screen in one frame). The sources and the checked-on date close the
         group rather than the screen, since they are about these steps. -->
    {#if polishShown}
      <section class="roadmap-group" data-roadmap-legal transition:disclose={{ onScreen: true }}>
        <SectionHeading text={m.roadmap_polish_steps_title()}>
          {#snippet action()}
            <span class="roadmap-steps" data-roadmap-steps-left>
              {#if anySteps}
                {#key stepsLeft}
                  <span transition:fadeCount>{m.roadmap_track_steps_left({ n: stepsLeft })}</span>
                {/key}
              {/if}
            </span>
          {/snippet}
        </SectionHeading>
        <ListCard role={roleAt(activeFlag.roles, 1)}>
          <!-- Every row below is hand-rolled rather than ListRow (ticket 16):
               .roadmap-box is a three-state control (checked/not-my-path/
               unchecked, two different glyphs), which ListRow's binary
               `checked` has no room for, and the done/skip title styling needs
               a class ListRow's plain `title` string can't carry.

               The split shape (ticket 56, ADR-0068) is still ListRow's own,
               borrowed for its classes rather than the component: the tap that
               cycles the tick is `.kit-row-main`, and `.kit-row-act` opens the
               goal's own sheet, on every row whether ticked or not. The glyph
               on it is a chevron rather than the paper one: the sheet holds the
               tick, the milestone and the documents, and an icon naming one of
               the three reads as though it were all of it.

               A single row hidden or put back discloses on its own, and
               `rows-divide` keeps the hairline between the pack's rows and
               the first goal of the person's own under them. -->
          {#if list.goals.length > 0}
            <div class="rows-divide" data-roadmap-pack-goals>
              {#each list.goals as goal (goal.key)}
                {@const status = statuses[goal.key] ?? 'unchecked'}
                <div class="kit-row is-split" data-goal={goal.key} data-status={status} transition:disclose>
                  <button
                    type="button"
                    class="kit-row-main"
                    aria-label={`${roadmapGoalTitle(goal.key)} — ${stateLabel(status)}`}
                    onclick={() => toggleBuiltIn(goal.key)}
                  >
                    <!-- Both glyphs stay in the markup and cross on opacity and a
                         scale rather than being added and removed (ux-carpet
                         ticket 236, the same fix appointment-prep's .ap-tick
                         already carries): a glyph that appears in one frame is a
                         yank in both directions, and which one shows is on the
                         box's own classes. -->
                    <span class="roadmap-box" class:roadmap-ticked={status === 'checked'} class:roadmap-skip={status === 'not-my-path'}>
                      <span class="roadmap-tick" class:roadmap-tick-shown={status === 'checked'} aria-hidden="true"><Icon name="check" size={20} /></span>
                      <span class="roadmap-tick" class:roadmap-tick-shown={status === 'not-my-path'} aria-hidden="true"><Icon name="x" size={16} /></span>
                    </span>
                    <span class="kit-row-text">
                      <span
                        class="kit-row-title"
                        class:roadmap-done={status === 'checked'}
                        class:roadmap-skip-text={status === 'not-my-path'}
                      >
                        {@render struck(roadmapGoalTitle(goal.key))}
                      </span>
                      {#if roadmapGoalNote(goal.key)}
                        <span class="kit-row-sub">{roadmapGoalNote(goal.key)}</span>
                      {/if}
                      {#if roadmapGoalNoteSecondary(goal.key)}
                        <span class="kit-row-sub">{roadmapGoalNoteSecondary(goal.key)}</span>
                      {/if}
                    </span>
                  </button>
                  <button
                    type="button"
                    class="kit-row-act press"
                    data-open-goal={goal.key}
                    aria-label={m.roadmap_goal_open_aria({ goal: roadmapGoalTitle(goal.key) })}
                    onclick={() => openBuiltInGoal(goal.key)}
                  >
                    <Icon name="chevronRight" size={18} />
                  </button>
                </div>
              {/each}
            </div>
          {/if}
          <!-- Each row in a wrapper of its own so the disclosure belongs to
               the each block that adds and removes it (a transition inside
               a snippet is not that block's), and .rows-divide keeps the
               hairlines between them. -->
          {#each list.legalGoals as goal (goal.id)}
            <div class="rows-divide" transition:disclose>{@render customRow(goal)}</div>
          {/each}
          {@render addGoalRow(LEGAL_GROUP)}
        </ListCard>
        <p class="roadmap-sources muted small" data-roadmap-sources>
          {roadmapPackSources(pack.key)} {m.roadmap_reviewed_on({ date: reviewedLabel })}
        </p>
        <!-- After the court steps, the offices to update once the ruling is
             final (functional audit ticket 35). Inside this section rather
             than beside it, so the switch moves one block: two blocks
             collapsing at once on two curves made the second one rise into
             view and sink again, and its margin dropped the categories 20px
             in the frame it left. -->
        <Institutions
          part="list"
          onOpen={(id) => institutionsPanel?.open(id)}
          shown={polishShown}
          own={institutionQuery.rows}
          changes={institutionChangeQuery.rows}
          {hiddenGoals}
          packKey={pack.key}
        />
      </section>
    {/if}


    <!-- The person's own categories, whatever the switch says. A category
         arrives and leaves as one block, heading and card together, and a
         rename crossfades its heading in place. -->
    {#each list.categories as { category, goals } (category.id)}
      {@const left = ownStepsLeft(goals)}
      <section class="roadmap-group" data-roadmap-category={category.id} transition:disclose>
        <!-- `resize`: a rename a line longer or shorter changes the
             heading's height, and the card under it travels that height
             rather than stepping by it. The count sits on the heading's
             second line, so the pencil is the whole of the action and the
             name has the rest of the line. -->
        <div class="roadmap-heading" use:resize>
          <SectionHeading
            text={roadmapCategoryName(category)}
            crossfade
            sub={goals.length > 0 ? m.roadmap_track_steps_left({ n: left }) : ''}
          >
            {#snippet action()}
              <button
                type="button"
                class="icon-btn press roadmap-edit-category"
                data-edit-category={category.id}
                aria-label={m.roadmap_category_edit_aria({ category: roadmapCategoryName(category) })}
                onclick={() => openCategory(category)}
              >
                <Icon name="pencil" size={18} />
              </button>
            {/snippet}
          </SectionHeading>
        </div>
        <ListCard role={roleAt(activeFlag.roles, 2)}>
          {#each goals as goal (goal.id)}
            <div class="rows-divide" transition:disclose>{@render customRow(goal)}</div>
          {/each}
          {@render addGoalRow(category.id)}
        </ListCard>
      </section>
    {/each}

    <div class="roadmap-new-category">
      <ListCard>
        <button
          class="kit-row"
          data-add-category
          onclick={() => {
            addingCategory = true;
            newCategoryName = '';
          }}
        >
          <span class="roadmap-box add-icon"><Icon name="plus" size={20} /></span>
          <span class="kit-row-text"><span class="kit-row-title muted">{m.roadmap_category_new()}</span></span>
        </button>
      </ListCard>
    </div>
  </ReadReserve>
</div>

<Sheet busy={addGoalWrite.busy} open={addingTo !== null} title={m.roadmap_new_goal()} onClose={() => (addingTo = null)}>
  {#if addingTo !== null}
    <h3>{m.roadmap_new_goal()}</h3>
    <Field label={m.roadmap_new_goal()} id="newgoal-input" hidden>
      {#snippet children(id)}
        <input autocomplete={journalTextAutocomplete()}
          class="input"
          {id}
          name="newgoal-input"
          placeholder={m.roadmap_goal_placeholder()}
          bind:value={newGoalText}
        />
      {/snippet}
    </Field>
    <button class="btn btn-primary" disabled={!newGoalText.trim() || addGoalWrite.busy} onclick={addGoal}>
      <span>{m.roadmap_add_goal()}</span>
    </button>
  {/if}
</Sheet>

<Sheet busy={addCategoryWrite.busy} open={addingCategory} title={m.roadmap_category_new()} onClose={() => (addingCategory = false)}>
  {#if addingCategory}
    <h3>{m.roadmap_category_new()}</h3>
    <Field label={m.roadmap_category_name_label()} id="newcategory-input" hidden>
      {#snippet children(id)}
        <input autocomplete={journalTextAutocomplete()}
          class="input"
          {id}
          name="newcategory-input"
          placeholder={m.roadmap_category_placeholder()}
          bind:value={newCategoryName}
        />
      {/snippet}
    </Field>
    <button class="btn btn-primary" data-save-new-category disabled={!newCategoryName.trim() || addCategoryWrite.busy} onclick={addCategory}>
      <span>{m.roadmap_category_add()}</span>
    </button>
  {/if}
</Sheet>

<!-- A category's own sheet: its name, and removing it. Removing takes its
     goals with it, so the confirmation counts them. -->
<Sheet busy={categoryWrite.busy} open={selectedCategory !== null} title={selectedCategoryName} onClose={() => (selectedCategoryId = null)}>
  {#if selectedCategory}
    <h3>{selectedCategoryName}</h3>
    <div class="goal-edit">
      <Field label={m.roadmap_category_name_label()} id="category-name">
        {#snippet children(id)}
          <input autocomplete={journalTextAutocomplete()} class="input" {id} name="category-name" bind:value={categoryDraft} />
        {/snippet}
      </Field>
      <button class="btn btn-primary press" data-save-category disabled={!canSaveCategory || categoryWrite.busy} onclick={saveCategoryName}>
        <span>{m.roadmap_category_save()}</span>
      </button>
      <button class="btn btn-ghost press" data-delete-category onclick={() => (confirmingCategoryDelete = true)}>
        <Icon name="trash" size={18} />
        <span>{m.roadmap_category_delete()}</span>
      </button>
    </div>
  {/if}
</Sheet>

<ConfirmDeleteSheet
  open={confirmingCategoryDelete}
  title={m.roadmap_category_delete()}
  question={m.roadmap_category_delete_q({ category: selectedCategoryName })}
  hint={goalsInSelectedCategory > 0
    ? m.roadmap_category_delete_goals({ count: goalsInSelectedCategory })
    : m.roadmap_category_delete_hint()}
  confirmLabel={m.roadmap_category_delete()}
  cancelLabel={m.keep_it()}
  confirmAttrs={{ 'data-confirm-delete-category': '', 'data-goals': String(goalsInSelectedCategory) }}
  onConfirm={deleteCategory}
  onCancel={() => { confirmingCategoryDelete = false; removingCategory.dismiss(); }}
  busy={removingCategory.busy}
  failed={removingCategory.failed}
/>

<!-- The institution's sheet (functional audit ticket 35), outside the
     switch's block so a document's link opens it whatever the switch says. -->
<Institutions
  part="sheet"
  bind:this={institutionsPanel}
  shown={polishShown}
  own={institutionQuery.rows}
  changes={institutionChangeQuery.rows}
  {hiddenGoals}
  packKey={pack.key}
/>

<RoadmapMilestonePromptSheet
  open={promptGoal !== null}
  copy={MILESTONE_OFFER.copy}
  goalKey={promptGoal?.key ?? null}
  goalTitle={promptGoal?.title ?? ''}
  onConfirm={(data) => answerMilestoneOffer('confirm', data)}
  onDismiss={() => void answerMilestoneOffer('decline', null)}
/>

<!-- The goal sheet (ticket 56, ADR-0068): a step, not a record. It holds
     the tick, the documents filed against it, and a link out to the
     milestone it minted - and nothing a person wrote, because a built-in
     goal has nowhere to write it and a custom one's own text editing is
     ticket 69's. -->
<Sheet busy={goalWrite.busy || visibilityWrite.busy} open={selectedGoal !== null} title={selectedTitle} onClose={closeGoalSheet}>
  {#if selectedGoal}
    <!-- The sheet stays open over a rewording, so its heading crossfades to
         the new words and travels any change of height. -->
    <h3 class="roadmap-fade" use:resize>
      {#key selectedTitle}
        <span transition:fadeCount>{selectedTitle}</span>
      {/key}
    </h3>
    <div class="kit-row is-static" data-goal-sheet-status={selectedGoal.key}>
      <span
        class="roadmap-box"
        class:roadmap-ticked={selectedStatus === 'checked'}
        class:roadmap-skip={selectedStatus === 'not-my-path'}
      >
        <span class="roadmap-tick" class:roadmap-tick-shown={selectedStatus === 'checked'} aria-hidden="true"><Icon name="check" size={20} /></span>
        <span class="roadmap-tick" class:roadmap-tick-shown={selectedStatus === 'not-my-path'} aria-hidden="true"><Icon name="x" size={16} /></span>
      </span>
      <span class="kit-row-text"><span class="kit-row-title">{stateLabel(selectedStatus)}</span></span>
    </div>

    {#if selectedMilestone}
      <ListCard>
        <ListRow
          key="goal-milestone"
          icon="sparkle"
          title={selectedMilestone.name}
          subtitle={m.roadmap_goal_milestone_sub()}
          href="/transition/milestones"
        />
      </ListCard>
    {/if}

    <LinkedDocuments kind="goal" id={selectedGoal.key} />

    <!-- A custom goal is the person's own words, so it can be reworded and
         it can be removed (ADR-0068). Both sit under the documents rather
         than above them: what somebody opens this sheet for is the step and
         the paper filed against it, and a delete button at the top of a
         sheet is a delete button somebody meets before what it would
         delete. -->
    {#if selectedGoal.builtin}
      <div class="goal-edit">
        <p class="small">{selectedHidden ? m.roadmap_goal_hidden_hint() : m.roadmap_goal_hide_hint()}</p>
        <button class="btn btn-ghost press" data-goal-visibility={selectedGoal.key} data-hidden={selectedHidden} disabled={visibilityWrite.busy} onclick={toggleGoalVisibility}>
          <span>{selectedHidden ? m.roadmap_goal_restore() : m.roadmap_goal_hide()}</span>
        </button>
      </div>
    {:else}
      <div class="goal-edit">
        <Field label={m.roadmap_goal_text_label()} id="goal-text">
          {#snippet children(id)}
            <!-- No placeholder: this field opens holding the goal's own
                 text, so one would only ever restate the label above it. -->
            <input autocomplete={journalTextAutocomplete()} class="input" {id} name="goal-text" bind:value={goalDraft} />
          {/snippet}
        </Field>
        <button class="btn btn-primary press" data-save-goal disabled={!canSaveGoal || goalWrite.busy} onclick={saveGoalText}>
          <span>{m.roadmap_goal_save()}</span>
        </button>
        <!-- Disabled until the documents read lands: a confirmation that
             cannot yet count what it is about to unfile would understate the
             delete, and `rows` is empty while a read is still in flight. -->
        <button
          class="btn btn-ghost press"
          data-delete-goal
          disabled={goalDocuments.loading}
          onclick={() => (confirmingDelete = true)}
        >
          <Icon name="trash" size={18} />
          <span>{m.roadmap_goal_delete()}</span>
        </button>
      </div>
    {/if}
  {/if}
</Sheet>

<Sheet open={hiddenGoalsOpen} title={m.roadmap_hidden_goals()} onClose={() => (hiddenGoalsOpen = false)}>
  <h3>{m.roadmap_hidden_goals()}</h3>
  <p class="small">{m.roadmap_hidden_goals_hint()}</p>
  <ListCard>
    {#each hiddenBuiltIns as goal (goal.key)}
      <ListRow
        key={goal.key}
        data-hidden-goal={goal.key}
        title={roadmapGoalTitle(goal.key)}
        subtitle={stateLabel(statuses[goal.key] ?? 'unchecked')}
        onclick={() => { hiddenGoalsOpen = false; openBuiltInGoal(goal.key); }}
      />
    {/each}
    {#each hiddenInstitutions as one (one.key)}
      <ListRow
        key={one.key}
        data-hidden-goal={one.key}
        title={roadmapInstitutionName(one.key)}
        onclick={() => { hiddenGoalsOpen = false; institutionsPanel?.open(one.key); }}
      />
    {/each}
  </ListCard>
</Sheet>

<!-- Outside the goal sheet rather than inside it: two sheets nested in the
     markup would draw the confirmation inside the sheet it is confirming
     about, and this one is the same component every other delete on the app
     confirms through. -->
<ConfirmDeleteSheet
  open={confirmingDelete}
  title={m.roadmap_goal_delete_sheet()}
  question={m.roadmap_goal_delete_q({ goal: selectedTitle })}
  hint={unfiledByDelete > 0
    ? m.roadmap_goal_delete_documents({ count: unfiledByDelete })
    : m.roadmap_goal_delete_hint()}
  confirmLabel={m.roadmap_goal_delete()}
  cancelLabel={m.keep_it()}
  confirmAttrs={{ 'data-confirm-delete-goal': '', 'data-unfiles': String(unfiledByDelete) }}
  onConfirm={deleteGoal}
  onCancel={() => { confirmingDelete = false; removing.dismiss(); }}
  busy={removing.busy}
  failed={removing.failed}
/>

<style>
  /* The sheet's own controls, set apart from the documents above them by
     the same rhythm the rest of the sheet uses rather than by a rule. */
  .goal-edit {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    margin-top: var(--space-5);
  }

  .roadmap-provenance {
    margin: var(--space-3) 0 var(--space-5);
  }

  .roadmap-provenance p {
    margin: 0 0 var(--space-2);
  }

  .roadmap-sources {
    margin: var(--space-3) 0 0;
  }

  /* The heading's first-child 16px would collapse through this wrapper and
     then through the section, two boxes deep, which `disclose` cannot see:
     the heading dropped 16px in the first frame of a removal and rose 16px
     in the last frame of an arrival. The block above already owns the 20
     the collapse would have come to, so the heading takes none of its own
     here and nothing is left to collapse. */
  .roadmap-heading > :global(.kit-heading) {
    margin: 0;
  }

  /* The 12 under the heading, as this box's own padding rather than the
     heading's margin: `resize` holds the box at a set height while it
     travels, and a set height stops a last child's bottom margin
     collapsing through it, so the card under a renamed heading stepped
     12px down in the frame the travel let go. */
  .roadmap-heading {
    padding-bottom: var(--space-3);
  }

  /* The pencil's 48px target, pulled up so its glyph centres on the
     heading's first line rather than below it: the heading row is
     top-aligned (SectionHeading's `crossfade`). */
  .roadmap-edit-category {
    margin-block: -8px;
  }

  .roadmap-new-category {
    margin-top: var(--space-6);
  }

  /* An empty square until it is ticked, so a row reads as a checkbox
     rather than as a link into somewhere. The border and the colour cross
     on --dur-fast (ux-carpet ticket 236, matching appointment-prep's
     .ap-box): the square is not the control - the row is - so what answers
     the tap is the tick landing rather than a press depth, and a colour
     change is the feedback reduced motion keeps. */
  .roadmap-box {
    position: relative;
    border: 2px solid var(--outline);
    border-radius: var(--r-block);
    width: 28px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex: 0 0 auto;
    transition:
      border-color var(--dur-fast) var(--ease-out),
      color var(--dur-fast) var(--ease-out);
  }

  .roadmap-ticked {
    border-color: var(--role-mark);
    color: var(--role-mark);
  }

  /* A third, visually distinct fill from both the empty square (untaken)
     and the accent-filled one (checked): a not-my-path goal must not read
     as either. */
  .roadmap-skip {
    border-color: var(--text-2);
    color: var(--text-2);
  }

  /* Both glyphs sit stacked on the box's centre (position: absolute, the
     box itself is the positioning parent) and cross on opacity and a
     scale from that centre - transform and opacity, the two properties
     the performance contract admits without a named material. Which one
     is shown is `.roadmap-tick-shown`, not mounting/unmounting the icon:
     see the markup comment above. */
  .roadmap-tick {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0;
    transform: scale(0.4);
    transition:
      opacity var(--dur-fast) var(--ease-out),
      transform var(--dur-fast) var(--ease-out);
  }

  .roadmap-tick-shown {
    opacity: 1;
    transform: scale(1);
  }

  .add-icon {
    border-style: dashed;
    color: var(--text-2);
  }

  /* Struck through rather than hidden or moved: the list is the procedure,
     and a done step still says what the next one follows from. The line
     itself is drawn rather than declared (ux-carpet ticket 236): a native
     text-decoration has no "from" state a transition can start from, so it
     cut into place with the box's own fill.

     Drawn as an inline background, not a pseudo-element over a block:
     `box-decoration-break: clone` gives every line of a wrapped title its
     own copy of the background, so each line is struck through its own
     middle. The old ::after was one line across the whole inline-block,
     and on a stock title that wraps at 390px ("How you are addressed at
     work or school") it sat in the gap between the two lines and read as
     an underline (after-release 28, audit V08).

     The background sits on a transparent copy of the words laid over them
     (the `struck` snippet), and the copy is clipped from the left: the
     strike draws in by clip-path over the same --dur-fast the box's fill
     uses, and the motion stays within transform, opacity and clip. The
     line is --text-2, the done title's own ink; currentColor would be the
     copy's transparent. */
  .roadmap-done {
    color: var(--text-2);
  }

  .roadmap-strike-text {
    position: relative;
    display: block;
  }

  .roadmap-strike-lines {
    position: absolute;
    inset: 0;
    color: transparent;
    pointer-events: none;
    clip-path: inset(0 100% 0 0);
    transition: clip-path var(--dur-fast) var(--ease-out);
  }

  .roadmap-strike-lines > span {
    background-image: linear-gradient(var(--text-2), var(--text-2));
    background-repeat: no-repeat;
    background-position: 0 55%;
    background-size: 100% 2px;
    -webkit-box-decoration-break: clone;
    box-decoration-break: clone;
  }

  .roadmap-done .roadmap-strike-lines {
    clip-path: inset(0 0% 0 0);
  }

  /* Muted, not struck through: unlike a done step, a not-my-path one was
     never worked toward, so it should not read as finished. */
  .roadmap-skip-text {
    color: var(--text-2);
    font-style: italic;
  }

  /* The count on the heading: a plain number of steps still unchecked,
     in the secondary ink. Both old and new counts share one grid cell so
     the swap crossfades in place rather than pushing the heading. */
  .roadmap-steps {
    margin-left: auto;
    display: grid;
    color: var(--text-2);
    font-size: var(--text-sm);
    white-space: nowrap;
  }

  .roadmap-steps > span,
  .roadmap-fade > span {
    grid-area: 1 / 1;
  }

  /* A goal's words and the sheet's heading, old and new in one cell while
     a rewording crossfades. */
  .roadmap-fade {
    display: grid;
  }
</style>
