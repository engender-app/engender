<script lang="ts">
  /* Letters to your future self, on the surface kit (phase 5 UX ticket 25).

     Two things were crowded.

     The compose card held a textarea, a label, a scrolling list of every
     milestone as a tappable row, a date input and a save button, all inside
     one `.card` with no heading between them - the milestone list read as
     part of the date field rather than as a shortcut into it. Composing is
     a sheet now, opened from the header's add control the way every other
     feature screen on the hub opens its editor, and the screen itself is
     what it says it is: the letters you have written.

     And a letter's whole text was the row's subtitle, so a letter longer
     than a phrase was a row of ellipsis. The row carries the date and the
     first of it; tapping opens the letter, which is the thing the screen is
     for and had nowhere to happen. A sealed one opens too, and says what it
     is waiting for - a row that answers a press with nothing is worse than
     a row that cannot be pressed. */
  import { m } from '$lib/paraglide/messages';
  import DatePicker from '$lib/components/DatePicker.svelte';
  import { journal, liveList } from '$lib/data/live/journal.svelte';
  import { isLetterSealed } from '$lib/data/letterStatus';
  import { fmtDay } from '$lib/data/dates';
  import { todayEpochDay, epochDayFromDateInputValue, dateInputValueFromEpochDay } from '$lib/data/epochDay';
  import type { Letter } from '$lib/data/types';
  import Icon from '$lib/components/Icon.svelte';
  import ScreenHeader from '$lib/components/ScreenHeader.svelte';
  import Sheet from '$lib/components/Sheet.svelte';
  import Field from '$lib/components/kit/Field.svelte';
  import ListCard from '$lib/components/kit/ListCard.svelte';
  import ListRow from '$lib/components/kit/ListRow.svelte';
  import Notice from '$lib/components/kit/Notice.svelte';
  import SectionHeading from '$lib/components/kit/SectionHeading.svelte';
  import { recordEditor } from '$lib/components/kit/recordEditor.svelte';
  import RecordSheet from '$lib/components/kit/RecordSheet.svelte';
  import { crossfade } from '$lib/motion/reveal';
  import { activeFlag } from '$lib/theme/activeFlag.svelte';
  import { roleAt } from '$lib/theme/roles';
  import { vocabulary } from '$lib/data/vocabulary/vocabulary';
  import ReadGate from '$lib/components/kit/ReadGate.svelte';

  const HISTORY_LIMIT = 100;

  let today = $derived(todayEpochDay());
  let text = $state('');
  let unlockDate = $state(dateInputValueFromEpochDay(todayEpochDay()));
  let composing = $state(false);

  // Mirrored, and the journal already orders them by day (ADR-0004).
  let milestones = $derived(vocabulary.milestones);

  let lettersQuery = liveList((j) => j.letters.getLetters(HISTORY_LIMIT));
  let letters = $derived(lettersQuery.rows);

  const dayLabel = (epochDay: number) => fmtDay(epochDay, { day: 'numeric', month: 'short', year: 'numeric' });

  async function saveLetter() {
    const trimmed = text.trim();
    const unlockEpochDay = epochDayFromDateInputValue(unlockDate);
    if (!trimmed || unlockEpochDay == null) return;
    await journal.letters.addLetter({ epochDay: today, text: trimmed, unlockEpochDay });
    text = '';
    composing = false;
  }

  let reading = $state<Letter | null>(null);

  const record = recordEditor<Letter>({
    remove: (id) => journal.letters.deleteLetter(id),
    findById: (id) => letters.find((letter) => letter.id === id)
  });
</script>

<div class="screen">
  <ScreenHeader title={m.letters_title()} back="/more" subtitle={m.letters_intro()}>
    {#snippet actions()}
      <button class="icon-btn press" data-add aria-label={m.letters_compose_title()} onclick={() => (composing = true)}>
        <Icon name="plus" size={22} />
      </button>
    {/snippet}
  </ScreenHeader>

  <SectionHeading text={m.letters_yours_title()} />
  <ReadGate read={lettersQuery} variant="line" count={3}>
    {#snippet rows()}
      <div class="screen-part">
        <ListCard role={roleAt(activeFlag.roles, 0)}>
          {#each letters as letter (letter.id)}
            {@const sealed = isLetterSealed(letter, today)}
            <ListRow
              key={letter.id}
              data-letter={letter.id}
              icon={sealed ? 'lock' : 'book'}
              title={sealed ? m.letters_sealed_title() : dayLabel(letter.epochDay)}
              subtitle={sealed
                ? m.letters_sealed_until({ date: dayLabel(letter.unlockEpochDay) })
                : letter.text}
              chevron={false}
              onclick={() => (reading = letter)}
              action={{ icon: 'trash', label: m.letters_delete_sheet(), onclick: () => record.askToDelete(letter) }}
            />
          {/each}
        </ListCard>
      </div>
    {/snippet}
    {#snippet empty()}
      <div class="screen-part">
        <Notice
          icon="book"
          key="letters-empty"
          role={roleAt(activeFlag.roles, 0)}
          title={m.letters_empty_title()}
          text={m.letters_empty_body()}
          action={{ label: m.letters_compose_title(), primary: true, onclick: () => (composing = true) }}
        />
      </div>
    {/snippet}
  </ReadGate>

  <Sheet open={composing} title={m.letters_compose_title()} onClose={() => (composing = false)}>
    <SectionHeading text={m.letters_compose_title()} />
    <textarea class="input" rows="6" placeholder={m.letters_compose_placeholder()} bind:value={text}></textarea>

    <Field label={m.letters_unlock_label()} id="letter-unlock">
      {#snippet children(id)}
        <DatePicker name="letter-unlock" bind:value={unlockDate} {id} />
      {/snippet}
    </Field>

    <!-- The milestones are a shortcut into the date above, not a second way
         of choosing one, so they sit under it as chips rather than as a list
         of rows that looked like the screen's own content. -->
    {#if milestones.length}
      <div class="letter-anchors">
        {#each milestones as mi (mi.id)}
          <button
            class="tag-chip"
            class:is-selected={unlockDate === dateInputValueFromEpochDay(mi.epochDay)}
            data-letter-anchor={mi.id}
            aria-pressed={unlockDate === dateInputValueFromEpochDay(mi.epochDay)}
            onclick={() => (unlockDate = dateInputValueFromEpochDay(mi.epochDay))}
          >
            <Icon name="flag" size={14} />{mi.name}
          </button>
        {/each}
      </div>
    {/if}

    <button
      class="btn btn-primary btn-block"
     
      data-save-letter
      disabled={text.trim().length === 0 || !unlockDate}
      onclick={saveLetter}
    >
      <span>{m.letters_save()}</span>
    </button>
  </Sheet>

  <Sheet
    open={reading !== null}
    title={reading ? dayLabel(reading.epochDay) : m.letters_title()}
    onClose={() => (reading = null)}
  >
    {#if reading}
      {#if isLetterSealed(reading, today)}
        <SectionHeading text={m.letters_sealed_title()} />
        <p class="muted">{m.letters_sealed_until({ date: dayLabel(reading.unlockEpochDay) })}</p>
      {:else}
        <SectionHeading text={dayLabel(reading.epochDay)} />
        <p class="letter-text" data-letter-text>{reading.text}</p>
      {/if}
    {/if}
  </Sheet>

  <RecordSheet
    {record}
    handle="letter"
    confirm={{
      title: m.letters_delete_sheet(),
      question: () => m.letters_delete_q(),
      hint: () => m.letters_delete_hint(),
      confirmLabel: m.letters_delete(),
      cancelLabel: m.keep_it()
    }}
  />
</div>

<style>
  .letter-anchors {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
    margin-top: var(--space-3);
  }

  /* A letter is prose, so it keeps prose's measure and its own line
     height rather than inheriting a list row's. */
  .letter-text {
    white-space: pre-wrap;
    line-height: var(--leading-body);
    max-width: 65ch;
  }
</style>
