<script lang="ts">
  /* Sealed practice takes, read back (phase 8 features ticket 10).

     A take reuses the time-capsule letter's own seal mechanics rather than
     a second one - `isSealedUntil` is the same predicate `isLetterSealed`
     delegates to now, handed `epochDay + 1` rather than a stored unlock
     day, because that is the only unlock day a take ever has (ADR-0010;
     types.ts's own note). So this list is modelled on `/transition/letters`'
     own row: sealed shows the seal and nothing else, open shows what it is
     for. What differs is what "open" shows: a letter's own text, here the
     figures `journal.voicePracticeTakes` stored at save time.

     Felt sense is drawn, not only named: the row's own disc is the mood
     face rather than a fixed icon once one was recorded, which is what
     puts it beside the pitch figures the ticket asks for ("plotted beside
     pitch, never in place of it") without a second chart this tab has no
     other need of - moodFace.ts's drawings are this app's one way of
     plotting a mood everywhere else, and this is the same drawing, not a
     new one. It stays decorative (MoodFace is aria-hidden), so the mood
     name is still read out in the subtitle line under it.

     The distinction from a benchmark's p10-p90 span is written under the
     list rather than assumed, because a "fix" that makes one match the
     other would be wrong in both directions (schema.ts's own note). */
  import { m } from '$lib/paraglide/messages';
  import { fmtDay } from '$lib/data/dates';
  import { todayEpochDay } from '$lib/data/epochDay';
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
  let today = $derived(todayEpochDay());

  const dayLabel = (epochDay: number) => fmtDay(epochDay, { day: 'numeric', month: 'short', year: 'numeric' });

  const record = recordEditor<VoicePracticeTake>({
    remove: (id) => journal.voicePracticeTakes.deleteTake(id),
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
          {#snippet takeDisc()}
            {#if sealed}
              <span class="kit-row-ico"><Icon name="lock" size={20} /></span>
            {:else if take.feltSense !== null}
              <MoodFace step={take.feltSense} size={36} />
            {:else}
              <span class="kit-row-ico"><Icon name="mic" size={20} /></span>
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
        {/each}
      </ListCard>
      <p class="muted small vpt-note">{m.vb_practice_range_note()}</p>
    {/snippet}
    {#snippet empty()}
      <Notice
        icon="mic"
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
    hint: () => m.vb_practice_delete_hint(),
    confirmLabel: m.vb_practice_delete_sheet(),
    cancelLabel: m.keep_it()
  }}
/>

<style>
  .vpt-note {
    margin: var(--space-3) 0 0;
  }
</style>
