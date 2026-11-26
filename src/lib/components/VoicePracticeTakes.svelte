<script lang="ts">
  import { collapse } from '$lib/motion/reveal';
  /* Share the letter seal predicate with unlock day epochDay + 1
     (ADR-0010). Sealed rows show the seal. Open rows show the stored
     figures. Draw the felt-sense face beside the pitch figures and state
     its accessible name in the subtitle.

     Keep practice and benchmark spans distinct. schema.ts explains why
     the benchmark's p10-p90 span uses a different measure. */
  import { undoable } from '$lib/stores/deleteUndo';
  import { m } from '$lib/paraglide/messages';
  import { fmtDay } from '$lib/data/dates';
  import { currentDay } from '$lib/stores/today.svelte';
  import { journal, liveList } from '$lib/data/live/journal.svelte';
  import { isSealedUntil } from '$lib/data/sealedUntil';
  import type { VoicePracticeTake } from '$lib/data/types';
  import { moodName } from '$lib/data/vocabulary/labels';
  import Icon from '$lib/components/Icon.svelte';
  import MoodFace from '$lib/components/MoodFace.svelte';
  import ListCard from '$lib/components/kit/ListCard.svelte';
  import ListRow from '$lib/components/kit/ListRow.svelte';
  import Notice from '$lib/components/kit/Notice.svelte';
  import ReadGate from '$lib/components/kit/ReadGate.svelte';
  import { recordEditor } from '$lib/components/kit/recordEditor.svelte';
  import RecordSheet from '$lib/components/kit/RecordSheet.svelte';
  import SectionHeading from '$lib/components/kit/SectionHeading.svelte';
  import type { Role } from '$lib/theme/roles';

  let { role }: { role?: Role } = $props();

  let takesQuery = liveList((j) => j.voicePracticeTakes.getTakes());
  let takes = $derived(takesQuery.rows);
  let today = $derived(currentDay());

  const dayLabel = (epochDay: number) => fmtDay(epochDay, { day: 'numeric', month: 'short', year: 'numeric' });

  const record = recordEditor<VoicePracticeTake>({
    remove: (id) => undoable((j) => j.voicePracticeTakes.deleteTake(id)),
    findById: (id) => takes.find((take) => take.id === id)
  });
</script>

<div class="screen-part">
  <SectionHeading text={m.vb_practice_takes_heading()} />
  <ReadGate read={takesQuery} variant="line" count={2}>
    {#snippet rows()}
      <ListCard {role}>
        {#each takes as take (take.id)}
          {@const sealedUntilEpochDay = take.epochDay + 1}
          {@const sealed = isSealedUntil(sealedUntilEpochDay, today)}
          <div class="rows-divide" transition:collapse>
            {#snippet takeDisc()}
              {#if sealed}
                <span class="kit-row-ico"><Icon name="lock" size={20} /></span>
              {:else if take.feltSense !== null}
                <MoodFace step={take.feltSense} size={36} />
              {:else}
                <span class="kit-row-ico"><Icon name="waveform" size={20} /></span>
              {/if}
            {/snippet}
            <ListRow
              key={take.id}
              data-practice-take={take.id}
              leading={takeDisc}
              title={sealed ? m.letters_sealed_title() : dayLabel(take.epochDay)}
              subtitle={sealed
                ? m.letters_sealed_until({ date: dayLabel(sealedUntilEpochDay) })
                : [
                    m.vb_practice_take_figures({
                      median: String(Math.round(take.medianHz)),
                      low: String(Math.round(take.minHz)),
                      high: String(Math.round(take.maxHz)),
                      range: String(Math.round(take.maxHz - take.minHz))
                    }),
                    take.feltSense !== null ? moodName(take.feltSense) : undefined
                  ]}
              chevron={false}
              action={{
                icon: 'trash',
                label: m.vb_practice_delete_aria({ date: dayLabel(take.epochDay) }),
                onclick: () => record.askToDelete(take)
              }}
            />
          </div>
        {/each}
      </ListCard>
      <p class="muted small vpt-note">{m.vb_practice_range_note()}</p>
    {/snippet}
    {#snippet empty()}
      <Notice
        icon="waveform"
        key="voice-practice-takes-empty"
        {role}
        title={m.vb_practice_takes_empty_title()}
        text={m.vb_practice_takes_empty_body()}
      />
    {/snippet}
  </ReadGate>
</div>

<RecordSheet
  {record}
  handle="practice-take"
  confirm={{
    title: m.vb_practice_delete_sheet(),
    question: () => m.vb_practice_delete_q(),
    hint: () => m.delete_undo_hint(),
    confirmLabel: m.vb_practice_delete_sheet(),
    cancelLabel: m.keep_it()
  }}
/>

<style>
  .vpt-note {
    margin: var(--space-3) 0 0;
  }
</style>
