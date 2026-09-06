<script lang="ts">
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
     tick ever could. */
  import { page } from '$app/state';
  import { m } from '$lib/paraglide/messages';
  import { journal, liveList, liveQuery } from '$lib/data/live/journal.svelte';
  import { fmtDay } from '$lib/data/dates';
  import { epochDayFromLocalDate } from '$lib/data/epochDay';
  import { POLISH_PACK, roadmapSections, type RoadmapGoalKey, type RoadmapTrack } from '$lib/data/roadmap';
  import { rankByLean } from '$lib/data/lean';
  import { vocabulary } from '$lib/data/vocabulary/vocabulary';
  import type { RoadmapGoalStatus } from '$lib/data/types';
  import LinkedDocuments from '$lib/components/LinkedDocuments.svelte';
  import {
    roadmapGoalNote,
    roadmapGoalNoteSecondary,
    roadmapGoalTitle,
    roadmapPackCaveat,
    roadmapPackMarkerNote,
    roadmapPackName,
    roadmapPackSources,
    roadmapTrackName
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
  import Sheet from '$lib/components/Sheet.svelte';
  import Skeleton from '$lib/components/Skeleton.svelte';
  import ConfirmDeleteSheet from '$lib/components/kit/ConfirmDeleteSheet.svelte';
  import Field from '$lib/components/kit/Field.svelte';
  import ListCard from '$lib/components/kit/ListCard.svelte';
  import ListRow from '$lib/components/kit/ListRow.svelte';
  import Notice from '$lib/components/kit/Notice.svelte';
  import SectionHeading from '$lib/components/kit/SectionHeading.svelte';
  import { crossfade, disclose } from '$lib/motion/reveal';
  import { activeFlag } from '$lib/theme/activeFlag.svelte';
  import { roleAt } from '$lib/theme/roles';

  /* One bundled pack, so no picker: the phase 4 scope decision ships
     Polish only. A second pack would turn this into a choice, and nothing
     below assumes there is one. */
  const pack = POLISH_PACK;

  let statusQuery = liveQuery((j) => j.roadmap.getGoalStatuses(pack.key));
  let statuses = $derived(statusQuery.value ?? {});

  let customQuery = liveList((j) => j.roadmap.getCustomGoals());
  let customGoals = $derived(customQuery.rows);

  /* "Not my path" one grain out (phase 8 features ticket 49 item 5). Which
     tracks are folded is stored, and which goals that leaves is
     roadmap.ts's `roadmapSections` - so the list of tracks this screen
     draws comes from ROADMAP_TRACKS through that function rather than from
     an {#each} over the constant here, and a fifth track cannot arrive
     un-foldable. */
  let dismissedQuery = liveQuery((j) => j.roadmap.getDismissedTracks());
  let dismissedTracks = $derived(dismissedQuery.value ?? []);
  let sections = $derived(roadmapSections(pack, customGoals, dismissedTracks));

  /* CONTEXT: "Lean" (phase 5 ticket 43, ADR-0030) - the active preset
     reorders each track's built-in goals, matching ones first. Custom
     goals carry no lean and are unaffected. */
  let lean = $derived(vocabulary.activeLean);

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
    journal.roadmap.setGoalStatus(pack.key, goalKey, next);
    if (current === 'unchecked' && next === 'checked') offerMilestone(goalKey, roadmapGoalTitle(goalKey));
  };

  const toggleCustom = (goal: { id: string; status: RoadmapGoalStatus; text: string }) => {
    const current = goal.status;
    const next = nextStatus(current);
    journal.roadmap.setCustomGoalStatus(goal.id, next);
    if (current === 'unchecked' && next === 'checked') offerMilestone(goal.id, goal.text);
  };

  /* Closed before the write, not after: the sheet is gone by the time the
     insert runs, so a second tap finds no open offer to confirm. */
  async function answerMilestoneOffer(given: OfferAnswer, data: RoadmapGoalMilestone | null) {
    const subject = promptGoal === null ? null : data;
    promptGoal = null;
    await answerOffer(MILESTONE_OFFER, subject, given, journal);
  }

  function stateLabel(status: RoadmapGoalStatus): string {
    if (status === 'checked') return m.roadmap_state_checked();
    if (status === 'not-my-path') return m.roadmap_state_not_my_path();
    return m.roadmap_state_unchecked();
  }

  let addTrack = $state<RoadmapTrack | null>(null);
  let newGoalText = $state('');

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

  const saveGoalText = () => {
    if (!canSaveGoal) return;
    journal.roadmap.updateCustomGoalText(selectedGoal!.key, goalRewording);
  };

  /* The sheet closes before the write, the same order `answerMilestoneOffer`
     above uses: the row is gone from the list underneath a moment later, and
     a sheet still open over a goal that no longer exists has nothing to read
     its tick from. */
  const deleteGoal = () => {
    if (!selectedGoal) return;
    const id = selectedGoal.key;
    confirmingDelete = false;
    closeGoalSheet();
    journal.roadmap.deleteCustomGoal(id);
  };

  /* A document's own screen links here as `?goal=<key>`, since a goal has
     no route of its own to link to more precisely (ADR-0068). `dismissedKey`
     stops a closed sheet reopening itself: without it, closing the sheet
     while the query param is still in the URL would fire this effect again
     on the next unrelated reactive change and pop it straight back. */
  let dismissedKey = $state<string | null>(null);
  $effect(() => {
    const key = page.url.searchParams.get('goal');
    if (!key || key === dismissedKey) return;
    const builtinGoal = pack.goals.find((goal) => goal.key === key);
    if (builtinGoal) {
      openBuiltInGoal(builtinGoal.key);
      return;
    }
    if (customQuery.loading) return;
    const custom = customGoals.find((goal) => goal.id === key);
    if (custom) openCustomGoal(custom);
  });

  function closeGoalSheet() {
    if (selectedGoal) dismissedKey = selectedGoal.key;
    selectedGoal = null;
  }
</script>

<div class="screen">
  <ScreenHeader title={m.roadmap_title()} back="/more" subtitle={m.roadmap_intro()} />

  <Notice
    icon="globe"
    key="roadmap-pack"
    title={roadmapPackName(pack.key)}
    text={roadmapPackCaveat(pack.key)}
  />
  <div class="roadmap-provenance">
    <p class="small">{roadmapPackMarkerNote(pack.key)}</p>
    <p class="small">{m.roadmap_not_advice()}</p>
    <p class="muted small">{roadmapPackSources(pack.key)} {m.roadmap_reviewed_on({ date: reviewedLabel })}</p>
  </div>

  {#if statusQuery.loading || customQuery.loading || dismissedQuery.loading}
    <div out:crossfade><Skeleton variant="line" count={4} /></div>
  {:else}
    {#each sections as section, i (section.track)}
      {@const track = section.track}
      <SectionHeading text={roadmapTrackName(track)}>
        <!-- On the heading rather than in the card: it is a statement about
             the whole track, and a row inside the list would read as one
             more step to take. -->
        {#snippet action()}
          <!-- No `aria-pressed`. The label itself changes, so a toggle state
               on top of it announces the same fact twice ("Put it back,
               pressed"); a toggle button earns aria-pressed when its label
               holds still, and this one does not. `data-dismissed` carries
               the state for the stylesheet and the tests instead. -->
          <button
            class="roadmap-track-btn"
            data-track-toggle={track}
            data-dismissed={section.dismissed}
            onclick={() => journal.roadmap.setTrackDismissed(track, !section.dismissed)}
          >
            {section.dismissed ? m.roadmap_track_restore() : m.roadmap_track_dismiss()}
          </button>
        {/snippet}
      </SectionHeading>
      {#if section.dismissed}
        <!-- No card, which is most of what "put away" means here: a folded
             track costs its heading, one line and nothing else, where the
             card it replaces was taller than the two goals it hid. The
             heading stays, so putting it back is where putting it away was,
             and the stored statuses wait untouched underneath. -->
        <p class="roadmap-track-note" data-track-dismissed={track} in:disclose>{m.roadmap_track_dismissed()}</p>
      {:else}
      <ListCard role={roleAt(activeFlag.roles, i)}>
        <!-- Every row below is hand-rolled rather than ListRow (ticket 16):
             .roadmap-box is a three-state control (checked/not-my-path/
             unchecked, two different glyphs), which ListRow's binary
             `checked` has no room for, and the done/skip title styling
             needs a class ListRow's plain `title` string can't carry.

             The split shape (ticket 56, ADR-0068) is still ListRow's own,
             borrowed for its classes rather than the component: the tap
             that cycles the tick is `.kit-row-main`, and `.kit-row-act`
             opens the goal's own sheet, on every row whether ticked or
             not - the "keep opinions" goal is exactly the case where paper
             arrives before a tick ever could. The glyph on it is a chevron
             rather than the paper one: the sheet holds the tick, the
             milestone and the documents, and an icon naming one of the
             three reads as though it were all of it. -->
        {#each rankByLean(section.goals, lean) as goal (goal.key)}
          {@const status = statuses[goal.key] ?? 'unchecked'}
          <div class="kit-row is-split" data-goal={goal.key} data-status={status}>
            <button
              type="button"
              class="kit-row-main"
              aria-label={`${roadmapGoalTitle(goal.key)} — ${stateLabel(status)}`}
              onclick={() => toggleBuiltIn(goal.key)}
            >
              <span class="roadmap-box" class:roadmap-ticked={status === 'checked'} class:roadmap-skip={status === 'not-my-path'}>
                {#if status === 'checked'}
                  <Icon name="check" size={20} />
                {:else if status === 'not-my-path'}
                  <Icon name="x" size={16} />
                {/if}
              </span>
              <span class="kit-row-text">
                <span
                  class="kit-row-title"
                  class:roadmap-done={status === 'checked'}
                  class:roadmap-skip-text={status === 'not-my-path'}
                >
                  {roadmapGoalTitle(goal.key)}
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
        {#each section.customGoals as goal (goal.id)}
          <div class="kit-row is-split" data-goal={goal.id} data-status={goal.status}>
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
                {#if goal.status === 'checked'}
                  <Icon name="check" size={20} />
                {:else if goal.status === 'not-my-path'}
                  <Icon name="x" size={16} />
                {/if}
              </span>
              <span class="kit-row-text">
                <span
                  class="kit-row-title"
                  class:roadmap-done={goal.status === 'checked'}
                  class:roadmap-skip-text={goal.status === 'not-my-path'}
                >
                  {goal.text}
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
        {/each}
        <button
          class="kit-row"
          data-add-goal={track}
          onclick={() => {
            addTrack = track;
            newGoalText = '';
          }}
        >
          <span class="roadmap-box add-icon"><Icon name="plus" size={20} /></span>
          <span class="kit-row-text"><span class="kit-row-title muted">{m.roadmap_new_goal()}</span></span>
        </button>
      </ListCard>
      {/if}
    {/each}
  {/if}
</div>

<Sheet open={addTrack !== null} title={m.roadmap_new_goal()} onClose={() => (addTrack = null)}>
  {#if addTrack}
    <h3>{m.roadmap_new_goal()}</h3>
    <Field label={m.roadmap_new_goal()} id="newgoal-input" hidden>
      {#snippet children(id)}
        <input
          class="input"
          {id}
          name="newgoal-input"
          placeholder={m.roadmap_goal_placeholder()}
          bind:value={newGoalText}
        />
      {/snippet}
    </Field>
    <button
      class="btn btn-primary"
      onclick={() => {
        if (newGoalText.trim()) journal.roadmap.addCustomGoal(addTrack!, newGoalText.trim());
        addTrack = null;
      }}><span>{m.roadmap_add_goal()}</span></button
    >
  {/if}
</Sheet>

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
<Sheet open={selectedGoal !== null} title={selectedTitle} onClose={closeGoalSheet}>
  {#if selectedGoal}
    <h3>{selectedTitle}</h3>
    <div class="kit-row is-static" data-goal-sheet-status={selectedGoal.key}>
      <span
        class="roadmap-box"
        class:roadmap-ticked={selectedStatus === 'checked'}
        class:roadmap-skip={selectedStatus === 'not-my-path'}
      >
        {#if selectedStatus === 'checked'}
          <Icon name="check" size={20} />
        {:else if selectedStatus === 'not-my-path'}
          <Icon name="x" size={16} />
        {/if}
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
    {#if !selectedGoal.builtin}
      <div class="goal-edit">
        <Field label={m.roadmap_goal_text_label()} id="goal-text">
          {#snippet children(id)}
            <!-- No placeholder: this field opens holding the goal's own
                 text, so one would only ever restate the label above it. -->
            <input class="input" {id} name="goal-text" bind:value={goalDraft} />
          {/snippet}
        </Field>
        <button class="btn btn-primary press" data-save-goal disabled={!canSaveGoal} onclick={saveGoalText}>
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
  onCancel={() => (confirmingDelete = false)}
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

  /* An empty square until it is ticked, so a row reads as a checkbox
     rather than as a link into somewhere. */
  .roadmap-box {
    border: 2px solid var(--border);
    border-radius: var(--radius-sm);
    width: 28px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex: 0 0 auto;
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

  .add-icon {
    border-style: dashed;
    color: var(--text-2);
  }

  /* Struck through rather than hidden or moved: the list is the procedure,
     and a done step still says what the next one follows from. */
  .roadmap-done {
    text-decoration: line-through;
    color: var(--text-2);
  }

  /* Muted, not struck through: unlike a done step, a not-my-path one was
     never worked toward, so it should not read as finished. */
  .roadmap-skip-text {
    color: var(--text-2);
    font-style: italic;
  }

  /* The whole of a folded track: one line on the page's own ground, no
     card. Italic and muted for the same reason .roadmap-skip-text is - it
     is the same statement one grain out - and short, because it repeats
     under every track that has been put away. */
  .roadmap-track-note {
    margin: 0 0 var(--space-5);
    color: var(--text-2);
    font-style: italic;
    font-size: var(--text-sm);
  }

  /* Quiet enough to lose an argument with the goals underneath it. A track
     is somebody's path until the person says otherwise, and as a filled
     accent chip beside a display heading this read as the thing to do next
     - the loudest control on a screen whose whole content is the steps it
     is offering to hide. Text on the page's own ground instead, in the
     secondary ink a skipped goal already uses.

     The height is the touch floor, not the words: the label is one small
     line and would otherwise come out around 20px tall (PRODUCT.md's
     Android 48dp floor). Negative inline margin so the words still align
     with the screen edge the heading starts from, while the target it
     carries is wider than them. */
  .roadmap-track-btn {
    border: 0;
    background: none;
    cursor: pointer;
    color: var(--text-2);
    font: inherit;
    font-size: var(--text-sm);
    font-weight: var(--weight-bold);
    min-height: var(--touch-target);
    padding: 0 var(--space-2);
    margin-right: calc(var(--space-2) * -1);
    border-radius: var(--radius-sm);
  }

  /* Put back is the way out of a state rather than a second action, so it
     steps up one level of ink and no further. Not the accent: the heading
     sits outside the ListCard that carries `--role-mark`, so a role colour
     would not resolve here, and reaching for `--accent` instead puts a flag
     stripe's own colour beside a display heading for no reason. */
  .roadmap-track-btn[data-dismissed='true'] {
    color: var(--text-1);
  }
</style>
