<script lang="ts">
  /* The journaling pause (phase 5 ticket 21, CONTEXT: "Journaling pause").
     A pause is journal-wide, not per-episode, so it gets its own settings
     screen rather than living beside a regimen episode the way Dose pause
     does - there is no episode to attach it to. Ending a running pause is
     an explicit "resume" action (upsertPause with today as the end day),
     distinct from deleting the row outright, which erases that the pause
     ever happened rather than closing it out - so a delete asks first and
     says it happened (after-release 07). */
  import ReadReserve from '$lib/components/kit/ReadReserve.svelte';
  import { readReserve, rememberReserve } from '$lib/data/homeReserve';
  import { m } from '$lib/paraglide/messages';
  import DatePicker from '$lib/components/DatePicker.svelte';
  import { journal, liveList } from '$lib/data/live/journal.svelte';
  import { fmtDay } from '$lib/data/dates';
  import { epochDayFromDateInputValue, dateInputValueFromEpochDay } from '$lib/data/epochDay';
  import { currentDay } from '$lib/stores/today.svelte';
  import { pauseCoversDay } from '$lib/data/journalingPause';
  import ScreenHeader from '$lib/components/ScreenHeader.svelte';
  import SectionTitle from '$lib/components/SectionTitle.svelte';
  import Field from '$lib/components/kit/Field.svelte';
  import ListCard from '$lib/components/kit/ListCard.svelte';
  import ListRow from '$lib/components/kit/ListRow.svelte';
  import RecordSheet from '$lib/components/kit/RecordSheet.svelte';
  import { recordEditor } from '$lib/components/kit/recordEditor.svelte';
  import { collapse, resize } from '$lib/motion/reveal';
  import type { JournalingPause } from '$lib/data/types';

  const today = $derived(currentDay());

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

  const pauseRecord = recordEditor<JournalingPause>({
    remove: (id) => journal.journalingPauses.deletePause(id),
    deleted: () => m.journaling_pause_deleted(),
    findById: (id) => pauses.find((pause) => pause.id === id)
  });

  const longDay = (epochDay: number) => fmtDay(epochDay, { day: 'numeric', month: 'long', year: 'numeric' });

  /* Latched: a reserve must not put its placeholder back (ticket 211). */
  let pausesRevealed = $state(false);
  $effect.pre(() => {
    if (!pausesQuery.loading) pausesRevealed = true;
  });
  const pausesEstimate = readReserve('journaling-pause');
  const pausesRemember = (px: number) => rememberReserve('journaling-pause', px);
</script>

<div class="screen">
  <ScreenHeader title={m.journaling_pause_title()} back="/settings" subtitle={m.journaling_pause_intro()} />

  <!-- Held until the pauses have answered, then faded in (ux-carpet ticket
       211): the history cut in at full opacity when they did, and the panel
       above it answers from the same read. -->
  <ReadReserve ready={pausesRevealed} estimate={pausesEstimate} onrest={pausesRemember}>
    <div class="kit-panel" data-kit-surface use:resize>
      {#if current}
        <p class="kit-row-title">
          {m.journaling_pause_running_since({
            day: fmtDay(current.startEpochDay, { day: 'numeric', month: 'short', year: 'numeric' })
          })}
        </p>
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

    <!-- A deleted pause closes its own height and the rows under it follow;
         the last one takes the heading and the card with it. -->
    {#if history.length}
      <div transition:collapse>
        <SectionTitle text={m.journaling_pause_history_title()} />
        <ListCard>
          {#each history as pause (pause.id)}
            <div class="rows-divide" transition:collapse>
              <ListRow
                static
                title={pause.endEpochDay === null
                  ? m.journaling_pause_history_ongoing({ from: fmtDay(pause.startEpochDay, { day: 'numeric', month: 'short', year: 'numeric' }) })
                  : m.journaling_pause_history_range({ from: fmtDay(pause.startEpochDay, { day: 'numeric', month: 'short', year: 'numeric' }), to: fmtDay(pause.endEpochDay, { day: 'numeric', month: 'short', year: 'numeric' }) })}
                action={{
                  icon: 'trash',
                  label: m.journaling_pause_delete_aria({ from: longDay(pause.startEpochDay) }),
                  onclick: () => pauseRecord.askToDelete(pause),
                  attrs: { 'data-delete-pause': pause.id }
                }}
              />
            </div>
          {/each}
        </ListCard>
      </div>
    {/if}
  </ReadReserve>

  <RecordSheet
    record={pauseRecord}
    handle="pause"
    confirm={{
      title: m.journaling_pause_delete_sheet(),
      question: (pause) => m.journaling_pause_delete_q({ from: longDay(pause.startEpochDay) }),
      hint: () => m.journaling_pause_delete_hint(),
      confirmLabel: m.journaling_pause_delete_sheet(),
      cancelLabel: m.keep_it()
    }}
  />
</div>
