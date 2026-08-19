<script lang="ts">
  import { m } from '$lib/paraglide/messages';
  import { journal, liveQuery } from '$lib/data/live/journal.svelte';
  import { fmtDay } from '$lib/data/dates';
  import { epochDayFromLocalDate } from '$lib/data/epochDay';
  import { POLISH_PACK, ROADMAP_TRACKS, goalsInTrack, type RoadmapTrack } from '$lib/data/roadmap';
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
  import Icon from '$lib/components/Icon.svelte';
  import Sheet from '$lib/components/Sheet.svelte';
  import SectionTitle from '$lib/components/SectionTitle.svelte';
  import Skeleton from '$lib/components/Skeleton.svelte';

  /* One bundled pack, so no picker: the phase 4 scope decision ships
     Polish only. A second pack would turn this into a choice, and nothing
     below assumes there is one. */
  const pack = POLISH_PACK;

  let statusQuery = liveQuery(['roadmapCheck'], (j) => j.roadmap.getGoalStatuses(pack.key));
  let statuses = $derived(statusQuery.value ?? {});

  let customQuery = liveQuery(['roadmapGoal'], (j) => j.roadmap.getCustomGoals());
  let customGoals = $derived(customQuery.value ?? []);

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

  const toggleBuiltIn = (goalKey: string) =>
    journal.roadmap.setGoalStatus(pack.key, goalKey, nextStatus(statuses[goalKey] ?? 'unchecked'));

  const toggleCustom = (goal: { id: string; status: RoadmapGoalStatus }) =>
    journal.roadmap.setCustomGoalStatus(goal.id, nextStatus(goal.status));

  function stateLabel(status: RoadmapGoalStatus): string {
    if (status === 'checked') return m.roadmap_state_checked();
    if (status === 'not-my-path') return m.roadmap_state_not_my_path();
    return m.roadmap_state_unchecked();
  }

  let addTrack = $state<RoadmapTrack | null>(null);
  let newGoalText = $state('');
</script>

<div class="screen">
  <header class="screen-header">
    <a class="icon-btn" href="/settings" aria-label={m.back()}><Icon name="arrowLeft" /></a>
    <h1 class="screen-title">{m.roadmap_title()}</h1>
  </header>

  <p class="muted small">{m.roadmap_intro()}</p>
  <div class="card" style="margin:var(--space-3) 0">
    <p class="quicklog-title">{roadmapPackName(pack.key)}</p>
    <p class="small" style="margin:0">{roadmapPackCaveat(pack.key)}</p>
    <p class="small" style="margin:var(--space-2) 0 0">{roadmapPackMarkerNote(pack.key)}</p>
    <p class="small" style="margin:var(--space-2) 0 0">{m.roadmap_not_advice()}</p>
    <p class="muted small" style="margin:var(--space-2) 0 0">
      {roadmapPackSources(pack.key)} {m.roadmap_reviewed_on({ date: reviewedLabel })}
    </p>
  </div>

  {#if statusQuery.loading || customQuery.loading}
    <Skeleton variant="card" count={4} />
  {:else}
    {#each ROADMAP_TRACKS as track (track)}
      <SectionTitle text={roadmapTrackName(track)} />
      <div class="list-group">
        {#each goalsInTrack(pack, track) as goal (goal.key)}
          {@const status = statuses[goal.key] ?? 'unchecked'}
          <button
            class="list-row"
            data-goal={goal.key}
            data-status={status}
            aria-label={`${roadmapGoalTitle(goal.key)} — ${stateLabel(status)}`}
            onclick={() => toggleBuiltIn(goal.key)}
          >
            <span class="row-icon" class:roadmap-ticked={status === 'checked'} class:roadmap-skip={status === 'not-my-path'}>
              {#if status === 'checked'}
                <Icon name="check" size={20} />
              {:else if status === 'not-my-path'}
                <Icon name="x" size={16} />
              {/if}
            </span>
            <span class="row-text">
              <span
                class="row-title"
                class:roadmap-done={status === 'checked'}
                class:roadmap-skip-text={status === 'not-my-path'}
              >
                {roadmapGoalTitle(goal.key)}
              </span>
              {#if roadmapGoalNote(goal.key)}
                <span class="row-subtitle">{roadmapGoalNote(goal.key)}</span>
              {/if}
              {#if roadmapGoalNoteSecondary(goal.key)}
                <span class="row-subtitle">{roadmapGoalNoteSecondary(goal.key)}</span>
              {/if}
            </span>
          </button>
        {/each}
        {#each customGoals.filter((g) => g.track === track) as goal (goal.id)}
          <button
            class="list-row"
            data-goal={goal.id}
            data-status={goal.status}
            aria-label={`${goal.text} — ${stateLabel(goal.status)}`}
            onclick={() => toggleCustom(goal)}
          >
            <span
              class="row-icon"
              class:roadmap-ticked={goal.status === 'checked'}
              class:roadmap-skip={goal.status === 'not-my-path'}
            >
              {#if goal.status === 'checked'}
                <Icon name="check" size={20} />
              {:else if goal.status === 'not-my-path'}
                <Icon name="x" size={16} />
              {/if}
            </span>
            <span class="row-text">
              <span
                class="row-title"
                class:roadmap-done={goal.status === 'checked'}
                class:roadmap-skip-text={goal.status === 'not-my-path'}
              >
                {goal.text}
              </span>
            </span>
          </button>
        {/each}
        <button
          class="list-row"
          data-add-goal={track}
          onclick={() => {
            addTrack = track;
            newGoalText = '';
          }}
        >
          <span class="row-icon add-icon"><Icon name="plus" size={20} /></span>
          <span class="row-text"><span class="row-title muted">{m.roadmap_new_goal()}</span></span>
        </button>
      </div>
    {/each}
  {/if}
</div>

<Sheet open={addTrack !== null} title={m.roadmap_new_goal()} onClose={() => (addTrack = null)}>
  {#if addTrack}
    <h3>{m.roadmap_new_goal()}</h3>
    <div class="field">
      <input
        class="input"
        id="newgoal-input"
        name="newgoal-input"
        placeholder={m.roadmap_goal_placeholder()}
        bind:value={newGoalText}
      />
    </div>
    <button
      class="btn btn-primary"
      onclick={() => {
        if (newGoalText.trim()) journal.roadmap.addCustomGoal(addTrack!, newGoalText.trim());
        addTrack = null;
      }}><span>{m.roadmap_add_goal()}</span></button
    >
  {/if}
</Sheet>

<style>
  /* An empty square until it is ticked, so a row reads as a checkbox
     rather than as a link into somewhere. */
  .row-icon {
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
    border-color: var(--accent);
    color: var(--accent);
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
