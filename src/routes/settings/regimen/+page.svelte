<script lang="ts">
  /* What you are taking, and since when, on the surface kit (phase 5 UX
     ticket 25).

     The three links out - the dose log, the stock projection, the exposure
     counters - sat above the regimen itself as a list-group indistinguishable
     from the one holding the episodes, so the first three rows of the screen
     were somewhere else and the fourth was the thing you came for. They are
     an area of their own with a heading over them, and the episodes are the
     first thing under the header.

     Stock and exposure are still only reachable from here, which SCREENS.md
     flags as a decision rather than an oversight, and no ticket in this
     phase gives either an inbound link from the hub. Unchanged here. */
  import { m } from '$lib/paraglide/messages';
  import DatePicker from '$lib/components/DatePicker.svelte';
  import { journal, liveList } from '$lib/data/live/journal.svelte';
  import { activeEpisodesAt } from '$lib/data/regimenEpisode';
  import { testosteroneActive } from '$lib/data/cycleTracking';
  import { fmtDay } from '$lib/data/dates';
  import { todayEpochDay, epochDayFromDateInputValue, epochDayFromDateInputValueOrToday, dateInputValueFromEpochDay } from '$lib/data/epochDay';
  import { pauseReasonLabel } from '$lib/data/vocabulary/doseLabels';
  import { vocabulary } from '$lib/data/vocabulary/vocabulary';
  import type { DoseScheduleRecurrence, PauseReason, RegimenEpisode, RegimenTemplate } from '$lib/data/types';
  import Icon from '$lib/components/Icon.svelte';
  import ScreenHeader from '$lib/components/ScreenHeader.svelte';
  import Sheet from '$lib/components/Sheet.svelte';
  import Field from '$lib/components/kit/Field.svelte';
  import FieldGroupHeading from '$lib/components/kit/FieldGroupHeading.svelte';
  import ListCard from '$lib/components/kit/ListCard.svelte';
  import ListRow from '$lib/components/kit/ListRow.svelte';
  import Notice from '$lib/components/kit/Notice.svelte';
  import { crossfade, disclose } from '$lib/motion/reveal';
  import { scrollToHash } from '$lib/navigation/scroll-region';
  import { activeFlag } from '$lib/theme/activeFlag.svelte';
  import { roleAt } from '$lib/theme/roles';
  import ReadGate from '$lib/components/kit/ReadGate.svelte';

  /* Two areas: what is being taken, and the three screens that read the
     dose log from other angles. */
  const SECTION_ROLE = { episodes: 0, elsewhere: 1 };

  let episodesQuery = liveList((j) => j.regimen.getEpisodes());
  let episodes = $derived(episodesQuery.rows);
  /* A set, not one episode (phase 5 ticket 38): more than one can be
     active at once for different drugs, and every one of them still gets
     the "current" badge below. */
  let activeIds = $derived(new Set(activeEpisodesAt(episodes, Date.now()).map((e) => e.id)));

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
          endDate: episode.endEpochDay === null ? '' : dateInputValueFromEpochDay(episode.endEpochDay)
        }
      : {
          drug: template?.drug ?? '',
          ester: template?.ester ?? '',
          dose: '',
          doseUnit: '',
          route: template?.route ?? '',
          interval: '',
          startDate: dateInputValueFromEpochDay(todayEpochDay()),
          endDate: ''
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
      startEpochDay: epochDayFromDateInputValueOrToday(editor.startDate),
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

  /* A hash arrived with the navigation (the clinician summary links each
     episode): scroll to it once the rows exist, which the browser's own
     anchor scroll never did - it fires before the liveQuery answers. */
  $effect(() => {
    if (!episodesQuery.loading) scrollToHash();
  });

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

</script>

<div class="screen">
  <ScreenHeader title={m.regimen()} back="/more" subtitle={m.regimen_intro()}>
    {#snippet actions()}
      <button class="icon-btn press" data-add aria-label={m.regimen_add_aria()} onclick={() => (templatePicker = true)}>
        <Icon name="plus" size={22} />
      </button>
    {/snippet}
  </ScreenHeader>

  <ReadGate read={episodesQuery} variant="line" count={3}>
    {#snippet rows()}
      <div class="screen-part">
        <ListCard role={roleAt(activeFlag.roles, SECTION_ROLE.episodes)}>
          {#each [...episodes].reverse() as episode (episode.id)}
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
                  <span class="notice-warn regimen-badge" data-active-badge>{m.regimen_active_badge()}</span>
                {/if}
              {/snippet}
            </ListRow>
          {/each}
        </ListCard>
      </div>
    {/snippet}
    {#snippet empty()}
      <div class="screen-part">
        <Notice
          icon="flask"
          key="regimen-empty"
          role={roleAt(activeFlag.roles, SECTION_ROLE.episodes)}
          title={m.regimen_empty_title()}
          text={m.regimen_empty_body()}
          action={{ label: m.regimen_empty_action(), primary: true, onclick: () => (templatePicker = true) }}
        />
      </div>
    {/snippet}
  </ReadGate>

  <!-- ADR-0043: cycle cessation is what testosterone does, so an active
       testosterone episode is what puts the cycle log one row away from
       the regimen that explains it. Same one visibility question
       cycleTracking.ts answers for More and side effects, read here for
       the testosterone half alone - the preference has nothing to add on
       a screen only a regimen reader reached. The cycle screen already
       draws these episodes as bands behind the events, which is the
       timeline this row names. -->
  {#if testosteroneActive(episodes, Date.now())}
    <div class="regimen-elsewhere">
      <ListCard role={roleAt(activeFlag.roles, SECTION_ROLE.elsewhere)}>
        <ListRow
          key="cycle-events"
          data-cycle-events-link
          icon="calendar"
          title={m.cycle_events()}
          subtitle={m.cycle_tracking_regimen_row_sub()}
          href="/settings/cycle-events"
        />
      </ListCard>
    </div>
  {/if}

  <!-- No heading over these three. The catalogue's only wording for the
       area is the name of the first row in it, which would be the row
       repeated at heading size; a name for it is a copy ticket's to write.
       The gap and the second stripe are what separate them from the
       regimen above. -->
  <div class="regimen-elsewhere">
    <ListCard role={roleAt(activeFlag.roles, SECTION_ROLE.elsewhere)}>
    <ListRow key="doses" icon="timeline" title={m.regimen_doses_link()} subtitle={m.doses_row_sub()} href="/doses" />
    <ListRow
      key="stock"
      icon="package"
      title={m.regimen_stock_link()}
      subtitle={m.regimen_stock_link_sub()}
      href="/settings/stock"
    />
    <ListRow
      key="exposure"
      icon="stats"
      title={m.regimen_exposure_link()}
      subtitle={m.regimen_exposure_link_sub()}
      href="/settings/exposure"
    />
    </ListCard>
  </div>

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

  <Sheet open={editor !== null} title={editor?.id ? m.regimen_edit_sheet() : m.regimen_new_sheet()} onClose={() => (editor = null)}>
    {#if editor}
      <h3>{editor.id ? m.regimen_edit_sheet() : m.regimen_new_sheet()}</h3>
      <Field label={m.regimen_drug_label()} id="regimen-drug">
        {#snippet children(id)}
          <input class="input" {id} name="regimen-drug" placeholder={m.regimen_drug_placeholder()} bind:value={editor!.drug} />
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
            <input class="input" type="number" {id} name="regimen-dose" placeholder={m.regimen_dose_placeholder()} inputmode="decimal" bind:value={editor!.dose} />
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
      {#if editor.id}
        <FieldGroupHeading legend={m.regimen_schedule_legend()} hint={m.regimen_schedule_hint()} />
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

            <button
              class="btn btn-soft"
              data-save-schedule
              disabled={!scheduleCanSave}
              onclick={saveSchedule}
           
            >
              <span>{m.regimen_schedule_save()}</span>
            </button>
          </div>
        {/if}

        <FieldGroupHeading legend={m.regimen_pauses_legend()} hint={m.regimen_pauses_hint()} />
        {#if editorPauses.length}
          <ListCard role={roleAt(activeFlag.roles, SECTION_ROLE.episodes)}>
            {#each editorPauses as pause (pause.id)}
              <!-- Hand-rolled rather than ListRow's action/is-split shape
                   (ticket 16): that shape always renders the main span as a
                   button or a link, and this one names nothing to press -
                   it only states a pause. Routing it through would add
                   .kit-row-main's :active wash and a tab stop to text that
                   does nothing when pressed. -->
              <div class="kit-row is-split">
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
                  aria-label={m.regimen_pause_delete_aria({
                    from: fmtDay(pause.startEpochDay, { day: 'numeric', month: 'long', year: 'numeric' })
                  })}
                  onclick={() => deletePause(pause.id)}
                >
                  <Icon name="trash" size={18} />
                </button>
              </div>
            {/each}
          </ListCard>
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

      <div class="stack-3">
        <button class="btn btn-primary" data-save-regimen onclick={saveEpisode}><span>{m.regimen_save()}</span></button>
        {#if editor.id}
          {#if editor.endDate === ''}
            <button class="btn btn-ghost" data-end-episode onclick={endEpisodeToday}>
              <span>{m.regimen_end_action()}</span>
            </button>
          {/if}
        {/if}
      </div>
    {/if}
  </Sheet>
</div>

<style>
  .regimen-elsewhere {
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
     beside it around. */
  .regimen-badge {
    padding: 2px var(--space-2);
    border-radius: var(--radius-md);
    font-size: var(--text-xs);
    white-space: nowrap;
  }
</style>
