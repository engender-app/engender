<script lang="ts">
  import { page } from '$app/state';
  import { sameDraft, snapshotDraft } from '$lib/components/kit/recordEditor';
  import SourceRecordHandoff from '$lib/components/SourceRecordHandoff.svelte';
  /* What you are taking, and since when, on the surface kit (phase 5 UX
     ticket 25).

     The dose log used to sit above the regimen alongside two other links -
     the stock projection and the exposure counters - as a list-group
     indistinguishable from the one holding the episodes. Ticket 09
     (ADR-0084) moved medication records off Settings and onto Care: the
     stock editor is a sheet off Care's own regimen block now, and the
     exposure counters' one useful figure is that block's own dose-total
     line, so this screen keeps only the one link still worth naming
     here. */
  import { m } from '$lib/paraglide/messages';
  import DatePicker from '$lib/components/DatePicker.svelte';
  import { journal, liveList } from '$lib/data/live/journal.svelte';
  import { activeEpisodesAt } from '$lib/data/regimenEpisode';
  import { cycleTrackingVisible, testosteroneActive } from '$lib/data/cycleTracking';
  import { prefs } from '$lib/data/prefs/store.svelte';
  import { fmtDay } from '$lib/data/dates';
  import { todayEpochDay, epochDayFromDateInputValue, epochDayFromDateInputValueOrToday, dateInputValueFromEpochDay } from '$lib/data/epochDay';
  import { episodeEndReasonLabel, pauseReasonLabel, ROUTE_OPTIONS } from '$lib/data/vocabulary/doseLabels';
  import { canAutoLog } from '$lib/data/doseSchedule';
  import { vocabulary } from '$lib/data/vocabulary/vocabulary';
  import type { DosePause, DoseScheduleRecurrence, EpisodeEndReason, PauseReason, RegimenEpisode, RegimenTemplate } from '$lib/data/types';
  import Icon from '$lib/components/Icon.svelte';
  import LinkedDocuments from '$lib/components/LinkedDocuments.svelte';
  import ScreenHeader from '$lib/components/ScreenHeader.svelte';
  import Sheet from '$lib/components/Sheet.svelte';
  import DiscardSheet from '$lib/components/kit/DiscardSheet.svelte';
  import ConfirmDeleteSheet from '$lib/components/kit/ConfirmDeleteSheet.svelte';
  import SectionHeading from '$lib/components/kit/SectionHeading.svelte';
  import { toast } from '$lib/stores/toasts.svelte';
  import { leaveGuard } from '$lib/components/kit/leaveGuard.svelte';
  import Switch from '$lib/components/Switch.svelte';
  import BatchedList from '$lib/components/kit/BatchedList.svelte';
  import Field from '$lib/components/kit/Field.svelte';
  import FieldGroupHeading from '$lib/components/kit/FieldGroupHeading.svelte';
  import ListCard from '$lib/components/kit/ListCard.svelte';
  import ListRow from '$lib/components/kit/ListRow.svelte';
  import Notice from '$lib/components/kit/Notice.svelte';
  import { collapse, crossfade, disclose } from '$lib/motion/reveal';
  import { hashRowId, scrollToHash } from '$lib/navigation/scroll-region';
  import { activeFlag } from '$lib/theme/activeFlag.svelte';
  import { roleAt } from '$lib/theme/roles';
  import ReadGate from '$lib/components/kit/ReadGate.svelte';

  /* Two areas: what is being taken, and the three screens that read the
     dose log from other angles. */
  const SECTION_ROLE = { episodes: 0, elsewhere: 1 };

  let episodesQuery = liveList((j) => j.regimen.getEpisodes());
  let episodes = $derived(episodesQuery.rows);
  /* Put away by mistake or as a duplicate (after-release 07): out of every
     read but this one, which is the way back. Newest first, like the list
     above it. */
  let hiddenQuery = liveList((j) => j.regimen.getHiddenEpisodes());
  let hiddenEpisodes = $derived([...hiddenQuery.rows].reverse());
  /* Newest first, the same order the rows render in - and what
     `deepLinkedEpisodeIndex` below resolves a hash's id against, since
     BatchedList's `focusIndex` names a position in this exact array. */
  let orderedEpisodes = $derived([...episodes].reverse());
  /* A set, not one episode (phase 5 ticket 38): more than one can be
     active at once for different drugs, and every one of them still gets
     the "current" badge below. */
  let activeIds = $derived(new Set(activeEpisodesAt(episodes, Date.now()).map((e) => e.id)));

  /* The clinician summary links an episode across a hash (phase 8 features
     ticket 67) - read once, the same "one visit to one screen" rule
     BatchedList's own `path` follows. */
  let sourceId = $derived(page.url.searchParams.get('episode'));
  let sourceEpisode = $derived(episodes.find((episode) => episode.id === sourceId));
  let deepLinkedEpisodeId = $derived(sourceId ?? hashRowId(page.url.hash));
  let deepLinkedEpisodeIndex = $derived(
    deepLinkedEpisodeId ? orderedEpisodes.findIndex((episode) => episode.id === deepLinkedEpisodeId) : -1
  );

  /* The schedule and the pauses belong to an episode, so they are edited
     here beside it rather than on the dose log: the log holds events, this
     screen holds what an episode expects of them (phase 4 ticket 02). */
  let schedulesQuery = liveList((j) => j.doses.getSchedules());
  let pausesQuery = liveList((j) => j.doses.getPauses());
  let editorSchedule = $derived((schedulesQuery.rows).find((s) => s.episodeId === editor?.id) ?? null);
  let editorPauses = $derived((pausesQuery.rows).filter((p) => p.episodeId === editor?.id));

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
    /** Whatever the loaded episode already carries (ticket 43) - preserved
        on a straight edit of the other fields, and only ever set to
        something new through `endEpisodeToday` below. */
    endReason: EpisodeEndReason | null;
  } | null>(null);
  /* Offered above manual entry when adding a new episode (CONTEXT: "Regimen
     template") - picking one only pre-fills drug/ester/route in the editor
     below, never dose or interval. Editing an existing episode skips this
     and opens the editor directly. */
  let templatePicker = $state(false);

  function openEditor(episode: RegimenEpisode | null, template: RegimenTemplate | null = null) {
    if (saving) return;
    templatePicker = false;
    schedule = null;
    scheduleBaseline = null;
    newPause = null;
    pendingEndReason = null;
    failure = null;
    status = null;
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
          endReason: episode.endReason
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
    /** The day auto-logging went on, or null for off (ticket 11). Held as
        the stored day rather than a boolean, so saving an already-on
        schedule keeps the day it started from instead of restarting it and
        reaching over the days in between. */
    autoLogFromEpochDay: number | null;
  } | null>(null);
  let newPause = $state<{ start: string; end: string; reason: PauseReason } | null>(null);
  /** The reason chip picked before pressing "End episode" (ticket 43) - not
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
  let episodeRequirements = $derived([
    ...(!editor?.drug.trim() ? [m.regimen_drug_required()] : []),
    ...(!Number.isFinite(parseFloat(String(editor?.dose ?? ''))) ? [m.regimen_dose_required()] : [])
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
      ester: draft.ester.trim() || null,
      dose: parseFloat(String(draft.dose)),
      doseUnit: draft.doseUnit.trim(),
      route: draft.route.trim(),
      interval: draft.interval.trim(),
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

  /* A hash arrived with the navigation (the clinician summary links each
     episode): scroll to it once the rows exist, which the browser's own
     anchor scroll never did - it fires before the liveQuery answers. */
  $effect(() => {
    if (!episodesQuery.loading) scrollToHash();
  });

  // Seed once per opening. Live writes must not replace unrelated drafts.
  $effect(() => {
    if (!editor?.id || schedule || schedulesQuery.loading || schedulesQuery.failed) return;
    const recurrence = editorSchedule?.recurrence ?? { kind: 'everyNDays' as const, everyNDays: 1 };
    schedule = {
      recurrenceKind: recurrence.kind,
      everyNDays: String(recurrence.kind === 'everyNDays' ? recurrence.everyNDays : 1),
      weekdays: recurrence.kind === 'weekdays' ? [...recurrence.weekdays] : [],
      dosesPerDay: String(editorSchedule?.dosesPerDay ?? 1),
      doseAmounts: (editorSchedule?.doseAmounts ?? []).map((amount) => ({
        dose: String(amount.dose),
        doseUnit: amount.doseUnit
      })),
      autoLogFromEpochDay: editorSchedule?.autoLogFromEpochDay ?? null
    };
    scheduleBaseline = snapshotDraft(scheduleSnapshot);
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
    const dosesPerDay = Number(schedule.dosesPerDay);
    const recurrence: DoseScheduleRecurrence =
      schedule.recurrenceKind === 'everyNDays'
        ? { kind: 'everyNDays', everyNDays: Number(schedule.everyNDays) }
        : { kind: 'weekdays', weekdays: schedule.weekdays };
    const doseAmounts =
      schedule.doseAmounts.length > 0
        ? schedule.doseAmounts.map((amount) => ({ dose: parseFloat(String(amount.dose)), doseUnit: amount.doseUnit.trim() }))
        : null;
    return { recurrence, dosesPerDay, doseAmounts, autoLogFromEpochDay: schedule.autoLogFromEpochDay };
  });

  let scheduleRequirements = $derived.by(() => {
    if (!scheduleValues) return [];
    const { recurrence, dosesPerDay, doseAmounts } = scheduleValues;
    return [
      ...(!Number.isSafeInteger(dosesPerDay) || dosesPerDay < 1 ? [m.regimen_per_day_required()] : []),
      ...(recurrence.kind === 'everyNDays' && (!Number.isSafeInteger(recurrence.everyNDays) || recurrence.everyNDays < 1)
        ? [m.regimen_every_required()] : []),
      ...(recurrence.kind === 'weekdays' && recurrence.weekdays.length === 0 ? [m.regimen_weekday_required()] : []),
      ...(doseAmounts?.some((amount) => !Number.isFinite(amount.dose) || !amount.doseUnit)
        ? [m.regimen_amount_required()] : [])
    ];
  });
  let scheduleCanSave = $derived(scheduleValues !== null && scheduleRequirements.length === 0);

  /* Whether the auto-log switch is offered at all (ticket 11, ADR-0086):
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
    status = on ? m.regimen_auto_log_on_saved() : m.regimen_auto_log_off_saved();
  }

  async function saveSchedule() {
    if (!editor?.id || !scheduleValues || !scheduleCanSave || saving) return;
    const values = { episodeId: editor.id, ...snapshotDraft(scheduleValues) };
    if (!await write('schedule', () => journal.doses.upsertSchedule(values), m.regimen_schedule_save_failed())) return;
    scheduleBaseline = snapshotDraft(scheduleSnapshot);
    status = m.regimen_schedule_saved();
  }

  async function addPause() {
    if (!editor?.id || !newPause || saving) return;
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
  const longDay = (epochDay: number) => fmtDay(epochDay, { day: 'numeric', month: 'long', year: 'numeric' });

  async function deletePause() {
    const target = pauseDeleteTarget;
    if (!target) return;
    pauseDeleteTarget = null;
    if (!await write('pause', () => journal.doses.deletePause(target.id), m.regimen_pause_delete_failed())) return;
    toast(m.regimen_pause_deleted());
  }

  /* Hiding is the episode's only removal (phase 4 ticket 01: hide, never
     delete). It closes the editor through the same guard as Close, so a
     draft is never thrown away without asking, and the toast carries the
     way back for anyone who tapped it by mistake. */
  async function setHidden(episode: Pick<RegimenEpisode, 'id' | 'drug'>, hidden: boolean) {
    await journal.regimen.setEpisodeHidden(episode.id, hidden);
    if (hidden) {
      toast(m.regimen_hidden_toast({ drug: episode.drug }), {
        actionLabel: m.regimen_hide_undo(),
        onAction: () => void setHidden(episode, false),
        kind: 'episode-hidden'
      });
    } else {
      toast(m.regimen_shown_toast({ drug: episode.drug }));
    }
  }

  function hideEditedEpisode() {
    if (!editor?.id || saving) return;
    const episode = episodes.find((e) => e.id === editor!.id);
    if (!episode) return;
    requestDismiss(() => {
      editor = null;
      void setHidden(episode, true);
    });
  }

</script>

{#snippet feedback(group: typeof messageGroup)}
  {#if messageGroup === group}
    {#if failure}<p class="notice notice-danger" role="alert" data-regimen-failure transition:collapse>{failure}</p>{/if}
    <p class="muted small" role="status" data-regimen-status>{status ?? ''}</p>
  {/if}
{/snippet}

<div class="screen">
  <ScreenHeader title={m.regimen()} back="/more" subtitle={m.regimen_intro()}>
    {#snippet actions()}
      <button class="icon-btn press" data-add aria-label={m.regimen_add_aria()} onclick={() => (templatePicker = true)}>
        <Icon name="plus" size={22} />
      </button>
    {/snippet}
  </ScreenHeader>
  <SourceRecordHandoff id={sourceId} ready={!episodesQuery.loading && !episodesQuery.failed} found={!!sourceEpisode} onOpen={() => openEditor(sourceEpisode!)} />

  <ReadGate read={episodesQuery} variant="line" count={3}>
    {#snippet rows()}
      <BatchedList
        items={orderedEpisodes}
        key="episodes"
        role={roleAt(activeFlag.roles, SECTION_ROLE.episodes)}
        focusIndex={deepLinkedEpisodeIndex >= 0 ? deepLinkedEpisodeIndex : null}
      >
        {#snippet rows(shownEpisodes)}
          {#each shownEpisodes as episode (episode.id)}
            <!-- Wrapped so a hidden episode closes its own height and one
                 shown again opens it, rather than cutting and moving every
                 row under it in one frame. -->
            <div class="rows-divide" transition:collapse>
              <ListRow
                key={episode.id}
                data-episode={episode.id}
                id={episode.id}
                icon="flask"
                title={episode.drug}
                subtitle={`${episode.dose} ${episode.doseUnit} · ${episode.route} · ${episode.interval} · ${rangeLabel(episode)}`}
                chevron={false}
                onclick={() => openEditor(episode)}
              >
                {#snippet trailing()}
                  <!-- Which episodes are running, at the end of the row rather
                       than wedged into the drug's own name. A badge inside a
                       title pushes the name it belongs to onto a second line as
                       soon as the name is long, which every ester is. -->
                  {#if activeIds.has(episode.id)}
                    <span class="regimen-badge" data-active-badge>{m.regimen_active_badge()}</span>
                  {/if}
                {/snippet}
              </ListRow>
            </div>
          {/each}
        {/snippet}
      </BatchedList>
    {/snippet}
    {#snippet empty()}
      <Notice
        icon="flask"
        key="regimen-empty"
        role={roleAt(activeFlag.roles, SECTION_ROLE.episodes)}
        title={m.regimen_empty_title()}
        text={m.regimen_empty_body()}
        action={{ label: m.regimen_empty_action(), primary: true, onclick: () => (templatePicker = true) }}
      />
    {/snippet}
  </ReadGate>

  <!-- Keep this regimen-specific offer beside an active testosterone
       episode, subject to the same cycle choice as other offers. -->
  {#if testosteroneActive(episodes, Date.now()) && cycleTrackingVisible(episodes, Date.now(), prefs.cycleTrackingEnabled, prefs.cycleTrackingChoice)}
    <div class="regimen-elsewhere">
      <ListCard role={roleAt(activeFlag.roles, SECTION_ROLE.elsewhere)}>
        <ListRow
          key="cycle-events"
          data-cycle-events-link
          icon="calendar"
          title={m.cycle_events()}
          subtitle={m.cycle_tracking_regimen_row_sub()}
          href="/health/cycle-events"
        />
      </ListCard>
    </div>
  {/if}

  <!-- No heading over this one. The catalogue's only wording for the area
       was the name of its first row, which would be the row repeated at
       heading size; a name for it is a copy ticket's to write. The gap and
       the second stripe are what separate it from the regimen above -
       ticket 09 (ADR-0084) took the other two rows this card used to hold:
       stock is a sheet off Care's own regimen block now, and exposure's
       one useful figure is that block's own dose-total line. -->
  <div class="regimen-elsewhere">
    <ListCard role={roleAt(activeFlag.roles, SECTION_ROLE.elsewhere)}>
      <ListRow key="doses" icon="timeline" title={m.regimen_doses_link()} subtitle={m.doses_row_sub()} href="/care/doses" />
    </ListCard>
  </div>

  <!-- Last on the screen, so its arrival and its leaving push nothing
       under it. -->
  {#if hiddenEpisodes.length}
    <div class="regimen-hidden" data-hidden-episodes transition:collapse>
      <SectionHeading text={m.regimen_hidden_title()} />
      <ListCard role={roleAt(activeFlag.roles, SECTION_ROLE.episodes)}>
        {#each hiddenEpisodes as episode (episode.id)}
          <div class="rows-divide" transition:collapse>
            <ListRow
              static
              key={episode.id}
              data-hidden-episode={episode.id}
              icon="flask"
              title={episode.drug}
              subtitle={`${episode.dose} ${episode.doseUnit} · ${rangeLabel(episode)}`}
              action={{
                icon: 'eye',
                label: m.regimen_show_aria({ drug: episode.drug }),
                onclick: () => void setHidden(episode, false),
                attrs: { 'data-show-episode': episode.id }
              }}
            />
          </div>
        {/each}
      </ListCard>
    </div>
  {/if}

  <Sheet
    open={templatePicker}
    title={m.regimen_template_sheet_title()}
    onClose={() => (templatePicker = false)}
  >
    <ListCard role={roleAt(activeFlag.roles, SECTION_ROLE.episodes)}>
      <ListRow
        key="own"
        data-own
        icon="pencil"
        title={m.regimen_own_title()}
        subtitle={m.regimen_own_sub()}
        onclick={() => openEditor(null, null)}
      />
      {#each vocabulary.regimenTemplates as tp (tp.key)}
        <ListRow key={tp.key} data-template={tp.key} icon="flask" title={tp.name} onclick={() => openEditor(null, tp)} />
      {/each}
    </ListCard>
  </Sheet>

  <Sheet open={editor !== null} title={editor?.id ? m.regimen_edit_sheet() : m.regimen_new_sheet()} onRequestClose={() => requestDismiss()}>
    {#if editor}
      <fieldset class="regimen-editor" disabled={saving} aria-busy={saving}>
        <section class="regimen-group">
          <FieldGroupHeading legend={m.regimen_episode_legend()} hint={m.regimen_episode_hint()} />
          <p class="muted small" data-episode-dirty>{episodeChanged ? m.regimen_episode_unsaved() : m.regimen_episode_unchanged()}</p>
          <Field label={m.regimen_drug_label()} id="regimen-drug">
            {#snippet children(id)}
              <input class="input" {id} name="regimen-drug" placeholder={m.regimen_drug_placeholder()} aria-invalid={!editor!.drug.trim()} aria-describedby="regimen-episode-requirements" bind:value={editor!.drug} />
            {/snippet}
          </Field>
          <Field label={m.regimen_ester_label()} id="regimen-ester">
            {#snippet children(id)}
              <input class="input" {id} name="regimen-ester" placeholder={m.regimen_ester_placeholder()} bind:value={editor!.ester} />
            {/snippet}
          </Field>
          <div class="cd-endpoints">
            <Field label={m.regimen_dose_label()} id="regimen-dose">
              {#snippet children(id)}
                <input class="input" type="number" {id} name="regimen-dose" placeholder={m.regimen_dose_placeholder()} inputmode="decimal" aria-invalid={!Number.isFinite(parseFloat(String(editor!.dose)))} aria-describedby="regimen-episode-requirements" bind:value={editor!.dose} />
              {/snippet}
            </Field>
            <Field label={m.regimen_dose_unit_label()} id="regimen-dose-unit">
              {#snippet children(id)}
                <input class="input" {id} name="regimen-dose-unit" placeholder={m.regimen_dose_unit_placeholder()} bind:value={editor!.doseUnit} />
              {/snippet}
            </Field>
          </div>
          <Field label={m.regimen_route_label()} id="regimen-route">
            {#snippet children(id)}
              <input class="input" {id} name="regimen-route" placeholder={m.regimen_route_placeholder()} bind:value={editor!.route} />
            {/snippet}
          </Field>
          <Field label={m.regimen_interval_label()} id="regimen-interval">
            {#snippet children(id)}
              <input class="input" {id} name="regimen-interval" placeholder={m.regimen_interval_placeholder()} bind:value={editor!.interval} />
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
                <DatePicker name="regimen-end" bind:value={editor!.endDate} {id} />
              {/snippet}
            </Field>
          </div>
          <p class="muted small" style="margin:calc(-1 * var(--space-2)) 0 var(--space-3)">{m.regimen_end_hint()}</p>
          <div id="regimen-episode-requirements" class="muted small" aria-live="polite">
            {#each episodeRequirements as requirement (requirement)}<p>{requirement}</p>{/each}
          </div>
          <button class="btn btn-primary" data-save-regimen disabled={episodeRequirements.length > 0} onclick={saveEpisode}>
            <span>{m.regimen_save()}</span>
          </button>
          {@render feedback('episode')}
        </section>
        {#if !editor.id}<p class="muted small">{m.regimen_schedule_after_episode()}</p>{/if}
        {#if editor.id}
          <section class="regimen-group">
            <FieldGroupHeading legend={m.regimen_schedule_legend()} hint={m.regimen_schedule_hint()} />
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
                    {#snippet children(id)}
                      <input
                        class="input"
                        type="number"
                        min="1"
                        {id}
                        name="regimen-every"
                        aria-invalid={!Number.isSafeInteger(Number(schedule!.everyNDays)) || Number(schedule!.everyNDays) < 1}
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
                  {#snippet children(id)}
                    <input
                      class="input"
                      type="number"
                      min="1"
                      {id}
                      name="regimen-per-day"
                      aria-invalid={!Number.isSafeInteger(Number(schedule!.dosesPerDay)) || Number(schedule!.dosesPerDay) < 1}
                      aria-describedby="regimen-schedule-requirements"
                      inputmode="numeric"
                      bind:value={schedule!.dosesPerDay}
                    />
                  {/snippet}
                </Field>

                <FieldGroupHeading legend={m.regimen_schedule_amounts_legend()} hint={m.regimen_schedule_amounts_hint()} />
                {#if schedule.doseAmounts.length}
                  <ListCard role={roleAt(activeFlag.roles, SECTION_ROLE.episodes)}>
                    {#each schedule.doseAmounts as amount, index (index)}
                      <!-- Hand-rolled rather than `<ListRow static>` (ticket 40):
                           the row's text is a pair of bound inputs under the
                           screen's own two-column class, not a title and a
                           subtitle.

                           The two `.field` spans stay hand-written rather than
                           Field.svelte (ticket 10): Field renders a div, and a
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
                              aria-label={m.dose_amount_label()}
                              aria-invalid={!Number.isFinite(parseFloat(String(amount.dose)))}
                              aria-describedby="regimen-schedule-requirements"
                              bind:value={amount.dose}
                            />
                          </span>
                          <span class="field">
                            <input
                              class="input"
                              data-amount-unit={index}
                              aria-label={m.dose_unit_label()}
                              aria-invalid={!amount.doseUnit.trim()}
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
                  <span>{m.regimen_schedule_save()}</span>
                </button>

                <!-- The standing instruction (ticket 11, ADR-0086). Under the
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
                <ListCard role={roleAt(activeFlag.roles, SECTION_ROLE.episodes)}>
                  {#each editorPauses as pause (pause.id)}
                    <!-- Hand-rolled rather than ListRow's action/is-split shape
                         (ticket 16): that shape always renders the main span as a
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
                <Field label={m.regimen_pause_start_label()} id="pause-start">
                  {#snippet children(id)}
                    <DatePicker name="pause-start" bind:value={newPause!.start} {id} />
                  {/snippet}
                </Field>
                <Field label={m.regimen_pause_end_label()} id="pause-end">
                  {#snippet children(id)}
                    <DatePicker name="pause-end" bind:value={newPause!.end} {id} />
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
              {#if epochDayFromDateInputValue(newPause.start) === null}
                <p class="muted small" id="regimen-pause-requirements">{m.regimen_pause_start_required()}</p>
              {/if}
              <button
                class="btn btn-soft"
                data-add-pause
                aria-describedby={epochDayFromDateInputValue(newPause.start) === null ? "regimen-pause-requirements" : undefined}
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
               (ticket 56, ADR-0065); the episode stores nothing about the
               link. -->
          <LinkedDocuments kind="episode" id={editor.id} />
        {/if}

      </fieldset>
      <button class="btn btn-ghost" data-close-regimen disabled={saving} onclick={() => requestDismiss()}>
        <span>{m.regimen_close()}</span>
      </button>
    {/if}
  </Sheet>
  <DiscardSheet {guard} body={m.regimen_discard_body()} />
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
</div>

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

  .regimen-elsewhere,
  .regimen-hidden {
    margin-top: var(--space-6);
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

  /* Small enough to sit at the end of a row without pushing the reading
     beside it around. Ink, not the warning treatment (audit U6, rule 4):
     being on a regimen is a status, not a caution, and amber is reserved
     for genuine warnings elsewhere (labs, eras, export). */
  .regimen-badge {
    padding: 2px var(--space-2);
    border-radius: var(--r-block);
    font-size: var(--text-xs);
    white-space: nowrap;
    background: var(--text);
    color: var(--bg);
  }
</style>
