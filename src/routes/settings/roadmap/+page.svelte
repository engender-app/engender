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
     together, and a ListRow announces a title and goes somewhere. */
  import { m } from '$lib/paraglide/messages';
  import { journal, liveList, liveQuery } from '$lib/data/live/journal.svelte';
  import { fmtDay } from '$lib/data/dates';
  import { epochDayFromLocalDate } from '$lib/data/epochDay';
  import { POLISH_PACK, ROADMAP_TRACKS, goalsInTrack, type RoadmapGoalKey, type RoadmapTrack } from '$lib/data/roadmap';
  import { rankByLean } from '$lib/data/lean';
  import { vocabulary } from '$lib/data/vocabulary/vocabulary';
  import type { RoadmapGoalStatus } from '$lib/data/types';
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
    openOffer,
    type OfferAnswer,
    type RoadmapGoalMilestone
  } from '$lib/data/offers';
  import Icon from '$lib/components/Icon.svelte';
  import ScreenHeader from '$lib/components/ScreenHeader.svelte';
  import Sheet from '$lib/components/Sheet.svelte';
  import Skeleton from '$lib/components/Skeleton.svelte';
  import Field from '$lib/components/kit/Field.svelte';
  import ListCard from '$lib/components/kit/ListCard.svelte';
  import Notice from '$lib/components/kit/Notice.svelte';
  import SectionHeading from '$lib/components/kit/SectionHeading.svelte';
  import { crossfade } from '$lib/motion/reveal';
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
     handed no id. `openOffer` refuses once the goal has its milestone,
     which is the check the surgery hub already made through
     `linkedMilestone`. */
  const offerMilestone = (key: string, title: string) => {
    if (!prefs.roadmapMilestoneSyncEnabled) return;
    const already = vocabulary.milestones.find((milestone) => milestone.roadmapGoalKey === key);
    promptGoal = openOffer({ key, title }, already?.id ?? null);
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

  async function answerMilestoneOffer(given: OfferAnswer, data: RoadmapGoalMilestone | null) {
    await answerOffer(MILESTONE_OFFER, promptGoal && data ? data : null, given, journal);
    promptGoal = null;
  }

  function stateLabel(status: RoadmapGoalStatus): string {
    if (status === 'checked') return m.roadmap_state_checked();
    if (status === 'not-my-path') return m.roadmap_state_not_my_path();
    return m.roadmap_state_unchecked();
  }

  let addTrack = $state<RoadmapTrack | null>(null);
  let newGoalText = $state('');
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

  {#if statusQuery.loading || customQuery.loading}
    <div out:crossfade><Skeleton variant="line" count={4} /></div>
  {:else}
    {#each ROADMAP_TRACKS as track, i (track)}
      <SectionHeading text={roadmapTrackName(track)} />
      <ListCard role={roleAt(activeFlag.roles, i)}>
        <!-- Every row below is hand-rolled rather than ListRow (ticket 16):
             .roadmap-box is a three-state control (checked/not-my-path/
             unchecked, two different glyphs), which ListRow's binary
             `checked` has no room for, and the done/skip title styling
             needs a class ListRow's plain `title` string can't carry. -->
        {#each rankByLean(goalsInTrack(pack, track), lean) as goal (goal.key)}
          {@const status = statuses[goal.key] ?? 'unchecked'}
          <button
            class="kit-row"
            data-goal={goal.key}
            data-status={status}
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
        {/each}
        {#each customGoals.filter((g) => g.track === track) as goal (goal.id)}
          <button
            class="kit-row"
            data-goal={goal.id}
            data-status={goal.status}
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

<style>
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
</style>
