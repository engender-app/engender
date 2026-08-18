<script lang="ts">
  import { m } from '$lib/paraglide/messages';
  import { journal, liveQuery } from '$lib/data/live/journal.svelte';
  import { earliestEpisodeStartEpochDay } from '$lib/data/regimenEpisode';
  import { literatureWindow, literatureWindowDays, PERSONAL_EFFECT_TYPES } from '$lib/data/personalEffectWindow';
  import { personalEffectName } from '$lib/data/vocabulary/labels';
  import { fmtDay } from '$lib/data/dates';
  import { todayEpochDay, epochDayFromDateInputValue, dateInputValueFromEpochDay } from '$lib/data/epochDay';
  import type { PersonalEffectType } from '$lib/data/types';
  import Icon from '$lib/components/Icon.svelte';
  import EmptyState from '$lib/components/EmptyState.svelte';
  import Sheet from '$lib/components/Sheet.svelte';
  import Skeleton from '$lib/components/Skeleton.svelte';
  import EffectsTimeline from '$lib/components/EffectsTimeline.svelte';

  let episodesQuery = liveQuery(['regimen'], (j) => j.regimen.getEpisodes());
  let episodes = $derived(episodesQuery.value ?? []);
  /* The anchor is HRT's own start, not whichever episode is active right
     now (ticket 07) - resolveEpisodeAt is the wrong function here, this is
     the one place earliestEpisodeStartEpochDay is called from. */
  let anchorEpochDay = $derived(earliestEpisodeStartEpochDay(episodes));

  let markersQuery = liveQuery(['personalEffect'], (j) => j.personalEffects.getMarkers());
  let markers = $derived(markersQuery.value ?? []);
  const markerFor = (effect: PersonalEffectType) => markers.find((marker) => marker.effect === effect) ?? null;

  const today = todayEpochDay();

  let timelineRows = $derived(
    anchorEpochDay == null
      ? []
      : PERSONAL_EFFECT_TYPES.map((effect) => ({
          key: effect,
          label: personalEffectName(effect),
          ...literatureWindowDays(effect, anchorEpochDay),
          markerDay: markerFor(effect)?.firstNoticedEpochDay ?? null
        }))
  );

  /* One whole-sentence message per window shape (no completion window,
     open-ended, or bounded) rather than concatenating parts - each is a
     full sentence in its own right, so nothing here has to guess how any
     other language would order the pieces. */
  function windowCaption(effect: PersonalEffectType): string {
    const window = literatureWindow(effect);
    const onsetMin = String(window.onsetMonths.min);
    const onsetMax = String(window.onsetMonths.max);
    if (!window.completionMonths) return m.effect_window_no_completion({ onsetMin, onsetMax });
    const compMin = String(window.completionMonths.min);
    if (window.completionMonths.max == null) return m.effect_window_open_completion({ onsetMin, onsetMax, compMin });
    return m.effect_window_bounded({ onsetMin, onsetMax, compMin, compMax: String(window.completionMonths.max) });
  }

  let editor = $state<{ effect: PersonalEffectType; date: string } | null>(null);

  function openEditor(effect: PersonalEffectType) {
    const existing = markerFor(effect);
    editor = { effect, date: dateInputValueFromEpochDay(existing?.firstNoticedEpochDay ?? today) };
  }

  async function saveMarker() {
    if (!editor) return;
    const epochDay = epochDayFromDateInputValue(editor.date) ?? today;
    await journal.personalEffects.upsertMarker({ effect: editor.effect, firstNoticedEpochDay: epochDay });
    editor = null;
  }

  async function clearMarker() {
    if (!editor) return;
    const effect = editor.effect;
    editor = null;
    await journal.personalEffects.clearMarker(effect);
  }
</script>

<div class="screen">
  <header class="screen-header">
    <a class="icon-btn" href="/settings" aria-label={m.back()}><Icon name="arrowLeft" /></a>
    <h1 class="screen-title">{m.effects_timeline()}</h1>
  </header>

  {#if episodesQuery.loading || markersQuery.loading}
    <Skeleton variant="block" count={1} />
  {:else if anchorEpochDay == null}
    <EmptyState title={m.effects_no_regimen_title()} text={m.effects_no_regimen_body()}>
      {#snippet action()}
        <a class="btn btn-soft" href="/settings/regimen"><span>{m.effects_no_regimen_action()}</span></a>
      {/snippet}
    </EmptyState>
  {:else}
    <p class="muted small" style="margin-bottom:var(--space-4)">{m.effects_intro()}</p>

    <div class="card">
      <EffectsTimeline rows={timelineRows} {anchorEpochDay} todayEpochDay={today} />
    </div>
    <p class="muted small" style="margin-top:var(--space-2)">{m.effects_source()}</p>

    <div class="list-group" style="margin-top:var(--space-4)">
      {#each PERSONAL_EFFECT_TYPES as effect (effect)}
        {@const marker = markerFor(effect)}
        <button class="list-row" onclick={() => openEditor(effect)}>
          <span class="row-text">
            <span class="row-title">{personalEffectName(effect)}</span>
            <span class="row-subtitle">
              {marker
                ? m.effect_first_noticed({
                    date: fmtDay(marker.firstNoticedEpochDay, { day: 'numeric', month: 'long', year: 'numeric' })
                  })
                : m.effect_not_marked()}
            </span>
          </span>
          <Icon name="pencil" size={18} />
        </button>
      {/each}
    </div>
  {/if}

  <Sheet open={editor !== null} title={editor ? personalEffectName(editor.effect) : ''} onClose={() => (editor = null)}>
    {#if editor}
      <h3>{personalEffectName(editor.effect)}</h3>
      <p class="muted small" style="margin-bottom:var(--space-3)">{windowCaption(editor.effect)}</p>
      <div class="field">
        <label class="field-label" for="effect-date">{m.effect_first_noticed_label()}</label>
        <input class="input" type="date" id="effect-date" name="effect-date" bind:value={editor.date} />
      </div>
      <div class="stack-3">
        <button class="btn btn-primary" data-save-effect onclick={saveMarker}><span>{m.effect_save()}</span></button>
        {#if markerFor(editor.effect)}
          <button class="btn btn-ghost" data-clear-effect onclick={clearMarker}><span>{m.effect_clear()}</span></button>
          <p class="muted small">{m.effect_clear_hint()}</p>
        {/if}
      </div>
    {/if}
  </Sheet>
</div>
