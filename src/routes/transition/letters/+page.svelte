<script lang="ts">
  import { collapse } from '$lib/motion/reveal';
  import { undoable } from '$lib/stores/deleteUndo';
  import { journalTextAutocomplete } from '$lib/platform';
  /* The add control opens Compose in a sheet. LetterCard owns the three
     states and unfolds an opened letter in place. Show letters still
     waiting first, ordered by soonest opening, then open letters. The
     list itself answers what is true now. */
  import { scrollBehavior } from '$lib/motion/tokens';
  import { untrack } from 'svelte';
  import { page } from '$app/state';
  import { replaceRoute } from '$lib/navigation/smart-back';
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
  import { acknowledgementStore } from '$lib/data/prefs/acknowledgementStore.svelte';
  import { safeSpaceLetters } from '$lib/data/letterRetrospective';
  import { todayEpochDay, epochDayFromDateInputValue, dateInputValueFromEpochDay } from '$lib/data/epochDay';
  import { currentDay } from '$lib/stores/today.svelte';
  import type { Letter } from '$lib/data/types';
  import Icon from '$lib/components/Icon.svelte';
  import LetterArrival from '$lib/components/LetterArrival.svelte';
  import LetterCard from '$lib/components/LetterCard.svelte';
  import ScreenHeader from '$lib/components/ScreenHeader.svelte';
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

  let today = $derived(currentDay());
  type Composition = { id?: string; text: string; unlockDate: string };
  let sealOutcome = $state('');

  function requirement(draft: Composition): string {
    if (!draft.text.trim()) return m.letters_text_required();
    const day = epochDayFromDateInputValue(draft.unlockDate);
    if (day == null || !Number.isFinite(day)) return m.letters_date_required();
    return '';
  }

  function compose() {
    sealOutcome = '';
    record.openEditor(null);
  }

  // Mirrored, and the journal already orders them by day (ADR-0004).
  let milestones = $derived(vocabulary.milestones);

  let lettersQuery = liveList((j) => j.letters.getLetters(HISTORY_LIMIT));
  let letters = $derived(lettersQuery.rows);

  /* Which letters have been read, and which arrivals have been met. Both live in the
     encrypted acknowledgements preference rather than in the journal's tables, read through
     the reactive store so opening a letter re-draws its card without a reload. */
  let readIds = $derived(getReadLetterIds(acknowledgementStore));
  let greetedIds = $derived(getGreetedLetterIds(acknowledgementStore));

  /* Waiting first, soonest to open at the top, then the ones already open,
     most recently unlocked first. Rule 16's ordering, and the reason there
     is no separate reading above the list. */
  let waiting = $derived(
    letters
      .filter((letter) => isLetterSealed(letter, today))
      .sort((a, b) => a.unlockEpochDay - b.unlockEpochDay || a.epochDay - b.epochDay)
  );
  /* `safeSpaceLetters` rather than the same filter and sort written out
     again: it is the ordering the folded screen read its letters through,
     and this section is where that screen's readers land now. */
  let opened = $derived(safeSpaceLetters(letters, today));

  /* Which card is unfolded. One at a time: two open letters on one screen is
     two columns of prose to scroll past to reach the third. */
  let openId = $state<string | null>(null);

  function markRead(letter: Letter) {
    markLetterRead(letter.id, acknowledgementStore);
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
    markLetterGreeted(letter.id, acknowledgementStore);
    arrival = null;
  }

  $effect(() => {
    const readId = page.url.searchParams.get('read') ?? page.url.searchParams.get('id');
    if (!readId) return;
    const match = letters.find((l) => l.id === readId);
    if (match && !isLetterSealed(match, today)) {
      openLetter(match);
      const url = new URL(page.url);
      url.searchParams.delete('read');
      url.searchParams.delete('id');
      void replaceRoute(url, { noScroll: true, keepFocus: true });
    }
  });

  const record = recordEditor<Letter, Composition>({
    blank: () => ({ text: '', unlockDate: dateInputValueFromEpochDay(todayEpochDay()) }),
    upsert: async (draft) => {
      if (requirement(draft)) return false;
      const unlockEpochDay = epochDayFromDateInputValue(draft.unlockDate)!;
      await journal.letters.addLetter({ epochDay: todayEpochDay(), text: draft.text.trim(), unlockEpochDay });
      if (record.editor === draft && unlockEpochDay !== today) {
        sealOutcome = isLetterSealed({ unlockEpochDay }, today) ? m.letters_seal_done() : m.letters_ready_done();
      }
    },
    saved: () => sealOutcome || m.saved(),
    remove: (id) => undoable((j) => j.letters.deleteLetter(id)),
    findById: (id) => letters.find((letter) => letter.id === id)
  });

  // Only a sealed letter's unlock day is worth a mark elsewhere -
  // once it has opened the day has already passed.
  let calendarFor = $state<Letter | null>(null);

  // Preserve waiting list position when returning from the ready-letters jump.
  let waitingScroll: number | null = null;

  function onJump() {
    const region = document.querySelector<HTMLElement>('[data-app-scroll-region]');
    waitingScroll = region?.scrollTop ?? 0;
  }

  $effect(() => {
    const handlePopstate = () => {
      if (!location.hash && waitingScroll !== null) {
        const region = document.querySelector<HTMLElement>('[data-app-scroll-region]');
        if (region) {
          region.scrollTo({ top: waitingScroll, behavior: scrollBehavior() });
        }
        waitingScroll = null;
      }
    };
    window.addEventListener('popstate', handlePopstate);
    return () => window.removeEventListener('popstate', handlePopstate);
  });
</script>

<div class="screen">
  <ScreenHeader title={m.letters_title()} back="/more" subtitle={m.letters_intro()}>
    {#snippet actions()}
      <button class="icon-btn press" data-add aria-label={m.letters_compose_title()} onclick={compose}>
        <Icon name="plus" size={22} />
      </button>
    {/snippet}
  </ScreenHeader>

  <ReadGate read={lettersQuery} variant="line" count={3}>
    {#snippet rows()}
      {#if waiting.length}
        <SectionHeading text={m.letters_waiting_title()}>
          {#snippet action()}
            {#if opened.length}
              <a
                class="kit-heading-action"
                href="#opened"
                data-letters-ready-jump
                onclick={onJump}
              >
                {m.letters_ready_jump({ count: opened.length })}
              </a>
            {/if}
          {/snippet}
        </SectionHeading>
        <div class="screen-part letter-list" {...roleAttrs(roleAt(activeFlag.roles, 0))}>
          {#each waiting as letter (letter.id)}
            <div transition:collapse>
              <LetterCard
                {letter}
                {today}
                read={readIds.has(letter.id)}
                oncalendar={() => (calendarFor = letter)}
                ondelete={() => record.askToDelete(letter)}
              />
            </div>
          {/each}
        </div>
      {/if}

      {#if opened.length}
        <SectionHeading id="opened" focusable text={m.letters_opened_title()} />
        <div class="screen-part letter-list" {...roleAttrs(roleAt(activeFlag.roles, 0))}>
          {#each opened as letter (letter.id)}
            <div transition:collapse>
              <LetterCard
                {letter}
                {today}
                read={readIds.has(letter.id)}
                open={openId === letter.id}
                onopen={() => openLetter(letter)}
                onclose={() => (openId = null)}
                ondelete={() => record.askToDelete(letter)}
              />
            </div>
          {/each}
        </div>
      {/if}
    {/snippet}
    {#snippet empty()}
      <Notice
        icon="envelope"
        key="letters-empty"
        role={roleAt(activeFlag.roles, 0)}
        title={m.letters_empty_title()}
        action={{ label: m.letters_compose_title(), primary: true, onclick: compose }}
      />
    {/snippet}
  </ReadGate>

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
    newTitle={m.letters_compose_title()}
    saveLabel={m.letters_save()}
    canSave={(draft) => !requirement(draft)}
    showHeading={false}
    {fields}
    confirm={{
      title: m.letters_delete_sheet(),
      question: () => m.letters_delete_q(),
      hint: () => m.delete_undo_hint(),
      confirmLabel: m.delete(),
      cancelLabel: m.keep_it()
    }}
  />
  {#snippet fields(draft: Composition)}
    <Field label={m.letters_text_label()} id="letter-text">
      {#snippet children(id, _hint, touched)}
        <textarea autocomplete={journalTextAutocomplete()}
          class="input"
          {id}
          rows="6"
          placeholder={m.letters_compose_placeholder()}
          bind:value={draft.text}
          aria-invalid={touched && !draft.text.trim()}
          aria-describedby="letter-requirements"
        ></textarea>
      {/snippet}
    </Field>

    <Field label={m.letters_unlock_label()} id="letter-unlock">
      {#snippet children(id, _hint, touched)}
        <DatePicker
          name="letter-unlock"
          bind:value={draft.unlockDate}
          {id}
          aria-invalid={touched && (!draft.unlockDate || !Number.isFinite(epochDayFromDateInputValue(draft.unlockDate)))}
          describedBy="letter-requirements"
        />
      {/snippet}
    </Field>

    {#if milestones.length}
      <div class="letter-anchors">
        {#each milestones as mi (mi.id)}
          <button
            class="tag-chip"
            class:is-selected={draft.unlockDate === dateInputValueFromEpochDay(mi.epochDay)}
            data-letter-anchor={mi.id}
            aria-pressed={draft.unlockDate === dateInputValueFromEpochDay(mi.epochDay)}
            onclick={() => (draft.unlockDate = dateInputValueFromEpochDay(mi.epochDay))}
          >
            <Icon name="summit" size={16} />{mi.name}
          </button>
        {/each}
      </div>
    {/if}

    <p class="muted small" id="letter-requirements" aria-live="polite">{requirement(draft)}</p>
  {/snippet}
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
