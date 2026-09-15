<script lang="ts">
  /* Letters to your future self (phase 5 UX ticket 25, redrawn by phase 10
     redesign ticket 45).

     Two things were crowded, and phase 5 fixed the first: composing is a
     sheet now, opened from the header's add control the way every other
     feature screen on the hub opens its editor, and the screen itself is
     what it says it is.

     What ticket 45 changes is what a letter looks like once it is here. All
     three states were one list row - a lock glyph, "Sealed", and `Opens 19
     Aug 2031` in secondary grey - so five years of waiting read exactly like
     a size record. They are three drawings now and `LetterCard` holds them;
     opening one unfolds it in place rather than replacing it with a sheet
     of text.

     Rule 16 asks an area screen to open by saying what is true now. This one
     answers it with its order rather than with a second drawing above the
     list: the letters still waiting come first, soonest to open at the top,
     and the ones already open run underneath - Appointments' Coming up and
     Behind you, on the only fact that changes which of them you want. The
     next letter to open, and how long until it does, is then the first thing
     on the screen and is not repeated anywhere. */
  import { untrack } from 'svelte';
  import { page } from '$app/state';
  import { m } from '$lib/paraglide/messages';
  import DatePicker from '$lib/components/DatePicker.svelte';
  import { journal, liveList } from '$lib/data/live/journal.svelte';
  import {
    getGreetedLetterIds,
    getReadLetterIds,
    isLetterSealed,
    letterToGreet,
    markLetterGreeted,
    markLetterRead
  } from '$lib/data/letterStatus';
  import { todayEpochDay, epochDayFromDateInputValue, dateInputValueFromEpochDay } from '$lib/data/epochDay';
  import type { Letter } from '$lib/data/types';
  import Icon from '$lib/components/Icon.svelte';
  import LetterArrival from '$lib/components/LetterArrival.svelte';
  import LetterCard from '$lib/components/LetterCard.svelte';
  import ScreenHeader from '$lib/components/ScreenHeader.svelte';
  import Sheet from '$lib/components/Sheet.svelte';
  import Field from '$lib/components/kit/Field.svelte';
  import Notice from '$lib/components/kit/Notice.svelte';
  import SectionHeading from '$lib/components/kit/SectionHeading.svelte';
  import { recordEditor } from '$lib/components/kit/recordEditor.svelte';
  import RecordSheet from '$lib/components/kit/RecordSheet.svelte';
  import CalendarHandoffSheet from '$lib/components/CalendarHandoffSheet.svelte';
  import { roleAttrs } from '$lib/components/kit/role';
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

  /* Which letters have been read, and which arrivals have been met. Both
     live in localStorage rather than in the journal (ADR-0039), and both are
     mirrored into state here so opening a letter re-draws its card without a
     reload - a plain read of the store would be taken once and never again. */
  let readIds = $state(getReadLetterIds());
  let greetedIds = $state(getGreetedLetterIds());

  /* Waiting first, soonest to open at the top, then the ones already open,
     most recently unlocked first. Rule 16's ordering, and the reason there
     is no separate reading above the list. */
  let waiting = $derived(
    letters
      .filter((letter) => isLetterSealed(letter, today))
      .sort((a, b) => a.unlockEpochDay - b.unlockEpochDay || a.epochDay - b.epochDay)
  );
  let opened = $derived(
    letters
      .filter((letter) => !isLetterSealed(letter, today))
      .sort((a, b) => b.unlockEpochDay - a.unlockEpochDay || b.epochDay - a.epochDay)
  );

  async function saveLetter() {
    const trimmed = text.trim();
    const unlockEpochDay = epochDayFromDateInputValue(unlockDate);
    if (!trimmed || unlockEpochDay == null) return;
    await journal.letters.addLetter({ epochDay: today, text: trimmed, unlockEpochDay });
    text = '';
    composing = false;
  }

  /* Which card is unfolded. One at a time: two open letters on one screen is
     two columns of prose to scroll past to reach the third. */
  let openId = $state<string | null>(null);

  function markRead(letter: Letter) {
    markLetterRead(letter.id);
    readIds = getReadLetterIds();
  }

  function openLetter(letter: Letter) {
    openId = letter.id;
    markRead(letter);
  }

  /* A letter unlocking today, not yet met either way, takes the screen -
     including one written from this very screen and dated today, which is
     why this watches the live rows rather than a snapshot taken on mount.

     Held in state rather than derived, and that is the whole of why this is
     an effect. Opening the letter from the arrival marks it read, which is
     exactly the condition `letterToGreet` refuses on - so a derived arrival
     would unmount itself in the frame the person pressed Open it, which is
     the yank this screen most has to avoid. Once taken, the arrival is the
     arrival's to end. */
  let arrival = $state<Letter | null>(null);
  $effect(() => {
    const met = new Set([...readIds, ...greetedIds]);
    const due = letterToGreet(letters, today, met);
    if (due && untrack(() => arrival) === null) arrival = due;
  });

  function endArrival(letter: Letter) {
    markLetterGreeted(letter.id);
    greetedIds = getGreetedLetterIds();
    arrival = null;
  }

  $effect(() => {
    const readId = page.url.searchParams.get('read') ?? page.url.searchParams.get('id');
    if (!readId) return;
    const match = letters.find((l) => l.id === readId);
    if (match && !isLetterSealed(match, today) && openId !== match.id) {
      openLetter(match);
    }
  });

  const record = recordEditor<Letter>({
    remove: (id) => journal.letters.deleteLetter(id),
    findById: (id) => letters.find((letter) => letter.id === id)
  });

  // Ticket 18: only a sealed letter's unlock day is worth a mark elsewhere -
  // once it has opened the day has already passed.
  let calendarFor = $state<Letter | null>(null);
</script>

<div class="screen">
  <ScreenHeader title={m.letters_title()} back="/more" subtitle={m.letters_intro()}>
    {#snippet actions()}
      <button class="icon-btn press" data-add aria-label={m.letters_compose_title()} onclick={() => (composing = true)}>
        <Icon name="plus" size={22} />
      </button>
    {/snippet}
  </ScreenHeader>

  <ReadGate read={lettersQuery} variant="line" count={3}>
    {#snippet rows()}
      {#if waiting.length}
        <SectionHeading text={m.letters_waiting_title()} />
        <div class="screen-part letter-list" {...roleAttrs(roleAt(activeFlag.roles, 0))}>
          {#each waiting as letter (letter.id)}
            <LetterCard
              {letter}
              {today}
              read={readIds.has(letter.id)}
              oncalendar={() => (calendarFor = letter)}
              ondelete={() => record.askToDelete(letter)}
            />
          {/each}
        </div>
      {/if}

      {#if opened.length}
        <SectionHeading text={m.letters_opened_title()} />
        <div class="screen-part letter-list" {...roleAttrs(roleAt(activeFlag.roles, 0))}>
          {#each opened as letter (letter.id)}
            <LetterCard
              {letter}
              {today}
              read={readIds.has(letter.id)}
              open={openId === letter.id}
              onopen={() => openLetter(letter)}
              onclose={() => (openId = null)}
              ondelete={() => record.askToDelete(letter)}
            />
          {/each}
        </div>
      {/if}
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

  {#if calendarFor}
    <CalendarHandoffSheet
      open={calendarFor !== null}
      kind="letterUnlock"
      epochDay={calendarFor.unlockEpochDay}
      onClose={() => (calendarFor = null)}
    />
  {/if}

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

{#if arrival}
  {@const met = arrival}
  <LetterArrival letter={met} {today} onopen={() => markRead(met)} ondone={() => endArrival(met)} />
{/if}

<style>
  .letter-anchors {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
    margin-top: var(--space-3);
  }

  /* Rule 4's flush list: the cards run between two full-width hairlines with
     one between each pair, and the hairline between them is the card's own
     (LetterCard). No ground, no outline, no box. */
  .letter-list {
    border-top: 1px solid var(--hairline);
    border-bottom: 1px solid var(--hairline);
  }

  /* The separator between two cards is the list's, not the card's: a card
     cannot see its own sibling, and the one on the letter's own route has
     none to be separated from. */
  .letter-list :global(.letter-card + .letter-card) {
    border-top: 1px solid var(--hairline);
  }
</style>
