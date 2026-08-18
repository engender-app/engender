<script lang="ts">
  import { m } from '$lib/paraglide/messages';
  import { journal, liveQuery } from '$lib/data/live/journal.svelte';
  import { isLetterSealed } from '$lib/data/letterStatus';
  import { fmtDay } from '$lib/data/dates';
  import { todayEpochDay, epochDayFromDateInputValue, dateInputValueFromEpochDay } from '$lib/data/epochDay';
  import type { Letter } from '$lib/data/types';
  import Icon from '$lib/components/Icon.svelte';
  import EmptyState from '$lib/components/EmptyState.svelte';
  import SectionTitle from '$lib/components/SectionTitle.svelte';
  import Sheet from '$lib/components/Sheet.svelte';
  import Skeleton from '$lib/components/Skeleton.svelte';
  import { vocabulary } from '$lib/data/vocabulary/vocabulary';

  const HISTORY_LIMIT = 100;

  let today = $derived(todayEpochDay());
  let text = $state('');
  let unlockDate = $state(dateInputValueFromEpochDay(todayEpochDay()));

  // Mirrored, and the journal already orders them by day (ADR-0004).
  let milestones = $derived(vocabulary.milestones);

  let lettersQuery = liveQuery(['letter'], (j) => j.letters.getLetters(HISTORY_LIMIT));
  let letters = $derived(lettersQuery.value ?? []);

  const dayLabel = (epochDay: number) => fmtDay(epochDay, { day: 'numeric', month: 'short', year: 'numeric' });

  async function saveLetter() {
    const trimmed = text.trim();
    const unlockEpochDay = epochDayFromDateInputValue(unlockDate);
    if (!trimmed || unlockEpochDay == null) return;
    await journal.letters.addLetter({ epochDay: today, text: trimmed, unlockEpochDay });
    text = '';
  }

  let deleteTarget = $state<Letter | null>(null);
  async function deleteLetter() {
    if (!deleteTarget) return;
    const id = deleteTarget.id;
    deleteTarget = null;
    await journal.letters.deleteLetter(id);
  }
</script>

<div class="screen">
  <header class="screen-header">
    <a class="icon-btn" href="/settings" aria-label={m.back()}><Icon name="arrowLeft" /></a>
    <h1 class="screen-title">{m.letters_title()}</h1>
  </header>
  <p class="muted small" style="margin-bottom:var(--space-4)">{m.letters_intro()}</p>

  <div class="card">
    <p class="quicklog-title">{m.letters_compose_title()}</p>
    <textarea class="input" rows="5" placeholder={m.letters_compose_placeholder()} bind:value={text}></textarea>

    <div class="field" style="margin-top:var(--space-3)">
      <span class="field-label">{m.letters_unlock_label()}</span>
      {#if milestones.length}
        <div class="stack-3" style="margin-bottom:var(--space-2)">
          {#each milestones as mi (mi.id)}
            <button
              class="list-row"
              style="background:var(--surface-2);border-radius:var(--radius-md)"
              onclick={() => (unlockDate = dateInputValueFromEpochDay(mi.epochDay))}
            >
              <span class="row-icon"><Icon name="flag" size={20} /></span>
              <span class="row-text">
                <span class="row-title">{mi.name}</span>
                <span class="row-subtitle">{dayLabel(mi.epochDay)}</span>
              </span>
            </button>
          {/each}
        </div>
      {/if}
      <input class="input" type="date" id="letter-unlock" name="letter-unlock" bind:value={unlockDate} />
    </div>

    <button
      class="btn btn-primary btn-block"
      style="margin-top:var(--space-3)"
      disabled={text.trim().length === 0 || !unlockDate}
      onclick={saveLetter}
    >
      <span>{m.letters_save()}</span>
    </button>
  </div>

  <SectionTitle text={m.letters_yours_title()} />
  {#if lettersQuery.loading}
    <Skeleton variant="card" count={2} />
  {:else if letters.length}
    <div class="list-group">
      {#each letters as letter (letter.id)}
        {#if isLetterSealed(letter, today)}
          <div class="list-row">
            <span class="row-icon"><Icon name="lock" size={20} /></span>
            <span class="row-text">
              <span class="row-title">{m.letters_sealed_title()}</span>
              <span class="row-subtitle">{m.letters_sealed_until({ date: dayLabel(letter.unlockEpochDay) })}</span>
            </span>
            <button class="icon-btn" aria-label={m.letters_delete_sheet()} onclick={() => (deleteTarget = letter)}>
              <Icon name="trash" size={18} />
            </button>
          </div>
        {:else}
          <div class="list-row">
            <span class="row-text">
              <span class="row-title">{dayLabel(letter.epochDay)}</span>
              <span class="row-subtitle">{letter.text}</span>
            </span>
            <button class="icon-btn" aria-label={m.letters_delete_sheet()} onclick={() => (deleteTarget = letter)}>
              <Icon name="trash" size={18} />
            </button>
          </div>
        {/if}
      {/each}
    </div>
  {:else}
    <EmptyState title={m.letters_empty_title()} text={m.letters_empty_body()} />
  {/if}

  <Sheet open={deleteTarget !== null} title={m.letters_delete_sheet()} onClose={() => (deleteTarget = null)}>
    {#if deleteTarget}
      <h3>{m.letters_delete_q()}</h3>
      <p class="muted small" style="margin-bottom:var(--space-4)">{m.letters_delete_hint()}</p>
      <div class="stack-3">
        <button class="btn btn-danger" onclick={deleteLetter}><span>{m.letters_delete()}</span></button>
        <button class="btn btn-ghost" onclick={() => (deleteTarget = null)}><span>{m.keep_it()}</span></button>
      </div>
    {/if}
  </Sheet>
</div>
