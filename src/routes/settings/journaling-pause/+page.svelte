<script lang="ts">
  /* The journaling pause (phase 5 ticket 21, CONTEXT: "Streak" - amended).
     A pause is journal-wide, not per-episode, so it gets its own settings
     screen rather than living beside a regimen episode the way Dose pause
     does - there is no episode to attach it to. Ending a running pause is
     an explicit "resume" action (upsertPause with today as the end day),
     distinct from deleting the row outright, which erases that the pause
     ever happened rather than closing it out. */
  import { m } from '$lib/paraglide/messages';
  import { journal, liveQuery } from '$lib/data/live/journal.svelte';
  import { fmtDay } from '$lib/data/dates';
  import { todayEpochDay, epochDayFromDateInputValue, dateInputValueFromEpochDay } from '$lib/data/epochDay';
  import { pauseCoversDay } from '$lib/data/journalingPause';
  import Icon from '$lib/components/Icon.svelte';
  import SectionTitle from '$lib/components/SectionTitle.svelte';

  const today = todayEpochDay();

  let pausesQuery = liveQuery(['journalingPause'], (j) => j.journalingPauses.getPauses());
  let pauses = $derived(pausesQuery.value ?? []);
  let current = $derived(pauses.find((p) => pauseCoversDay(p, today)) ?? null);
  let history = $derived(pauses.filter((p) => p.id !== current?.id));

  let newPause = $state<{ start: string; end: string } | null>(null);

  async function startPause() {
    if (!newPause) return;
    const startEpochDay = epochDayFromDateInputValue(newPause.start);
    if (startEpochDay === null) return;
    await journal.journalingPauses.upsertPause({
      startEpochDay,
      // An empty end day is a pause that is still running, not a one-day one.
      endEpochDay: epochDayFromDateInputValue(newPause.end)
    });
    newPause = null;
  }

  async function resumeToday() {
    if (!current) return;
    // Today itself resumes, so the pause ends yesterday - an inclusive
    // end day of today would leave today still covered (pauseCoversDay)
    // and nothing would actually change until tomorrow. A pause declared
    // and resumed on the same day never covered a real day at all, so it
    // is deleted outright rather than kept as an inverted range.
    const endEpochDay = today - 1;
    if (endEpochDay < current.startEpochDay) {
      await journal.journalingPauses.deletePause(current.id);
      return;
    }
    await journal.journalingPauses.upsertPause({
      id: current.id,
      startEpochDay: current.startEpochDay,
      endEpochDay
    });
  }

  async function deletePause(id: string) {
    await journal.journalingPauses.deletePause(id);
  }
</script>

<div class="screen">
  <header class="screen-header">
    <a class="icon-btn" href="/settings" aria-label={m.back()}><Icon name="arrowLeft" /></a>
    <h1 class="screen-title">{m.journaling_pause_title()}</h1>
  </header>
  <p class="muted small" style="margin-bottom:var(--space-4)">{m.journaling_pause_intro()}</p>

  <div class="card">
    {#if current}
      <p class="row-title">
        {m.journaling_pause_running_since({
          day: fmtDay(current.startEpochDay, { day: 'numeric', month: 'short', year: 'numeric' })
        })}
      </p>
      <p class="muted small" style="margin:var(--space-2) 0 var(--space-3)">{m.journaling_pause_running_hint()}</p>
      <button class="btn btn-soft" data-resume-pause onclick={resumeToday}>
        <span>{m.journaling_pause_resume()}</span>
      </button>
    {:else if newPause}
      <div class="cd-endpoints">
        <div class="field">
          <label class="field-label" for="pause-start">{m.journaling_pause_start_label()}</label>
          <input class="input" type="date" id="pause-start" name="pause-start" bind:value={newPause.start} />
        </div>
        <div class="field">
          <label class="field-label" for="pause-end">{m.journaling_pause_end_label()}</label>
          <input class="input" type="date" id="pause-end" name="pause-end" bind:value={newPause.end} />
        </div>
      </div>
      <p class="muted small" style="margin:calc(-1 * var(--space-2)) 0 var(--space-3)">
        {m.journaling_pause_end_hint()}
      </p>
      <button
        class="btn btn-primary"
        data-confirm-pause
        disabled={epochDayFromDateInputValue(newPause.start) === null}
        onclick={startPause}
      >
        <span>{m.journaling_pause_start()}</span>
      </button>
    {:else}
      <button
        class="btn btn-primary"
        data-new-pause
        onclick={() => (newPause = { start: dateInputValueFromEpochDay(today), end: '' })}
      >
        <span>{m.journaling_pause_start()}</span>
      </button>
    {/if}
  </div>

  {#if history.length}
    <SectionTitle text={m.journaling_pause_history_title()} />
    <div class="list-group">
      {#each history as pause (pause.id)}
        <div class="list-row">
          <span class="row-text">
            <span class="row-title">
              {fmtDay(pause.startEpochDay, { day: 'numeric', month: 'short', year: 'numeric' })}
              {pause.endEpochDay === null
                ? `· ${m.journaling_pause_ongoing()}`
                : `– ${fmtDay(pause.endEpochDay, { day: 'numeric', month: 'short', year: 'numeric' })}`}
            </span>
          </span>
          <button
            class="icon-btn"
            data-delete-pause={pause.id}
            aria-label={m.journaling_pause_delete_aria({
              from: fmtDay(pause.startEpochDay, { day: 'numeric', month: 'long', year: 'numeric' })
            })}
            onclick={() => deletePause(pause.id)}
          >
            <Icon name="trash" size={18} />
          </button>
        </div>
      {/each}
    </div>
  {/if}
</div>
