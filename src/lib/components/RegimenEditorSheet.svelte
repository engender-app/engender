<script module lang="ts">
  import { journal } from '$lib/data/live/journal.svelte';
  import { toast } from '$lib/stores/toasts.svelte';
  import { m } from '$lib/paraglide/messages';
  import type { RegimenEpisode } from '$lib/data/types';

  /* Hiding is the episode's only removal (phase 4 ticket 01: hide, never
     delete). The toast carries the way back for anyone who tapped it by
     mistake. Module-level so the regimen screen's hidden list shows an
     episode again through the same words. */
  export async function setEpisodeHidden(episode: Pick<RegimenEpisode, 'id' | 'drug'>, hidden: boolean) {
    await journal.regimen.setEpisodeHidden(episode.id, hidden);
    if (hidden) {
      toast(m.regimen_hidden_toast({ drug: episode.drug }), {
        actionLabel: m.delete_undo(),
        onAction: () => void setEpisodeHidden(episode, false),
        kind: 'episode-hidden'
      });
    } else {
      toast(m.regimen_shown_toast({ drug: episode.drug }));
    }
  }
</script>

<script lang="ts">
  /* One regimen episode's editor sheet: its details, schedule, pauses,
     ending and hiding. Lifted out of the regimen screen so Care can open
     the same sheet in place from a medication block (prh12 bug 16) rather
     than sending the person to the list to tap the episode a second time. */
  import { offerUndo, undoable } from '$lib/stores/deleteUndo';
  import type { UndoableDelete } from '$lib/data/journal/undoableDelete';
  import { journalTextAutocomplete } from '$lib/platform';
  import { SvelteSet } from 'svelte/reactivity';
  import { sameDraft, snapshotDraft } from '$lib/components/kit/recordEditor';
  import { spanIsInverted } from '$lib/data/span';
  import DatePicker from '$lib/components/DatePicker.svelte';
  import { liveList } from '$lib/data/live/journal.svelte';
  import { inferDrugClass } from '$lib/data/drugClass';
  import { fmtDay } from '$lib/data/dates';
  import { todayEpochDay, epochDayFromDateInputValue, epochDayFromDateInputValueOrToday, dateInputValueFromEpochDay, dayRangeEndMin } from '$lib/data/epochDay';
  import {
    episodeEndReasonLabel,
    pauseReasonLabel,
    regimenIntervalLabel,
    regimenIntervalToStore,
    ROUTE_OPTIONS
  } from '$lib/data/vocabulary/doseLabels';
  import { MAX_DOSES_PER_DAY, canAutoLog, isExpectedDosesPerDay } from '$lib/data/doseSchedule';
  import { doseAutoSource } from '$lib/data/autoSource';
  import { defaultReminderTimes, isHandMadeReminderFor, reminderTimesOf, resizeReminderTimes } from '$lib/data/doseReminders';
  import TimePicker from '$lib/components/TimePicker.svelte';
  import type { DosePause, DoseScheduleRecurrence, DrugClass, EpisodeEndReason, PauseReason, RegimenTemplate } from '$lib/data/types';
  import Icon from '$lib/components/Icon.svelte';
  import LinkedDocuments from '$lib/components/LinkedDocuments.svelte';
  import Sheet from '$lib/components/Sheet.svelte';
  import DiscardSheet from '$lib/components/kit/DiscardSheet.svelte';
  import ConfirmDeleteSheet from '$lib/components/kit/ConfirmDeleteSheet.svelte';
  import { leaveGuard } from '$lib/components/kit/leaveGuard.svelte';
  import Switch from '$lib/components/Switch.svelte';
  import Field from '$lib/components/kit/Field.svelte';
  import FieldGroupHeading from '$lib/components/kit/FieldGroupHeading.svelte';
  import ListCard from '$lib/components/kit/ListCard.svelte';
  import { collapse, disclose } from '$lib/motion/reveal';
  import { activeFlag } from '$lib/theme/activeFlag.svelte';
  import { roleAt } from '$lib/theme/roles';

  let {
    /** Offer a way on to the whole regimen screen: set where the sheet is
        opened from somewhere other than that screen. */
    allEpisodesLink = false
  }: { allEpisodesLink?: boolean } = $props();

  // The episodes area's role, the one the regimen screen's list carries.
  const EDITOR_ROLE = 0;
  const longDay = (epochDay: number) => fmtDay(epochDay, { day: 'numeric', month: 'long', year: 'numeric' });

  const episodeClassLabel = (drugClass: DrugClass) =>
    drugClass === 'hrt' ? m.regimen_class_hrt() : m.regimen_class_other();

  /* The schedule and the pauses belong to an episode, so they are edited
     here beside it rather than on the dose log: the log holds events, this
     screen holds what an episode expects of them. */
  let schedulesQuery = liveList((j) => j.doses.getSchedules());
  let pausesQuery = liveList((j) => j.doses.getPauses());
  let editorSchedule = $derived((schedulesQuery.rows).find((s) => s.episodeId === editor?.id) ?? null);
  let editorPauses = $derived((pausesQuery.rows).filter((p) => p.episodeId === editor?.id));
  /* The schedule's reminders: the rows marked
     as derived from this episode, and the person's own reminders for its
     drug, which the schedule's first reminders replace. */
  let remindersQuery = liveList((j) => j.reminders.getReminders());

  let editor = $state<{
    id?: string;
    drug: string;
    drugClass: DrugClass;
    ester: string;
    dose: string;
    doseUnit: string;
    route: string;
    interval: string;
    /** The interval as the loaded episode stores it, which the field above
        shows through the catalogue (audit U50); null for a new episode. */
    storedInterval: string | null;
    startDate: string;
    /** `''` while the episode is still ongoing (types.ts's null). */
    endDate: string;
    /** Whatever the loaded episode already carries - preserved
        on a straight edit of the other fields, and only ever set to
        something new through `endEpisodeToday` below. */
    endReason: EpisodeEndReason | null;
  } | null>(null);
  /* Whether the drug class in the editor is the person's own pick. Until it is, a new episode's class follows what its drug infers to
     as it is typed; an episode already saved keeps its stored class. */
  let classChosen = $state(false);

  export function open(episode: RegimenEpisode | null, template: RegimenTemplate | null = null) {
    if (saving) return;
    schedule = null;
    scheduleBaseline = null;
    newPause = null;
    pendingEndReason = null;
    failure = null;
    status = null;
    classChosen = episode !== null;
    editor = episode
      ? {
          id: episode.id,
          drug: episode.drug,
          drugClass: episode.drugClass,
          ester: episode.ester ?? '',
          dose: String(episode.dose),
          doseUnit: episode.doseUnit,
          route: episode.route,
          interval: regimenIntervalLabel(episode.interval),
          storedInterval: episode.interval,
          startDate: dateInputValueFromEpochDay(episode.startEpochDay),
          endDate: episode.endEpochDay === null ? '' : dateInputValueFromEpochDay(episode.endEpochDay),
          endReason: episode.endReason
        }
      : {
          drug: template?.drug ?? '',
          drugClass: inferDrugClass(template?.drug ?? ''),
          ester: template?.ester ?? '',
          dose: '',
          doseUnit: '',
          route: template?.route ?? '',
          interval: '',
          storedInterval: null,
          startDate: dateInputValueFromEpochDay(todayEpochDay()),
          endDate: '',
          endReason: null
        };
    episodeBaseline = snapshotDraft(episodeSnapshot);
  }

  let schedule = $state<{
    recurrenceKind: DoseScheduleRecurrence['kind'];
    everyNDays: string;
    weekdays: number[];
    dosesPerDay: string;
    doseAmounts: { dose: string; doseUnit: string }[];
    /** The day auto-logging went on, or null for off. Held as
        the stored day rather than a boolean, so saving an already-on
        schedule keeps the day it started from instead of restarting it and
        reaching over the days in between. */
    autoLogFromEpochDay: number | null;
    /** Whether the schedule rings a reminder for each dose,
        and at what times - one per dose a day, resized as that count
        changes (`shownReminderTimes`). */
    remind: boolean;
    reminderTimes: string[];
  } | null>(null);
  /** The schedule's own reminders were seeded from the person's reminders
      for this drug, which saving replaces. Said under the switch. */
  let adoptingReminders = $state(false);
  let newPause = $state<{ start: string; end: string; reason: PauseReason } | null>(null);
  /* The dose amounts a person has been in and left, by amount, so an
     amount row added empty is not announced as invalid before anybody has
     typed in it (after-release 21, audit A11Y-14). Field.svelte does this
     for every other field; these two inputs are hand-rolled (see below). */
  const leftDose = new SvelteSet<object>();
  const leftUnit = new SvelteSet<object>();
  /** The reason chip picked before pressing "End episode" - not
      part of `editor` itself, since it names what is *about* to happen
      rather than what the loaded episode already carries. Optional: no
      chip picked stays a valid way to end an episode. */
  let pendingEndReason = $state<EpisodeEndReason | null>(null);

  let saving = $state(false);
  let failure = $state<string | null>(null);
  let status = $state<string | null>(null);
  let messageGroup = $state<'episode' | 'schedule' | 'pause' | 'end'>('episode');
  let episodeSnapshot = $derived(editor ? { ...editor, dose: String(editor.dose ?? '') } : null);
  let episodeBaseline = $state<typeof episodeSnapshot>(null);
  let scheduleSnapshot = $derived(schedule ? {
    ...schedule,
    everyNDays: String(schedule.everyNDays ?? ''),
    dosesPerDay: String(schedule.dosesPerDay ?? ''),
    doseAmounts: schedule.doseAmounts.map((amount) => ({ ...amount, dose: String(amount.dose ?? '') }))
  } : null);
  let scheduleBaseline = $state<typeof scheduleSnapshot>(null);
  let episodeChanged = $derived(!sameDraft(episodeSnapshot, episodeBaseline));
  let scheduleChanged = $derived(!sameDraft(scheduleSnapshot, scheduleBaseline));
  let changed = $derived(episodeChanged || scheduleChanged || newPause !== null || pendingEndReason !== null);
  let episodeRangeInverted = $derived(!!editor && spanIsInverted({
    startEpochDay: epochDayFromDateInputValueOrToday(editor.startDate),
    endEpochDay: epochDayFromDateInputValue(editor.endDate)
  }));
  let pauseRangeInverted = $derived(!!newPause && spanIsInverted({
    startEpochDay: epochDayFromDateInputValue(newPause.start),
    endEpochDay: epochDayFromDateInputValue(newPause.end)
  }));
  let episodeRequirements = $derived([
    ...(episodeRangeInverted ? [m.era_conflict_inverted()] : []),
    ...(!editor?.drug.trim() ? [m.regimen_drug_required()] : []),
    ...(!Number.isFinite(parseFloat(String(editor?.dose ?? ''))) ? [m.dose_amount_required()] : [])
  ]);

  /* The editor sheet's own close and a navigation away from the screen
     under it ask the same question (leaveGuard.ts). */
  const guard = leaveGuard({
    holding: () => editor !== null && changed,
    busy: () => editor !== null && saving,
    onDiscard: () => { editor = null; }
  });

  function requestDismiss(after: () => void = () => { editor = null; }) {
    guard.request(after);
  }

  $effect(() => {
    if (!editor) guard.keep();
  });

  async function write(group: typeof messageGroup, action: () => Promise<unknown>, failedMessage: string): Promise<boolean> {
    if (saving) return false;
    const draft = editor;
    messageGroup = group;
    saving = true;
    failure = null;
    status = null;
    try {
      await action();
      return editor === draft;
    } catch {
      if (editor === draft) failure = failedMessage;
      return false;
    } finally {
      saving = false;
    }
  }

  async function saveEpisode() {
    if (!editor || episodeRequirements.length || saving) return;
    const draft = editor;
    if (!await write('episode', () => journal.regimen.upsertEpisode({
      id: draft.id,
      drug: draft.drug.trim(),
      drugClass: draft.drugClass,
      ester: draft.ester.trim() || null,
      dose: parseFloat(String(draft.dose)),
      doseUnit: draft.doseUnit.trim(),
      route: draft.route.trim(),
      interval: regimenIntervalToStore(draft.interval, draft.storedInterval),
      startEpochDay: epochDayFromDateInputValueOrToday(draft.startDate),
      endEpochDay: draft.endDate ? epochDayFromDateInputValue(draft.endDate) : null,
      endReason: draft.endReason
    }), m.regimen_episode_save_failed())) return;
    episodeBaseline = snapshotDraft(episodeSnapshot);
    if (scheduleChanged) status = m.regimen_episode_saved_schedule_pending();
    else if (newPause || pendingEndReason) status = m.regimen_episode_saved_drafts_pending();
    else editor = null;
  }

  async function endEpisodeToday() {
    if (!editor?.id || saving) return;
    const id = editor.id;
    const endEpochDay = todayEpochDay();
    const endReason = pendingEndReason;
    if (!await write('end', () => journal.regimen.endEpisode(id, endEpochDay, endReason), m.regimen_end_failed())) return;
    editor.endDate = dateInputValueFromEpochDay(endEpochDay);
    editor.endReason = endReason;
    episodeBaseline = { ...episodeBaseline!, endDate: editor.endDate, endReason };
    pendingEndReason = null;
    status = m.regimen_ended();
  }

  /** Monday-first, matching `weekdayOfEpochDay` (epochDay.ts) and the
      calendar heat-map's own week. */
  const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6];

  // Seed once per opening. Live writes must not replace unrelated drafts.
  $effect(() => {
    if (!editor?.id || schedule || schedulesQuery.loading || schedulesQuery.failed) return;
    if (remindersQuery.loading || remindersQuery.failed) return;
    const recurrence = editorSchedule?.recurrence ?? { kind: 'everyNDays' as const, everyNDays: 1 };
    /* Which times the switch opens on: the schedule's own reminders; else
       the person's reminders for this drug, taken over on save; else, for a
       schedule not yet saved, the default times, switched on - a new
       schedule comes with its reminders. An existing schedule with neither
       stays off: it was saved without them. */
    const episodeId = editor.id;
    const drug = episodeBaseline?.drug ?? editor.drug;
    const own = remindersQuery.rows.filter((r) => r.autoSource === doseAutoSource(episodeId));
    const handMade = own.length ? [] : remindersQuery.rows.filter((r) => isHandMadeReminderFor(r, drug));
    const seeded = own.length ? own : handMade;
    adoptingReminders = handMade.length > 0;
    schedule = {
      recurrenceKind: recurrence.kind,
      everyNDays: String(recurrence.kind === 'everyNDays' ? recurrence.everyNDays : 1),
      weekdays: recurrence.kind === 'weekdays' ? [...recurrence.weekdays] : [],
      dosesPerDay: String(editorSchedule?.dosesPerDay ?? 1),
      doseAmounts: (editorSchedule?.doseAmounts ?? []).map((amount) => ({
        dose: String(amount.dose),
        doseUnit: amount.doseUnit
      })),
      autoLogFromEpochDay: editorSchedule?.autoLogFromEpochDay ?? null,
      remind: seeded.length > 0 || !editorSchedule,
      reminderTimes: seeded.length ? reminderTimesOf(seeded) : defaultReminderTimes(editorSchedule?.dosesPerDay ?? 1)
    };
    scheduleBaseline = snapshotDraft(scheduleSnapshot);
  });

  /* One time per dose a day. Read through the count so a field being
     typed into ("" on the way from 2 to 3) keeps the times it has. */
  let shownReminderTimes = $derived(schedule ? resizeReminderTimes(schedule.reminderTimes, Number(schedule.dosesPerDay)) : []);

  function setReminderTime(index: number, time: string) {
    if (!schedule) return;
    schedule.reminderTimes = shownReminderTimes.map((current, i) => (i === index ? time : current));
  }

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
    const dosesPerDay = Number(schedule.dosesPerDay);
    const recurrence: DoseScheduleRecurrence =
      schedule.recurrenceKind === 'everyNDays'
        ? { kind: 'everyNDays', everyNDays: Number(schedule.everyNDays) }
        : { kind: 'weekdays', weekdays: schedule.weekdays };
    const doseAmounts =
      schedule.doseAmounts.length > 0
        ? schedule.doseAmounts.map((amount) => ({ dose: parseFloat(String(amount.dose)), doseUnit: amount.doseUnit.trim() }))
        : null;
    return {
      recurrence,
      dosesPerDay,
      doseAmounts,
      autoLogFromEpochDay: schedule.autoLogFromEpochDay,
      reminderTimes: schedule.remind ? shownReminderTimes : []
    };
  });

  let scheduleRequirements = $derived.by(() => {
    if (!scheduleValues) return [];
    const { recurrence, dosesPerDay, doseAmounts, reminderTimes } = scheduleValues;
    return [
      ...(!isExpectedDosesPerDay(dosesPerDay) ? [m.regimen_per_day_required({ max: MAX_DOSES_PER_DAY })] : []),
      ...(recurrence.kind === 'everyNDays' && (!Number.isSafeInteger(recurrence.everyNDays) || recurrence.everyNDays < 1)
        ? [m.regimen_every_required()] : []),
      ...(recurrence.kind === 'weekdays' && recurrence.weekdays.length === 0 ? [m.regimen_weekday_required()] : []),
      ...(doseAmounts?.some((amount) => !Number.isFinite(amount.dose) || !amount.doseUnit)
        ? [m.regimen_amount_required()] : []),
      ...(reminderTimes.some((time) => !/^\d{2}:\d{2}$/.test(time)) ? [m.regimen_schedule_reminder_time_required()] : [])
    ];
  });
  let scheduleCanSave = $derived(scheduleValues !== null && scheduleRequirements.length === 0);

  /* Whether the auto-log switch is offered at all (ADR-0086):
     only where the fields in front of the person add up to something
     definite to write - a rhythm, an amount, and a route the dose log can
     record. Read off the schedule draft and the committed episode route, so the
     switch appears as soon as an amount is typed rather than one save later,
     and so it goes away again the moment the last amount is deleted. */
  let autoLogOffered = $derived(
    scheduleValues !== null && scheduleCanSave && canAutoLog(scheduleValues, episodeBaseline?.route ?? '', ROUTE_OPTIONS)
  );

  /* Turning it on dates the instruction today, so nothing is written for the
     days before the person asked for it. Turning it off clears the day and
     leaves every row already written exactly where it is: the switch is
     about what happens next, never a retraction of what was recorded.

     Saved on the spot rather than waiting for the schedule's own save
     button, because a standing instruction is a decision rather than a
     draft - and it carries the rest of the draft with it, so flipping the
     switch cannot save a day against a rhythm the person has since edited
     away from what is on screen. */
  async function toggleAutoLog(on: boolean) {
    if (!schedule || !editor?.id || !scheduleValues || !scheduleCanSave || saving) return;
    const values = { episodeId: editor.id, ...snapshotDraft(scheduleValues), autoLogFromEpochDay: on ? todayEpochDay() : null };
    if (!await write('schedule', () => journal.doses.upsertSchedule(values), m.regimen_schedule_save_failed())) return;
    schedule.autoLogFromEpochDay = values.autoLogFromEpochDay;
    scheduleBaseline = snapshotDraft(scheduleSnapshot);
    if (values.reminderTimes.length) adoptingReminders = false;
    status = on ? m.regimen_auto_log_on_saved() : m.regimen_auto_log_off_saved();
  }

  async function saveSchedule() {
    if (!editor?.id || !scheduleValues || !scheduleCanSave || saving) return;
    const values = { episodeId: editor.id, ...snapshotDraft(scheduleValues) };
    if (!await write('schedule', () => journal.doses.upsertSchedule(values), m.regimen_schedule_save_failed())) return;
    scheduleBaseline = snapshotDraft(scheduleSnapshot);
    if (values.reminderTimes.length) adoptingReminders = false;
    status = m.regimen_schedule_saved();
  }

  async function addPause() {
    if (!editor?.id || !newPause || pauseRangeInverted || saving) return;
    const startEpochDay = epochDayFromDateInputValue(newPause.start);
    if (startEpochDay === null) return;
    const values = {
      episodeId: editor.id,
      startEpochDay,
      endEpochDay: epochDayFromDateInputValue(newPause.end),
      reason: newPause.reason
    };
    if (!await write('pause', () => journal.doses.upsertPause(values), m.regimen_pause_save_failed())) return;
    newPause = null;
    status = m.regimen_pause_saved();
  }

  /* A pause goes back to expecting doses on its days once it is deleted,
     so the trash button asks first, over the editor (after-release 07).
     What it did is said in a toast rather than the editor's status line:
     the line arrived at full height and full ink in one frame, while the
     row above it was still closing. */
  let pauseDeleteTarget = $state<DosePause | null>(null);

  async function deletePause() {
    const target = pauseDeleteTarget;
    if (!target) return;
    pauseDeleteTarget = null;
    let deletion: UndoableDelete | undefined;
    if (!await write('pause', async () => { deletion = await undoable((j) => j.doses.deletePause(target.id)); }, m.regimen_pause_delete_failed())) return;
    offerUndo(deletion!, m.regimen_pause_deleted());
  }

  function hideEditedEpisode() {
    if (!editor?.id || saving) return;
    const episode = { id: editor.id, drug: episodeBaseline?.drug ?? editor.drug };
    requestDismiss(() => {
      editor = null;
      void setEpisodeHidden(episode, true);
    });
  }
</script>

{#snippet feedback(group: typeof messageGroup)}
  {#if messageGroup === group}
    {#if failure}<p class="notice notice-danger" role="alert" data-regimen-failure transition:collapse>{failure}</p>{/if}
    <p class="muted small" role="status" data-regimen-status>{status ?? ''}</p>
  {/if}
{/snippet}

<Sheet open={editor !== null} title={editor?.id ? m.regimen_edit_sheet() : m.regimen_new_sheet()} onRequestClose={() => requestDismiss()}>
  {#if editor}
    <fieldset class="regimen-editor" disabled={saving} aria-busy={saving}>
      <section class="regimen-group">
        <!-- No hint restating what Save episode does: the line under the
             heading already says whether these details have unsaved
             changes, and the button names what it saves (audit UX-13). -->
        <FieldGroupHeading legend={m.regimen_episode_legend()} />
        <p class="muted small" data-episode-dirty>{episodeChanged ? m.regimen_episode_unsaved() : m.regimen_episode_unchanged()}</p>
        <Field label={m.drug_label()} id="regimen-drug">
          {#snippet children(id, _hint, touched)}
            <input autocomplete={journalTextAutocomplete()} class="input" {id} name="regimen-drug" placeholder={m.regimen_drug_placeholder()} aria-invalid={touched && !editor!.drug.trim()} aria-describedby="regimen-episode-requirements" bind:value={editor!.drug} oninput={() => { if (!classChosen) editor!.drugClass = inferDrugClass(editor!.drug); }} />
          {/snippet}
        </Field>
        <Field label={m.regimen_class_label()} hint={m.regimen_class_hint()} legend>
          {#snippet children(id, hint)}
            <div class="tag-row" role="group" aria-labelledby={id} aria-describedby={hint}>
              {#each ['hrt', 'other'] as const as drugClass (drugClass)}
                <button
                  type="button"
                  class="tag-chip"
                  class:is-selected={editor!.drugClass === drugClass}
                  aria-pressed={editor!.drugClass === drugClass}
                  data-drug-class={drugClass}
                  onclick={() => { editor!.drugClass = drugClass; classChosen = true; }}
                >
                  {episodeClassLabel(drugClass)}
                </button>
              {/each}
            </div>
          {/snippet}
        </Field>
        <Field label={m.regimen_ester_label()} id="regimen-ester">
          {#snippet children(id)}
            <input autocomplete={journalTextAutocomplete()} class="input" {id} name="regimen-ester" placeholder={m.regimen_ester_placeholder()} bind:value={editor!.ester} />
          {/snippet}
        </Field>
        <div class="cd-endpoints">
          <Field label={m.dose_label()} id="regimen-dose">
            {#snippet children(id, _hint, touched)}
              <input class="input" type="number" {id} name="regimen-dose" placeholder={m.dose_amount_placeholder()} inputmode="decimal" aria-invalid={touched && !Number.isFinite(parseFloat(String(editor!.dose)))} aria-describedby="regimen-episode-requirements" bind:value={editor!.dose} />
            {/snippet}
          </Field>
          <Field label={m.unit_label()} id="regimen-dose-unit">
            {#snippet children(id)}
              <input autocomplete={journalTextAutocomplete()} class="input" {id} name="regimen-dose-unit" placeholder={m.dose_unit_placeholder()} bind:value={editor!.doseUnit} />
            {/snippet}
          </Field>
        </div>
        <Field label={m.route_label()} id="regimen-route">
          {#snippet children(id)}
            <input autocomplete={journalTextAutocomplete()} class="input" {id} name="regimen-route" placeholder={m.regimen_route_placeholder()} bind:value={editor!.route} />
          {/snippet}
        </Field>
        <Field label={m.regimen_interval_label()} id="regimen-interval">
          {#snippet children(id)}
            <input autocomplete={journalTextAutocomplete()} class="input" {id} name="regimen-interval" placeholder={m.regimen_interval_placeholder()} bind:value={editor!.interval} />
          {/snippet}
        </Field>
        <div class="cd-endpoints">
          <Field label={m.regimen_start_label()} id="regimen-start">
            {#snippet children(id)}
              <DatePicker name="regimen-start" bind:value={editor!.startDate} {id} />
            {/snippet}
          </Field>
          <Field label={m.regimen_end_label()} id="regimen-end">
            {#snippet children(id)}
              <DatePicker name="regimen-end" min={dayRangeEndMin(editor!.startDate)} bind:value={editor!.endDate} {id} aria-invalid={episodeRangeInverted || undefined} describedBy={episodeRangeInverted ? "regimen-episode-requirements" : undefined} />
            {/snippet}
          </Field>
        </div>
        <p class="muted small" style="margin:calc(-1 * var(--space-2)) 0 var(--space-3)">{m.regimen_end_hint()}</p>
        <div id="regimen-episode-requirements" class="muted small" aria-live="polite">
          {#each episodeRequirements as requirement (requirement)}<p transition:collapse>{requirement}</p>{/each}
        </div>
        <button class="btn btn-primary" data-save-regimen disabled={episodeRequirements.length > 0} onclick={saveEpisode}>
          <span>{m.regimen_save()}</span>
        </button>
        {@render feedback('episode')}
      </section>
      {#if !editor.id}<p class="muted small">{m.regimen_schedule_after_episode()}</p>{/if}
      {#if editor.id}
        <section class="regimen-group">
          <FieldGroupHeading legend={m.schedule_title()} hint={m.regimen_schedule_hint()} />
          <p class="muted small" data-schedule-dirty>{scheduleChanged ? m.regimen_schedule_unsaved() : m.regimen_schedule_unchanged()}</p>
          {#if schedule}
            <div class="disclosed" transition:disclose>
              <Field label={m.regimen_schedule_kind_label()} legend>
                {#snippet children(id)}
                  <div class="tag-row" role="group" aria-labelledby={id}>
                    {#each ['everyNDays', 'weekdays'] as const as kind (kind)}
                      <button
                        type="button"
                        class="tag-chip"
                        class:is-selected={schedule!.recurrenceKind === kind}
                        aria-pressed={schedule!.recurrenceKind === kind}
                        data-schedule-kind={kind}
                        onclick={() => schedule && (schedule.recurrenceKind = kind)}
                      >
                        {kind === 'everyNDays' ? m.regimen_schedule_kind_every_days() : m.regimen_schedule_kind_weekdays()}
                      </button>
                    {/each}
                  </div>
                {/snippet}
              </Field>

              {#if schedule.recurrenceKind === 'everyNDays'}
                <Field label={m.regimen_schedule_every_label()} id="regimen-every">
                  {#snippet children(id, _hint, touched)}
                    <input
                      class="input"
                      type="number"
                      min="1"
                      {id}
                      name="regimen-every"
                      aria-invalid={touched && (!Number.isSafeInteger(Number(schedule!.everyNDays)) || Number(schedule!.everyNDays) < 1)}
                      aria-describedby="regimen-schedule-requirements"
                      inputmode="numeric"
                      bind:value={schedule!.everyNDays}
                    />
                  {/snippet}
                </Field>
              {:else}
                <Field label={m.regimen_schedule_weekdays_label()} legend>
                  {#snippet children(id)}
                    <div class="tag-row" role="group" aria-labelledby={id}>
                      {#each WEEKDAYS as day (day)}
                        <button
                          type="button"
                          class="tag-chip"
                          class:is-selected={schedule!.weekdays.includes(day)}
                          aria-pressed={schedule!.weekdays.includes(day)}
                          data-weekday={day}
                          onclick={() => toggleWeekday(day)}
                        >
                          {fmtDay(4 + day, { weekday: 'short' })}
                        </button>
                      {/each}
                    </div>
                  {/snippet}
                </Field>
              {/if}

              <Field label={m.regimen_schedule_per_day_label()} id="regimen-per-day">
                {#snippet children(id, _hint, touched)}
                  <input
                    class="input"
                    type="number"
                    min="1"
                    max={MAX_DOSES_PER_DAY}
                    {id}
                    name="regimen-per-day"
                    aria-invalid={touched && !isExpectedDosesPerDay(Number(schedule!.dosesPerDay))}
                    aria-describedby="regimen-schedule-requirements"
                    inputmode="numeric"
                    bind:value={schedule!.dosesPerDay}
                  />
                {/snippet}
              </Field>

              <!-- The schedule's reminders: one
                   time per dose a day, saved with the rhythm above and
                   rung on its days. The times open under the switch the
                   way the auto-log switch's own text does, and each row
                   opens or closes its height as the count changes. -->
              <div data-schedule-remind>
                <Field label={m.regimen_schedule_reminders_label()} legend spread>
                  {#snippet children()}
                    <Switch
                      checked={schedule!.remind}
                      label={m.regimen_schedule_reminders_label()}
                      onChange={(on) => schedule && (schedule.remind = on)}
                    />
                  {/snippet}
                </Field>
                <p class="muted small" style="margin:calc(-1 * var(--space-2)) 0 var(--space-3)">
                  {m.regimen_schedule_reminders_hint()}
                </p>
              </div>
              {#if schedule.remind}
                <div class="disclosed" data-schedule-reminder-times transition:disclose>
                  {#if adoptingReminders}
                    <!-- Goes once the save has taken the reminders over, by
                         closing its height rather than in one frame. -->
                    <div class="disclosed" transition:disclose>
                      <p class="muted small" data-schedule-reminders-adopt>{m.regimen_schedule_reminders_adopt()}</p>
                    </div>
                  {/if}
                  {#each shownReminderTimes as time, index (index)}
                    <!-- `.disclosed` (flow-root) keeps the field's own
                         margin inside the height that animates: without
                         it the margin collapsed through and the content
                         below jumped 16 px in the frame the row arrived. -->
                    <div class="disclosed" transition:disclose>
                      <Field
                        label={shownReminderTimes.length > 1 ? m.regimen_schedule_reminder_dose_label({ number: index + 1 }) : m.time_label()}
                        spread
                      >
                        {#snippet children(id)}
                          <TimePicker
                            {id}
                            name="regimen-reminder-{index}"
                            style="max-width:160px"
                            required
                            value={time}
                            onchange={(next) => setReminderTime(index, next)}
                            data-reminder-time={index}
                          />
                        {/snippet}
                      </Field>
                    </div>
                  {/each}
                </div>
              {/if}

              <FieldGroupHeading legend={m.regimen_schedule_amounts_legend()} hint={m.regimen_schedule_amounts_hint()} />
              {#if schedule.doseAmounts.length}
                <ListCard role={roleAt(activeFlag.roles, EDITOR_ROLE)}>
                  {#each schedule.doseAmounts as amount, index (index)}
                    <!-- Hand-rolled rather than `<ListRow static>`:
                         the row's text is a pair of bound inputs under the
                         screen's own two-column class, not a title and a
                         subtitle.

                         The two `.field` spans stay hand-written rather than
                         Field.svelte: Field renders a div, and a
                         div inside this row's `<span class="kit-row-text">`
                         is content a span can't hold. Each already carries a
                         real aria-label of its own. -->
                    <div class="kit-row is-static">
                      <span class="kit-row-text cd-endpoints">
                        <span class="field">
                          <input
                            class="input"
                            type="number"
                            inputmode="decimal"
                            data-amount-dose={index}
                            aria-label={m.dose_label()}
                            onblur={() => leftDose.add(amount)}
                            aria-invalid={leftDose.has(amount) && !Number.isFinite(parseFloat(String(amount.dose)))}
                            aria-describedby="regimen-schedule-requirements"
                            bind:value={amount.dose}
                          />
                        </span>
                        <span class="field">
                          <input autocomplete={journalTextAutocomplete()}
                            class="input"
                            data-amount-unit={index}
                            aria-label={m.unit_label()}
                            onblur={() => leftUnit.add(amount)}
                            aria-invalid={leftUnit.has(amount) && !amount.doseUnit.trim()}
                            aria-describedby="regimen-schedule-requirements"
                            bind:value={amount.doseUnit}
                          />
                        </span>
                      </span>
                      <button
                        class="kit-row-act press"
                        data-delete-amount={index}
                        aria-label={m.regimen_schedule_amount_delete_aria({ index: index + 1 })}
                        onclick={() => removeDoseAmount(index)}
                      >
                        <Icon name="trash" size={18} />
                      </button>
                    </div>
                  {/each}
                </ListCard>
              {/if}
              <button class="btn btn-ghost press" data-add-amount onclick={addDoseAmount}>
                <span>{m.regimen_schedule_amount_add()}</span>
              </button>

              <div id="regimen-schedule-requirements" class="muted small" aria-live="polite">
                {#each scheduleRequirements as requirement (requirement)}<p>{requirement}</p>{/each}
              </div>
              <button
                class="btn btn-primary"
                aria-describedby="regimen-schedule-requirements"
                data-save-schedule
                disabled={!scheduleCanSave}
                onclick={saveSchedule}
              >
                <span>{m.save_schedule()}</span>
              </button>

              <!-- The standing instruction (ADR-0086). Under the
                   save button rather than among the fields above it: those
                   describe the rhythm and are saved together, this one is a
                   decision about what the app does with that rhythm and takes
                   effect the moment it is flipped. Absent entirely where the
                   schedule has nothing definite to write, the same way the
                   whole block is absent on an unsaved episode. -->
              {#if autoLogOffered}
                <div class="disclosed" data-auto-log-switch transition:disclose>
                  <Field label={m.regimen_auto_log_label()} legend spread>
                    {#snippet children()}
                      <Switch
                        checked={schedule!.autoLogFromEpochDay !== null}
                        disabled={saving}
                        label={m.regimen_auto_log_label()}
                        onChange={toggleAutoLog}
                      />
                    {/snippet}
                  </Field>
                  <p class="muted small" style="margin:calc(-1 * var(--space-2)) 0 var(--space-3)">
                    {m.regimen_auto_log_save_hint()}
                    {m.regimen_auto_log_hint()}
                  </p>
                </div>
              {/if}
            </div>
          {/if}

          {@render feedback('schedule')}
        </section>
        <section class="regimen-group">
          <FieldGroupHeading legend={m.regimen_pauses_legend()} hint={m.regimen_pauses_hint()} />
          <p class="muted small">{m.regimen_pause_immediate_hint()}</p>
          {#if editorPauses.length}
            <div transition:collapse>
              <ListCard role={roleAt(activeFlag.roles, EDITOR_ROLE)}>
                {#each editorPauses as pause (pause.id)}
                  <!-- Hand-rolled rather than ListRow's action/is-split shape:
that shape always renders the main span as a
                       button or a link, and this one names nothing to press -
                       it only states a pause. Routing it through would add
                       .kit-row-main's :active wash and a tab stop to text that
                       does nothing when pressed. -->
                  <div class="kit-row is-split" transition:collapse>
                    <span class="kit-row-main">
                      <span class="kit-row-title">
                        {fmtDay(pause.startEpochDay, { day: 'numeric', month: 'short', year: 'numeric' })}
                        {pause.endEpochDay === null
                          ? `· ${m.regimen_pause_ongoing()}`
                          : `– ${fmtDay(pause.endEpochDay, { day: 'numeric', month: 'short', year: 'numeric' })}`}
                      </span>
                      <span class="kit-row-sub">{pauseReasonLabel(pause.reason)}</span>
                    </span>
                    <button
                      class="kit-row-act press"
                      data-delete-pause={pause.id}
                      aria-label={m.regimen_pause_delete_aria({ from: longDay(pause.startEpochDay) })}
                      onclick={() => (pauseDeleteTarget = pause)}
                    >
                      <Icon name="trash" size={18} />
                    </button>
                  </div>
                {/each}
              </ListCard>
            </div>
          {/if}
          {#if newPause}
            <div class="cd-endpoints">
              <Field label={m.range_from_label()} id="pause-start">
                {#snippet children(id)}
                  <DatePicker name="pause-start" bind:value={newPause!.start} {id} />
                {/snippet}
              </Field>
              <Field label={m.range_to_label()} id="pause-end">
                {#snippet children(id)}
                  <DatePicker name="pause-end" min={dayRangeEndMin(newPause!.start)} bind:value={newPause!.end} {id} aria-invalid={pauseRangeInverted || undefined} describedBy={pauseRangeInverted ? "regimen-pause-requirements" : undefined} />
                {/snippet}
              </Field>
            </div>
            <p class="muted small" style="margin:calc(-1 * var(--space-2)) 0 var(--space-3)">
              {m.regimen_pause_end_hint()}
            </p>
            <Field label={m.regimen_pause_reason_label()} legend>
              {#snippet children(id)}
                <div class="tag-row" role="group" aria-labelledby={id}>
                  {#each ['planned', 'accidental'] as const as reason (reason)}
                    <button
                      type="button"
                      class="tag-chip"
                      class:is-selected={newPause!.reason === reason}
                      aria-pressed={newPause!.reason === reason}
                      data-pause-reason={reason}
                      onclick={() => newPause && (newPause.reason = reason)}
                    >
                      {pauseReasonLabel(reason)}
                    </button>
                  {/each}
                </div>
              {/snippet}
            </Field>
            <div aria-live="polite">
              {#if epochDayFromDateInputValue(newPause.start) === null || pauseRangeInverted}
                <p class="muted small" id="regimen-pause-requirements" transition:collapse>{pauseRangeInverted ? m.era_conflict_inverted() : m.regimen_pause_start_required()}</p>
              {/if}
            </div>
            <button
              class="btn btn-soft"
              data-add-pause
              aria-describedby={epochDayFromDateInputValue(newPause.start) === null || pauseRangeInverted ? "regimen-pause-requirements" : undefined}
              disabled={epochDayFromDateInputValue(newPause.start) === null || pauseRangeInverted}
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
          {@render feedback('pause')}
        </section>
      {/if}
      {#if editor.id}
        <section class="regimen-group">
          {#if editor.endDate === ''}
          <FieldGroupHeading legend={m.regimen_end_action()} hint={m.regimen_end_immediate_hint()} />
          <Field label={m.regimen_pause_reason_label()} legend>
            {#snippet children(id)}
              <div class="tag-row" role="group" aria-labelledby={id}>
                {#each ['switchedDrugOrRoute', 'pausedForNow', 'decidedToStop'] as const as reason (reason)}
                  <button
                    type="button"
                    class="tag-chip"
                    class:is-selected={pendingEndReason === reason}
                    aria-pressed={pendingEndReason === reason}
                    data-end-reason={reason}
                    onclick={() => (pendingEndReason = pendingEndReason === reason ? null : reason)}
                  >
                    {episodeEndReasonLabel(reason)}
                  </button>
                {/each}
              </div>
            {/snippet}
          </Field>
          <button class="btn btn-ghost" data-end-episode onclick={endEpisodeToday}>
            <span>{m.regimen_end_action()}</span>
          </button>
          {/if}
          {@render feedback('end')}
        </section>
        <section class="regimen-group">
          <FieldGroupHeading legend={m.regimen_hide_legend()} hint={m.regimen_hide_hint()} />
          <button class="btn btn-ghost" data-hide-episode onclick={hideEditedEpisode}>
            <span>{m.regimen_hide_action()}</span>
          </button>
        </section>
      {/if}

      {#if editor.id}
        <!-- The target's own screen lists the documents pointing at it
             (ADR-0065); the episode stores nothing about the
             link. -->
        <LinkedDocuments kind="episode" id={editor.id} />
      {/if}

    </fieldset>
    <button class="btn btn-ghost" data-close-regimen disabled={saving} onclick={() => requestDismiss()}>
      <span>{m.regimen_close()}</span>
    </button>
    {#if allEpisodesLink}
      <a class="btn btn-ghost" data-all-regimen-episodes href="/care/regimen">
        <span>{m.regimen_all_episodes()}</span>
      </a>
    {/if}
  {/if}
</Sheet>
<DiscardSheet {guard} />
<ConfirmDeleteSheet
  open={pauseDeleteTarget !== null}
  title={m.regimen_pause_delete_sheet()}
  question={pauseDeleteTarget ? m.regimen_pause_delete_q({ from: longDay(pauseDeleteTarget.startEpochDay) }) : ''}
  hint={m.regimen_pause_delete_hint()}
  confirmLabel={m.regimen_pause_delete_sheet()}
  cancelLabel={m.keep_it()}
  confirmAttrs={{ 'data-confirm-delete-pause': '' }}
  onConfirm={deletePause}
  onCancel={() => (pauseDeleteTarget = null)}
/>

<style>
  .regimen-editor {
    container: regimen / inline-size;
    border: 0;
    padding: 0;
    margin: 0;
    min-width: 0;
  }

  .regimen-group + .regimen-group {
    margin-top: var(--space-6);
    padding-top: var(--space-5);
    border-top: 1px solid var(--hairline);
  }

  @container regimen (max-width: 18rem) {
    .regimen-editor :global(.cd-endpoints) {
      grid-template-columns: 1fr;
    }
  }

  /* Short values in a wide field read as adrift rather than centred on it -
     "2" and "mg" sitting flush against the field's left edge with most of
     its width empty beside them (Alicja, 2026-08-27). */
  [data-amount-dose],
  [data-amount-unit] {
    text-align: center;
  }

  /* The schedule section opens inside `.disclosed` (components.css), which
     is a plain flow-root wrapper with no spacing of its own - every field
     in it carries its own `margin-bottom` and self-spaces, but the dose
     amounts list is a ListCard, which does not, so it sat flush against
     "Add an amount" beneath it with nothing between them (Alicja,
     2026-08-27: "the buttons row below is too close to the list's end").
     `--space-4` matches what `.field`'s own margin already gives every
     other pair of rows in this same disclosed block. */
  .disclosed :global(.kit-list) {
    margin-bottom: var(--space-4);
  }
</style>
