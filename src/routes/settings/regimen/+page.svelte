<script lang="ts">
  import { m } from '$lib/paraglide/messages';
  import { journal, liveQuery } from '$lib/data/live/journal.svelte';
  import { activeEpisodesAt } from '$lib/data/regimenEpisode';
  import { fmtDay } from '$lib/data/dates';
  import { todayEpochDay, epochDayFromDateInputValue, dateInputValueFromEpochDay } from '$lib/data/epochDay';
  import { pauseReasonLabel } from '$lib/data/vocabulary/doseLabels';
  import { vocabulary } from '$lib/data/vocabulary/vocabulary';
  import type { DoseScheduleRecurrence, PauseReason, RegimenEpisode, RegimenTemplate } from '$lib/data/types';
  import Icon from '$lib/components/Icon.svelte';
  import EmptyState from '$lib/components/EmptyState.svelte';
  import Sheet from '$lib/components/Sheet.svelte';
  import Skeleton from '$lib/components/Skeleton.svelte';

  let episodesQuery = liveQuery(['regimen'], (j) => j.regimen.getEpisodes());
  let episodes = $derived(episodesQuery.value ?? []);
  /* A set, not one episode (phase 5 ticket 38): more than one can be
     active at once for different drugs, and every one of them still gets
     the "current" badge below. */
  let activeIds = $derived(new Set(activeEpisodesAt(episodes, Date.now()).map((e) => e.id)));

  /* The schedule and the pauses belong to an episode, so they are edited
     here beside it rather than on the dose log: the log holds events, this
     screen holds what an episode expects of them (phase 4 ticket 02). */
  let schedulesQuery = liveQuery(['dose'], (j) => j.doses.getSchedules());
  let pausesQuery = liveQuery(['dose'], (j) => j.doses.getPauses());
  let editorSchedule = $derived((schedulesQuery.value ?? []).find((s) => s.episodeId === editor?.id) ?? null);
  let editorPauses = $derived((pausesQuery.value ?? []).filter((p) => p.episodeId === editor?.id));

  function rangeLabel(episode: RegimenEpisode): string {
    const start = fmtDay(episode.startEpochDay, { month: 'short', year: 'numeric' });
    const end = episode.endEpochDay === null ? m.regimen_ongoing() : fmtDay(episode.endEpochDay, { month: 'short', year: 'numeric' });
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
    /** `''` while the episode is still ongoing (types.ts's null). */
    endDate: string;
    hidden: boolean;
  } | null>(null);
  /* Offered above manual entry when adding a new episode (CONTEXT: "Regimen
     template") - picking one only pre-fills drug/ester/route in the editor
     below, never dose or interval. Editing an existing episode skips this
     and opens the editor directly. */
  let templatePicker = $state(false);

  function openEditor(episode: RegimenEpisode | null, template: RegimenTemplate | null = null) {
    templatePicker = false;
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
          endDate: episode.endEpochDay === null ? '' : dateInputValueFromEpochDay(episode.endEpochDay),
          hidden: episode.hidden
        }
      : {
          drug: template?.drug ?? '',
          ester: template?.ester ?? '',
          dose: '',
          doseUnit: '',
          route: template?.route ?? '',
          interval: '',
          startDate: dateInputValueFromEpochDay(todayEpochDay()),
          endDate: '',
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
      startEpochDay: epochDayFromDateInputValue(editor.startDate) ?? todayEpochDay(),
      endEpochDay: editor.endDate ? epochDayFromDateInputValue(editor.endDate) : null
    });
    editor = null;
  }

  /** The "end this episode" action (phase 5 ticket 38): sets today as the
      episode's end day, independent of any other episode starting - not a
      side effect of the general edit form above. */
  async function endEpisodeToday() {
    if (!editor?.id) return;
    const endEpochDay = todayEpochDay();
    await journal.regimen.endEpisode(editor.id, endEpochDay);
    editor = { ...editor, endDate: dateInputValueFromEpochDay(endEpochDay) };
  }

  /** Monday-first, matching `weekdayOfEpochDay` (epochDay.ts) and the
      calendar heat-map's own week. */
  const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6];

  let schedule = $state<{
    recurrenceKind: DoseScheduleRecurrence['kind'];
    everyNDays: string;
    weekdays: number[];
    dosesPerDay: string;
    doseAmounts: { dose: string; doseUnit: string }[];
  } | null>(null);
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
    const recurrence = editorSchedule?.recurrence ?? { kind: 'everyNDays' as const, everyNDays: 1 };
    schedule = {
      recurrenceKind: recurrence.kind,
      everyNDays: String(recurrence.kind === 'everyNDays' ? recurrence.everyNDays : 1),
      weekdays: recurrence.kind === 'weekdays' ? recurrence.weekdays : [],
      dosesPerDay: String(editorSchedule?.dosesPerDay ?? 1),
      doseAmounts: (editorSchedule?.doseAmounts ?? []).map((amount) => ({
        dose: String(amount.dose),
        doseUnit: amount.doseUnit
      }))
    };
    newPause = null;
  });

  function toggleWeekday(day: number) {
    if (!schedule) return;
    schedule.weekdays = schedule.weekdays.includes(day)
      ? schedule.weekdays.filter((d) => d !== day)
      : [...schedule.weekdays, day].sort((a, b) => a - b);
  }

  function addDoseAmount() {
    if (!schedule) return;
    schedule.doseAmounts = [...schedule.doseAmounts, { dose: '', doseUnit: editor?.doseUnit ?? '' }];
  }

  function removeDoseAmount(index: number) {
    if (!schedule) return;
    schedule.doseAmounts = schedule.doseAmounts.filter((_, i) => i !== index);
  }

  /* Every-N-days needs a positive step, weekdays needs at least one day, and
     doses-per-day has to be at least 1 either way: a schedule describing no
     rhythm at all is what expectedSlots refuses to invent one from
     (doseSchedule.ts). Checked here so the button can go dead rather than
     accepting a tap and doing nothing. An empty doseAmounts list is not a
     validation failure - it is "no amount tracked", same as before this
     field existed - so only a *non-empty* list with a bad row blocks saving. */
  let scheduleValues = $derived.by(() => {
    if (!schedule) return null;
    const dosesPerDay = parseInt(schedule.dosesPerDay, 10);
    const recurrence: DoseScheduleRecurrence =
      schedule.recurrenceKind === 'everyNDays'
        ? { kind: 'everyNDays', everyNDays: parseInt(schedule.everyNDays, 10) }
        : { kind: 'weekdays', weekdays: schedule.weekdays };
    const doseAmounts =
      schedule.doseAmounts.length > 0
        ? schedule.doseAmounts.map((amount) => ({ dose: parseFloat(amount.dose), doseUnit: amount.doseUnit.trim() }))
        : null;
    return { recurrence, dosesPerDay, doseAmounts };
  });
  let scheduleCanSave = $derived.by(() => {
    if (!scheduleValues) return false;
    const { recurrence, dosesPerDay, doseAmounts } = scheduleValues;
    if (isNaN(dosesPerDay) || dosesPerDay < 1) return false;
    if (recurrence.kind === 'everyNDays' && (isNaN(recurrence.everyNDays) || recurrence.everyNDays < 1)) return false;
    if (recurrence.kind === 'weekdays' && recurrence.weekdays.length === 0) return false;
    if (doseAmounts && doseAmounts.some((amount) => isNaN(amount.dose) || !amount.doseUnit)) return false;
    return true;
  });

  async function saveSchedule() {
    if (!editor?.id || !scheduleValues || !scheduleCanSave) return;
    await journal.doses.upsertSchedule({ episodeId: editor.id, ...scheduleValues });
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
      <button class="icon-btn" data-add aria-label={m.regimen_add_aria()} onclick={() => (templatePicker = true)}>
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
    <a class="list-row" href="/settings/stock">
      <span class="row-icon"><Icon name="package" size={22} /></span>
      <span class="row-text">
        <span class="row-title">{m.regimen_stock_link()}</span>
        <span class="row-subtitle">{m.regimen_stock_link_sub()}</span>
      </span>
      <span class="row-trailing"><Icon name="chevronRight" size={20} /></span>
    </a>
    <a class="list-row" href="/settings/exposure">
      <span class="row-icon"><Icon name="stats" size={22} /></span>
      <span class="row-text">
        <span class="row-title">{m.regimen_exposure_link()}</span>
        <span class="row-subtitle">{m.regimen_exposure_link_sub()}</span>
      </span>
      <span class="row-trailing"><Icon name="chevronRight" size={20} /></span>
    </a>
  </div>

  {#if episodesQuery.loading}
    <Skeleton variant="block" count={1} />
  {:else if episodes.length}
    <div class="list-group">
      {#each [...episodes].reverse() as episode (episode.id)}
        <button
          class="list-row"
          data-episode={episode.id}
          aria-label={m.regimen_row_aria({ drug: episode.drug, date: fmtDay(episode.startEpochDay, { day: 'numeric', month: 'long', year: 'numeric' }) })}
          onclick={() => openEditor(episode)}
        >
          <span class="row-text">
            <span class="row-title">
              {episode.drug}
              {#if activeIds.has(episode.id)}<span class="notice-warn" data-active-badge style="padding:2px 8px;border-radius:var(--radius-pill);font-size:var(--text-xs)">{m.regimen_active_badge()}</span>{/if}
              {#if episode.hidden}<span class="muted small">{m.regimen_hidden()}</span>{/if}
            </span>
            <span class="row-subtitle">
              {episode.dose} {episode.doseUnit} · {episode.route} · {episode.interval} · {rangeLabel(episode)}
            </span>
          </span>
          <Icon name="pencil" size={18} />
        </button>
      {/each}
    </div>
  {:else}
    <EmptyState title={m.regimen_empty_title()} text={m.regimen_empty_body()}>
      {#snippet action()}
        <button class="btn btn-soft" onclick={() => (templatePicker = true)}><span>{m.regimen_empty_action()}</span></button>
      {/snippet}
    </EmptyState>
  {/if}

  <Sheet
    open={templatePicker}
    title={m.regimen_template_sheet_title()}
    onClose={() => (templatePicker = false)}
  >
    <div class="stack-3">
      <button
        class="list-row template-row"
        data-own
        style="border:1.5px dashed var(--accent-border);border-radius:var(--radius-md)"
        onclick={() => openEditor(null, null)}
      >
        <span class="row-icon"><Icon name="pencil" size={20} /></span>
        <span class="row-text">
          <span class="row-title">{m.regimen_own_title()}</span>
          <span class="row-subtitle">{m.regimen_own_sub()}</span>
        </span>
      </button>
      {#each vocabulary.regimenTemplates as tp (tp.key)}
        <button
          class="list-row template-row"
          data-template={tp.key}
          style="background:var(--surface-2);border-radius:var(--radius-md)"
          onclick={() => openEditor(null, tp)}
        >
          <span class="row-icon"><Icon name="flask" size={20} /></span>
          <span class="row-text"><span class="row-title">{tp.name}</span></span>
          <Icon name="chevronRight" size={18} />
        </button>
      {/each}
    </div>
  </Sheet>

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
      <div class="cd-endpoints">
        <div class="field">
          <label class="field-label" for="regimen-start">{m.regimen_start_label()}</label>
          <input class="input" type="date" id="regimen-start" name="regimen-start" bind:value={editor.startDate} />
        </div>
        <div class="field">
          <label class="field-label" for="regimen-end">{m.regimen_end_label()}</label>
          <input class="input" type="date" id="regimen-end" name="regimen-end" bind:value={editor.endDate} />
        </div>
      </div>
      <p class="muted small" style="margin:calc(-1 * var(--space-2)) 0 var(--space-3)">{m.regimen_end_hint()}</p>
      {#if editor.id}
        <div class="field">
          <span class="field-label">{m.regimen_schedule_legend()}</span>
          <p class="muted small">{m.regimen_schedule_hint()}</p>
        </div>
        {#if schedule}
          <div class="field">
            <span class="field-label" id="schedule-kind-label">{m.regimen_schedule_kind_label()}</span>
            <div class="tag-row" role="group" aria-labelledby="schedule-kind-label">
              {#each ['everyNDays', 'weekdays'] as const as kind (kind)}
                <button
                  type="button"
                  class="tag-chip"
                  class:is-selected={schedule.recurrenceKind === kind}
                  aria-pressed={schedule.recurrenceKind === kind}
                  data-schedule-kind={kind}
                  onclick={() => schedule && (schedule.recurrenceKind = kind)}
                >
                  {kind === 'everyNDays' ? m.regimen_schedule_kind_every_days() : m.regimen_schedule_kind_weekdays()}
                </button>
              {/each}
            </div>
          </div>

          {#if schedule.recurrenceKind === 'everyNDays'}
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
          {:else}
            <div class="field">
              <span class="field-label" id="schedule-weekdays-label">{m.regimen_schedule_weekdays_label()}</span>
              <div class="tag-row" role="group" aria-labelledby="schedule-weekdays-label">
                {#each WEEKDAYS as day (day)}
                  <button
                    type="button"
                    class="tag-chip"
                    class:is-selected={schedule.weekdays.includes(day)}
                    aria-pressed={schedule.weekdays.includes(day)}
                    data-weekday={day}
                    onclick={() => toggleWeekday(day)}
                  >
                    {fmtDay(4 + day, { weekday: 'short' })}
                  </button>
                {/each}
              </div>
            </div>
          {/if}

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

          <div class="field" style="margin-top:var(--space-3)">
            <span class="field-label">{m.regimen_schedule_amounts_legend()}</span>
            <p class="muted small">{m.regimen_schedule_amounts_hint()}</p>
          </div>
          {#if schedule.doseAmounts.length}
            <div class="list-group">
              {#each schedule.doseAmounts as amount, index (index)}
                <div class="list-row">
                  <span class="row-text cd-endpoints">
                    <span class="field">
                      <input
                        class="input"
                        type="number"
                        inputmode="decimal"
                        data-amount-dose={index}
                        aria-label={m.dose_amount_label()}
                        bind:value={amount.dose}
                      />
                    </span>
                    <span class="field">
                      <input
                        class="input"
                        data-amount-unit={index}
                        aria-label={m.dose_unit_label()}
                        bind:value={amount.doseUnit}
                      />
                    </span>
                  </span>
                  <button
                    class="icon-btn"
                    data-delete-amount={index}
                    aria-label={m.regimen_schedule_amount_delete_aria({ index: index + 1 })}
                    onclick={() => removeDoseAmount(index)}
                  >
                    <Icon name="trash" size={18} />
                  </button>
                </div>
              {/each}
            </div>
          {/if}
          <button class="btn btn-ghost" data-add-amount onclick={addDoseAmount}>
            <span>{m.regimen_schedule_amount_add()}</span>
          </button>

          <button
            class="btn btn-soft"
            data-save-schedule
            disabled={!scheduleCanSave}
            onclick={saveSchedule}
            style="margin-top:var(--space-3)"
          >
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
          <button
            class="btn btn-soft"
            data-add-pause
            disabled={epochDayFromDateInputValue(newPause.start) === null}
            onclick={addPause}
          >
            <span>{m.regimen_pause_add()}</span>
          </button>
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
          {#if editor.endDate === ''}
            <button class="btn btn-ghost" data-end-episode onclick={endEpisodeToday}>
              <span>{m.regimen_end_action()}</span>
            </button>
          {/if}
          <button class="btn btn-ghost" data-toggle-hidden onclick={toggleHidden}>
            <span>{editor.hidden ? m.regimen_show_aria({ drug: editor.drug }) : m.regimen_hide_aria({ drug: editor.drug })}</span>
          </button>
        {/if}
      </div>
    {/if}
  </Sheet>
</div>
