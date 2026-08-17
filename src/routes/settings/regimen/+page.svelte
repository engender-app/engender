<script lang="ts">
  import { m } from '$lib/paraglide/messages';
  import { journal, liveQuery } from '$lib/data/live/journal.svelte';
  import { resolveEpisodeAt, episodeEndEpochDay } from '$lib/data/regimenEpisode';
  import { fmtDay } from '$lib/data/dates';
  import { todayEpochDay, epochDayFromDateInputValue, dateInputValueFromEpochDay } from '$lib/data/epochDay';
  import { pauseReasonLabel } from '$lib/components/doseLabels';
  import type { PauseReason, RegimenEpisode } from '$lib/data/types';
  import Icon from '$lib/components/Icon.svelte';
  import EmptyState from '$lib/components/EmptyState.svelte';
  import Sheet from '$lib/components/Sheet.svelte';
  import Skeleton from '$lib/components/Skeleton.svelte';

  /* Ordered by start day (ties by insertion order) - the order
     resolveEpisodeAt and episodeEndEpochDay both require. */
  let episodesQuery = liveQuery(['regimen'], (j) => j.regimen.getEpisodes());
  let episodes = $derived(episodesQuery.value ?? []);
  let active = $derived(resolveEpisodeAt(episodes, Date.now()));

  /* The schedule and the pauses belong to an episode, so they are edited
     here beside it rather than on the dose log: the log holds events, this
     screen holds what an episode expects of them (phase 4 ticket 02). */
  let schedulesQuery = liveQuery(['dose'], (j) => j.doses.getSchedules());
  let pausesQuery = liveQuery(['dose'], (j) => j.doses.getPauses());
  let editorSchedule = $derived((schedulesQuery.value ?? []).find((s) => s.episodeId === editor?.id) ?? null);
  let editorPauses = $derived((pausesQuery.value ?? []).filter((p) => p.episodeId === editor?.id));

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

  let schedule = $state<{ everyNDays: string; dosesPerDay: string } | null>(null);
  let newPause = $state<{ start: string; end: string; reason: PauseReason } | null>(null);

  /* Re-seeded whenever the editor opens on a different episode, so the
     fields show that episode's schedule rather than the last one's. */
  $effect(() => {
    const id = editor?.id;
    if (!id) {
      schedule = null;
      newPause = null;
      return;
    }
    schedule = {
      everyNDays: String(editorSchedule?.everyNDays ?? 1),
      dosesPerDay: String(editorSchedule?.dosesPerDay ?? 1)
    };
    newPause = null;
  });

  async function saveSchedule() {
    if (!editor?.id || !schedule) return;
    const everyNDays = parseInt(schedule.everyNDays, 10);
    const dosesPerDay = parseInt(schedule.dosesPerDay, 10);
    if (!(everyNDays >= 1) || !(dosesPerDay >= 1)) return;
    await journal.doses.upsertSchedule({ episodeId: editor.id, everyNDays, dosesPerDay });
  }

  async function addPause() {
    if (!editor?.id || !newPause) return;
    const startEpochDay = epochDayFromDateInputValue(newPause.start);
    if (startEpochDay === null) return;
    await journal.doses.upsertPause({
      episodeId: editor.id,
      startEpochDay,
      // An empty end day is a pause that is still running, not a one-day one.
      endEpochDay: epochDayFromDateInputValue(newPause.end),
      reason: newPause.reason
    });
    newPause = null;
  }

  async function deletePause(id: string) {
    await journal.doses.deletePause(id);
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

  <div class="list-group" style="margin-bottom:var(--space-4)">
    <a class="list-row" href="/doses">
      <span class="row-icon"><Icon name="timeline" size={22} /></span>
      <span class="row-text">
        <span class="row-title">{m.regimen_doses_link()}</span>
        <span class="row-subtitle">{m.doses_row_sub()}</span>
      </span>
      <span class="row-trailing"><Icon name="chevronRight" size={20} /></span>
    </a>
  </div>

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
      {#if editor.id}
        <div class="field">
          <span class="field-label">{m.regimen_schedule_legend()}</span>
          <p class="muted small">{m.regimen_schedule_hint()}</p>
        </div>
        {#if schedule}
          <div class="cd-endpoints">
            <div class="field">
              <label class="field-label" for="regimen-every">{m.regimen_schedule_every_label()}</label>
              <input
                class="input"
                type="number"
                min="1"
                id="regimen-every"
                name="regimen-every"
                inputmode="numeric"
                bind:value={schedule.everyNDays}
              />
            </div>
            <div class="field">
              <label class="field-label" for="regimen-per-day">{m.regimen_schedule_per_day_label()}</label>
              <input
                class="input"
                type="number"
                min="1"
                id="regimen-per-day"
                name="regimen-per-day"
                inputmode="numeric"
                bind:value={schedule.dosesPerDay}
              />
            </div>
          </div>
          <button class="btn btn-soft" data-save-schedule onclick={saveSchedule}>
            <span>{m.regimen_schedule_save()}</span>
          </button>
        {/if}

        <div class="field" style="margin-top:var(--space-4)">
          <span class="field-label">{m.regimen_pauses_legend()}</span>
          <p class="muted small">{m.regimen_pauses_hint()}</p>
        </div>
        {#if editorPauses.length}
          <div class="list-group">
            {#each editorPauses as pause (pause.id)}
              <div class="list-row">
                <span class="row-text">
                  <span class="row-title">
                    {fmtDay(pause.startEpochDay, { day: 'numeric', month: 'short', year: 'numeric' })}
                    {pause.endEpochDay === null
                      ? `· ${m.regimen_pause_ongoing()}`
                      : `– ${fmtDay(pause.endEpochDay, { day: 'numeric', month: 'short', year: 'numeric' })}`}
                  </span>
                  <span class="row-subtitle">{pauseReasonLabel(pause.reason)}</span>
                </span>
                <button
                  class="icon-btn"
                  data-delete-pause={pause.id}
                  aria-label={m.regimen_pause_delete_aria({
                    from: fmtDay(pause.startEpochDay, { day: 'numeric', month: 'long', year: 'numeric' })
                  })}
                  onclick={() => deletePause(pause.id)}
                >
                  <Icon name="trash" size={18} />
                </button>
              </div>
            {/each}
          </div>
        {/if}
        {#if newPause}
          <div class="cd-endpoints">
            <div class="field">
              <label class="field-label" for="pause-start">{m.regimen_pause_start_label()}</label>
              <input class="input" type="date" id="pause-start" name="pause-start" bind:value={newPause.start} />
            </div>
            <div class="field">
              <label class="field-label" for="pause-end">{m.regimen_pause_end_label()}</label>
              <input class="input" type="date" id="pause-end" name="pause-end" bind:value={newPause.end} />
            </div>
          </div>
          <p class="muted small" style="margin:calc(-1 * var(--space-2)) 0 var(--space-3)">
            {m.regimen_pause_end_hint()}
          </p>
          <div class="field">
            <span class="field-label" id="pause-reason-label">{m.regimen_pause_reason_label()}</span>
            <div class="tag-row" role="group" aria-labelledby="pause-reason-label">
              {#each ['planned', 'accidental'] as const as reason (reason)}
                <button
                  type="button"
                  class="tag-chip"
                  class:is-selected={newPause.reason === reason}
                  aria-pressed={newPause.reason === reason}
                  data-pause-reason={reason}
                  onclick={() => newPause && (newPause.reason = reason)}
                >
                  {pauseReasonLabel(reason)}
                </button>
              {/each}
            </div>
          </div>
          <button class="btn btn-soft" data-add-pause onclick={addPause}><span>{m.regimen_pause_add()}</span></button>
        {:else}
          <button
            class="btn btn-ghost"
            data-new-pause
            onclick={() =>
              (newPause = { start: dateInputValueFromEpochDay(todayEpochDay()), end: '', reason: 'planned' })}
          >
            <span>{m.regimen_pause_add()}</span>
          </button>
        {/if}
      {/if}

      <div class="stack-3" style="margin-top:var(--space-4)">
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
