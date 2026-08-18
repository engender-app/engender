<script lang="ts">
  import { m } from '$lib/paraglide/messages';
  import { journal, liveQuery } from '$lib/data/live/journal.svelte';
  import { fmtDay } from '$lib/data/dates';
  import { epochDayFromDateInputValue } from '$lib/data/epochDay';
  import { POLISH_PACK, ROADMAP_TRACKS, goalsInTrack } from '$lib/data/roadmap';
  import { roadmapGoalNote, roadmapGoalTitle, roadmapPackName, roadmapTrackName } from '$lib/data/vocabulary/roadmapLabels';
  import Icon from '$lib/components/Icon.svelte';
  import SectionTitle from '$lib/components/SectionTitle.svelte';
  import Skeleton from '$lib/components/Skeleton.svelte';

  /* One bundled pack, so no picker: the phase 4 scope decision ships
     Polish only. A second pack would turn this into a choice, and nothing
     below assumes there is one. */
  const pack = POLISH_PACK;

  let checkedQuery = liveQuery(['roadmapCheck'], (j) => j.roadmap.getCheckedGoals(pack.key));
  let checked = $derived(new Set(checkedQuery.value ?? []));

  const reviewedOn = epochDayFromDateInputValue(pack.reviewedOn);
  const reviewedLabel =
    reviewedOn == null ? pack.reviewedOn : fmtDay(reviewedOn, { day: 'numeric', month: 'long', year: 'numeric' });

  const toggle = (goalKey: string) => journal.roadmap.setGoalChecked(pack.key, goalKey, !checked.has(goalKey));
</script>

<div class="screen">
  <header class="screen-header">
    <a class="icon-btn" href="/settings" aria-label={m.back()}><Icon name="arrowLeft" /></a>
    <h1 class="screen-title">{m.roadmap_title()}</h1>
  </header>

  <p class="muted small">{m.roadmap_intro({ country: roadmapPackName(pack.key) })}</p>
  <div class="card" style="margin:var(--space-3) 0">
    <p class="small" style="margin:0">{m.roadmap_not_advice()}</p>
    <p class="muted small" style="margin:var(--space-2) 0 0">{m.roadmap_reviewed_on({ date: reviewedLabel })}</p>
  </div>

  {#if checkedQuery.loading}
    <Skeleton variant="card" count={4} />
  {:else}
    {#each ROADMAP_TRACKS as track (track)}
      <SectionTitle text={roadmapTrackName(track)} />
      <div class="list-group">
        {#each goalsInTrack(pack, track) as goal (goal.key)}
          {@const isChecked = checked.has(goal.key)}
          <button
            class="list-row"
            role="checkbox"
            aria-checked={isChecked}
            onclick={() => toggle(goal.key)}
          >
            <span class="row-icon" class:roadmap-ticked={isChecked}>
              {#if isChecked}<Icon name="check" size={20} />{/if}
            </span>
            <span class="row-text">
              <span class="row-title" class:roadmap-done={isChecked}>{roadmapGoalTitle(goal.key)}</span>
              {#if roadmapGoalNote(goal.key)}
                <span class="row-subtitle">{roadmapGoalNote(goal.key)}</span>
              {/if}
            </span>
          </button>
        {/each}
      </div>
    {/each}
  {/if}
</div>

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

  /* Struck through rather than hidden or moved: the list is the procedure,
     and a done step still says what the next one follows from. */
  .roadmap-done {
    text-decoration: line-through;
    color: var(--text-2);
  }
</style>
