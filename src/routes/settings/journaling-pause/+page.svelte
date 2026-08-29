<script lang="ts">
  /* The journaling pause (phase 5 ticket 21, CONTEXT: "Streak" - amended).
     A pause is journal-wide, not per-episode, so it gets its own settings
     screen rather than living beside a regimen episode the way Dose pause
     does - there is no episode to attach it to. Ending a running pause is
     an explicit "resume" action (upsertPause with today as the end day),
     distinct from deleting the row outright, which erases that the pause
     ever happened rather than closing it out. */
  import { m } from '$lib/paraglide/messages';
  import DatePicker from '$lib/components/DatePicker.svelte';
  import { journal, liveList } from '$lib/data/live/journal.svelte';
  import { fmtDay } from '$lib/data/dates';
  import { todayEpochDay, epochDayFromDateInputValue, dateInputValueFromEpochDay } from '$lib/data/epochDay';
  import { pauseCoversDay } from '$lib/data/journalingPause';
  import ScreenHeader from '$lib/components/ScreenHeader.svelte';
  import SectionTitle from '$lib/components/SectionTitle.svelte';
  import Field from '$lib/components/kit/Field.svelte';
  import ListCard from '$lib/components/kit/ListCard.svelte';
  import ListRow from '$lib/components/kit/ListRow.svelte';

  const today = todayEpochDay();

  let pausesQuery = liveList((j) => j.journalingPauses.getPauses());
  let pauses = $derived(pausesQuery.rows);
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
  <ScreenHeader title={m.journaling_pause_title()} back="/settings" subtitle={m.journaling_pause_intro()} />

  <div class="card">
    {#if current}
      <p class="kit-row-title">
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
        <Field label={m.journaling_pause_start_label()} id="pause-start">
          {#snippet children(id)}
            <DatePicker name="pause-start" bind:value={newPause!.start} {id} />
          {/snippet}
        </Field>
        <Field label={m.journaling_pause_end_label()} id="pause-end">
          {#snippet children(id)}
            <DatePicker name="pause-end" bind:value={newPause!.end} {id} />
          {/snippet}
        </Field>
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
    <ListCard>
      {#each history as pause (pause.id)}
        <ListRow
          static
          title={`${fmtDay(pause.startEpochDay, { day: 'numeric', month: 'short', year: 'numeric' })} ${
            pause.endEpochDay === null
              ? `· ${m.journaling_pause_ongoing()}`
              : `${m.journaling_pause_range_to()} ${fmtDay(pause.endEpochDay, { day: 'numeric', month: 'short', year: 'numeric' })}`
          }`}
          action={{
            icon: 'trash',
            label: m.journaling_pause_delete_aria({
              from: fmtDay(pause.startEpochDay, { day: 'numeric', month: 'long', year: 'numeric' })
            }),
            onclick: () => deletePause(pause.id),
            attrs: { 'data-delete-pause': pause.id }
          }}
        />
      {/each}
    </ListCard>
  {/if}
</div>
