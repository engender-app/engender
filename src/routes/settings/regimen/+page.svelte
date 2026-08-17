<script lang="ts">
  import { m } from '$lib/paraglide/messages';
  import { journal, liveQuery } from '$lib/data/live/journal.svelte';
  import { resolveEpisodeAt, episodeEndEpochDay } from '$lib/data/regimenEpisode';
  import { fmtDay } from '$lib/data/dates';
  import { todayEpochDay, epochDayFromDateInputValue, dateInputValueFromEpochDay } from '$lib/data/epochDay';
  import type { RegimenEpisode } from '$lib/data/types';
  import Icon from '$lib/components/Icon.svelte';
  import EmptyState from '$lib/components/EmptyState.svelte';
  import Sheet from '$lib/components/Sheet.svelte';
  import Skeleton from '$lib/components/Skeleton.svelte';

  /* Ordered by start day (ties by insertion order) - the order
     resolveEpisodeAt and episodeEndEpochDay both require. */
  let episodesQuery = liveQuery(['regimen'], (j) => j.regimen.getEpisodes());
  let episodes = $derived(episodesQuery.value ?? []);
  let active = $derived(resolveEpisodeAt(episodes, Date.now()));

  function rangeLabel(episode: RegimenEpisode, index: number): string {
    const start = fmtDay(episode.startEpochDay, { month: 'short', year: 'numeric' });
    const endDay = episodeEndEpochDay(episodes, index);
    const end = endDay === null ? m.regimen_ongoing() : fmtDay(endDay, { month: 'short', year: 'numeric' });
    return `${start} – ${end}`;
  }

  let editor = $state<{
    id?: string;
    drug: string;
    ester: string;
    dose: string;
    doseUnit: string;
    route: string;
    interval: string;
    startDate: string;
    hidden: boolean;
  } | null>(null);

  function openEditor(episode: RegimenEpisode | null) {
    editor = episode
      ? {
          id: episode.id,
          drug: episode.drug,
          ester: episode.ester ?? '',
          dose: String(episode.dose),
          doseUnit: episode.doseUnit,
          route: episode.route,
          interval: episode.interval,
          startDate: dateInputValueFromEpochDay(episode.startEpochDay),
          hidden: episode.hidden
        }
      : {
          drug: '',
          ester: '',
          dose: '',
          doseUnit: '',
          route: '',
          interval: '',
          startDate: dateInputValueFromEpochDay(todayEpochDay()),
          hidden: false
        };
  }

  async function saveEpisode() {
    if (!editor) return;
    const dose = parseFloat(editor.dose);
    const drug = editor.drug.trim();
    if (isNaN(dose) || !drug) return;

    await journal.regimen.upsertEpisode({
      id: editor.id,
      drug,
      ester: editor.ester.trim() || null,
      dose,
      doseUnit: editor.doseUnit.trim(),
      route: editor.route.trim(),
      interval: editor.interval.trim(),
      startEpochDay: epochDayFromDateInputValue(editor.startDate) ?? todayEpochDay()
    });
    editor = null;
  }

  async function toggleHidden() {
    if (!editor?.id) return;
    const nextHidden = !editor.hidden;
    await journal.regimen.setEpisodeHidden(editor.id, nextHidden);
    editor = { ...editor, hidden: nextHidden };
  }
</script>

<div class="screen">
  <header class="screen-header">
    <a class="icon-btn" href="/settings" aria-label={m.back()}><Icon name="arrowLeft" /></a>
    <h1 class="screen-title">{m.regimen()}</h1>
    <div class="header-action">
      <button class="icon-btn" data-add aria-label={m.regimen_add_aria()} onclick={() => openEditor(null)}>
        <Icon name="plus" size={22} />
      </button>
    </div>
  </header>
  <p class="muted small" style="margin-bottom:var(--space-4)">{m.regimen_intro()}</p>

  {#if episodesQuery.loading}
    <Skeleton variant="block" count={1} />
  {:else if episodes.length}
    <div class="list-group">
      {#each [...episodes].reverse() as episode, i (episode.id)}
        {@const index = episodes.length - 1 - i}
        <button
          class="list-row"
          data-episode={episode.id}
          aria-label={m.regimen_row_aria({ drug: episode.drug, date: fmtDay(episode.startEpochDay, { day: 'numeric', month: 'long', year: 'numeric' }) })}
          onclick={() => openEditor(episode)}
        >
          <span class="row-text">
            <span class="row-title">
              {episode.drug}
              {#if active?.id === episode.id}<span class="notice-warn" style="padding:2px 8px;border-radius:var(--radius-pill);font-size:var(--text-xs)">{m.regimen_active_badge()}</span>{/if}
              {#if episode.hidden}<span class="muted small">{m.regimen_hidden()}</span>{/if}
            </span>
            <span class="row-subtitle">
              {episode.dose} {episode.doseUnit} · {episode.route} · {episode.interval} · {rangeLabel(episode, index)}
            </span>
          </span>
          <Icon name="pencil" size={18} />
        </button>
      {/each}
    </div>
  {:else}
    <EmptyState title={m.regimen_empty_title()} text={m.regimen_empty_body()}>
      {#snippet action()}
        <button class="btn btn-soft" onclick={() => openEditor(null)}><span>{m.regimen_empty_action()}</span></button>
      {/snippet}
    </EmptyState>
  {/if}

  <Sheet open={editor !== null} title={editor?.id ? m.regimen_edit_sheet() : m.regimen_new_sheet()} onClose={() => (editor = null)}>
    {#if editor}
      <h3>{editor.id ? m.regimen_edit_sheet() : m.regimen_new_sheet()}</h3>
      <div class="field">
        <label class="field-label" for="regimen-drug">{m.regimen_drug_label()}</label>
        <input class="input" id="regimen-drug" name="regimen-drug" placeholder={m.regimen_drug_placeholder()} bind:value={editor.drug} />
      </div>
      <div class="field">
        <label class="field-label" for="regimen-ester">{m.regimen_ester_label()}</label>
        <input class="input" id="regimen-ester" name="regimen-ester" placeholder={m.regimen_ester_placeholder()} bind:value={editor.ester} />
      </div>
      <div class="cd-endpoints">
        <div class="field">
          <label class="field-label" for="regimen-dose">{m.regimen_dose_label()}</label>
          <input class="input" type="number" id="regimen-dose" name="regimen-dose" placeholder={m.regimen_dose_placeholder()} inputmode="decimal" bind:value={editor.dose} />
        </div>
        <div class="field">
          <label class="field-label" for="regimen-dose-unit">{m.regimen_dose_unit_label()}</label>
          <input class="input" id="regimen-dose-unit" name="regimen-dose-unit" placeholder={m.regimen_dose_unit_placeholder()} bind:value={editor.doseUnit} />
        </div>
      </div>
      <div class="field">
        <label class="field-label" for="regimen-route">{m.regimen_route_label()}</label>
        <input class="input" id="regimen-route" name="regimen-route" placeholder={m.regimen_route_placeholder()} bind:value={editor.route} />
      </div>
      <div class="field">
        <label class="field-label" for="regimen-interval">{m.regimen_interval_label()}</label>
        <input class="input" id="regimen-interval" name="regimen-interval" placeholder={m.regimen_interval_placeholder()} bind:value={editor.interval} />
      </div>
      <div class="field">
        <label class="field-label" for="regimen-start">{m.regimen_start_label()}</label>
        <input class="input" type="date" id="regimen-start" name="regimen-start" bind:value={editor.startDate} />
      </div>
      <div class="stack-3">
        <button class="btn btn-primary" data-save-regimen onclick={saveEpisode}><span>{m.regimen_save()}</span></button>
        {#if editor.id}
          <button class="btn btn-ghost" data-toggle-hidden onclick={toggleHidden}>
            <span>{editor.hidden ? m.regimen_show_aria({ drug: editor.drug }) : m.regimen_hide_aria({ drug: editor.drug })}</span>
          </button>
        {/if}
      </div>
    {/if}
  </Sheet>
</div>
