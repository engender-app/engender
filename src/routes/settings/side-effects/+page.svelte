<script lang="ts">
  /* What you are noticing, on the surface kit (phase 5 UX ticket 25).

     One list, so one role and no section heading: a heading above the only
     area of a screen names nothing the screen title has not already said
     (DIRECTION.md 3c is about a screen reading as several named areas).

     The intro line moved above the list from below the header, because it
     was only rendered when there was something to introduce - a first-run
     journal got the empty state and never saw it. It is the notice's own
     text there instead. */
  import { m } from '$lib/paraglide/messages';
  import DatePicker from '$lib/components/DatePicker.svelte';
  import { journal, liveList } from '$lib/data/live/journal.svelte';
  import { severityName, cycleEventKindName } from '$lib/data/vocabulary/labels';
  import { fmtDay } from '$lib/data/dates';
  import { todayEpochDay, epochDayFromDateInputValueOrToday, dateInputValueFromEpochDay } from '$lib/data/epochDay';
  import { cycleTrackingVisible } from '$lib/data/cycleTracking';
  import { prefs } from '$lib/data/prefs/store.svelte';
  import { toast } from '$lib/stores/toasts.svelte';
  import type { SideEffect } from '$lib/data/types';
  import Icon from '$lib/components/Icon.svelte';
  import ScreenHeader from '$lib/components/ScreenHeader.svelte';
  import Segmented from '$lib/components/Segmented.svelte';
  import Field from '$lib/components/kit/Field.svelte';
  import ListCard from '$lib/components/kit/ListCard.svelte';
  import ListRow from '$lib/components/kit/ListRow.svelte';
  import SectionHeading from '$lib/components/kit/SectionHeading.svelte';
  import Notice from '$lib/components/kit/Notice.svelte';
  import { recordEditor } from '$lib/components/kit/recordEditor.svelte';
  import RecordSheet from '$lib/components/kit/RecordSheet.svelte';
  import { crossfade } from '$lib/motion/reveal';
  import { activeFlag } from '$lib/theme/activeFlag.svelte';
  import { roleAt } from '$lib/theme/roles';
  import ReadGate from '$lib/components/kit/ReadGate.svelte';
  import AreaFinish from '$lib/components/AreaFinish.svelte';

  const SEVERITIES = [1, 2, 3, 4, 5];

  let effectsQuery = liveList((j) => j.sideEffects.getSideEffects());
  let effects = $derived(effectsQuery.rows);

  /* The cycle log as a second area of this screen (ADR-0043): bleeding and
     spotting are physiological effects like anything else listed here, so
     the most recent ones sit beneath the effects list once cycle tracking
     is surfaced at all - an active testosterone regimen or the explicit
     opt-in (cycleTracking.ts, the one rule the More hub reads too). The
     rows state, they do not open anything: editing happens on the cycle
     screen the trailing row links to, which owns the chart and the range
     pickers this list deliberately does not duplicate. */
  let cycleEventsQuery = liveList((j) => j.cycleEvents.getCycleEvents());
  let cycleEvents = $derived(cycleEventsQuery.rows);
  let episodesQuery = liveList((j) => j.regimen.getEpisodes());
  let cycleShown = $derived(cycleTrackingVisible(episodesQuery.rows, Date.now(), prefs.cycleTrackingEnabled));
  let recentCycleEvents = $derived([...cycleEvents].sort((a, b) => b.epochDay - a.epochDay).slice(0, 3));

  const record = recordEditor<SideEffect, { id?: string; date: string; name: string; severity: string }>({
    blank: () => ({ date: dateInputValueFromEpochDay(todayEpochDay()), name: '', severity: '3' }),
    fromRecord: (effect) => ({
      id: effect.id,
      date: dateInputValueFromEpochDay(effect.epochDay),
      name: effect.name,
      severity: String(effect.severity)
    }),
    async upsert(draft) {
      const name = draft.name.trim();
      if (!name) return false;
      await journal.sideEffects.upsertSideEffect({
        id: draft.id,
        name,
        severity: Number(draft.severity),
        epochDay: epochDayFromDateInputValueOrToday(draft.date)
      });
    },
    remove: (id) => journal.sideEffects.deleteSideEffect(id),
    findById: (id) => effects.find((effect) => effect.id === id)
  });

  /* Ticket 11's second entry point into the appointment prep list: a
     one-tap add, seeded from what is already on screen, rather than a
     detour through that list's own editor. */
  async function addToAppointmentPrep(name: string) {
    await journal.checklists.addToStandaloneChecklist(m.appointment_prep_from_effect_item({ name }));
    toast(m.appointment_prep_added_toast());
  }
</script>

<div class="screen">
  <ScreenHeader title={m.side_effects()} back="/more" subtitle={m.side_effects_intro()}>
    {#snippet actions()}
      <button class="icon-btn press" data-add aria-label={m.side_effect_add_aria()} onclick={() => record.openEditor(null)}>
        <Icon name="plus" size={22} />
      </button>
    {/snippet}
  </ScreenHeader>

  <ReadGate read={effectsQuery} variant="line" count={3}>
    {#snippet rows()}
      <div class="screen-part">
        <ListCard role={roleAt(activeFlag.roles, 0)}>
          {#each [...effects].reverse() as effect (effect.id)}
            <ListRow
              key={effect.id}
              data-side-effect={effect.id}
              icon="zap"
              title={effect.name}
              subtitle={`${fmtDay(effect.epochDay, { day: 'numeric', month: 'long', year: 'numeric' })} · ${severityName(effect.severity)}`}
              chevron={false}
              onclick={() => record.openEditor(effect)}
            />
          {/each}
        </ListCard>
      </div>
    {/snippet}
    {#snippet empty()}
      <div class="screen-part">
        <Notice
          icon="zap"
          key="side-effects-empty"
          role={roleAt(activeFlag.roles, 0)}
          title={m.side_effect_empty_title()}
          text={m.side_effect_empty_body()}
          action={{ label: m.side_effect_empty_action(), primary: true, onclick: () => record.openEditor(null) }}
        />
      </div>
    {/snippet}
  </ReadGate>

  {#if cycleShown && !cycleEventsQuery.loading && !episodesQuery.loading}
    <!-- A second area, so a heading: with one list this screen needed none
         (DIRECTION.md 3c), and two named areas do. Role 1: the second
         stripe of this screen, after the effects list's 0. -->
    <SectionHeading text={m.cycle_events()} />
    <div class="screen-part">
      <ListCard role={roleAt(activeFlag.roles, 1)}>
        {#each recentCycleEvents as event (event.id)}
          <!-- Static rows (the shape regimen's pause rows use, ticket 16):
               they name nothing to press, and routing them through ListRow
               would add a tab stop and a wash to text that does nothing.
               The trailing row below is the way in. -->
          <div class="kit-row is-static" data-cycle-event={event.id}>
            <span class="kit-row-ico"><Icon name="calendar" size={22} /></span>
            <span class="kit-row-text">
              <span class="kit-row-title">{cycleEventKindName(event.kind)}</span>
              <span class="kit-row-sub">{fmtDay(event.epochDay, { day: 'numeric', month: 'long', year: 'numeric' })}</span>
            </span>
          </div>
        {/each}
        <ListRow
          key="all-cycle-events"
          icon="calendar"
          title={m.cycle_events_open_row_title()}
          subtitle={m.cycle_events_open_row_sub()}
          href="/settings/cycle-events"
        />
      </ListCard>
    </div>
  {/if}

  <!-- Saying you are done with this area (phase 8 features ticket 04). -->
  <AreaFinish group="side-effects" />

  <RecordSheet
    {record}
    handle="side-effect"
    newTitle={m.side_effect_new_sheet()}
    editTitle={m.side_effect_edit_sheet()}
    saveLabel={m.side_effect_save()}
    deleteLabel={m.side_effect_delete()}
    confirm={{
      title: m.side_effect_delete_sheet(),
      question: (effect) => m.side_effect_delete_q({ name: effect.name }),
      hint: () => m.side_effect_delete_hint(),
      confirmLabel: m.side_effect_delete(),
      cancelLabel: m.keep_it()
    }}
  >
    {#snippet fields(editor)}
      <Field label={m.side_effect_name_label()} id="side-effect-name">
        {#snippet children(id)}
          <input class="input" {id} name="side-effect-name" placeholder={m.side_effect_name_placeholder()} bind:value={editor.name} />
        {/snippet}
      </Field>
      <Field label={m.side_effect_date_label()} id="side-effect-date">
        {#snippet children(id)}
          <DatePicker name="side-effect-date" bind:value={editor.date} {id} />
        {/snippet}
      </Field>
      <Field label={m.side_effect_severity_label()} legend>
        {#snippet children()}
          <Segmented
            name={m.side_effect_severity_label()}
            options={SEVERITIES.map((v) => ({ value: String(v), label: severityName(v) }))}
            value={editor.severity}
            onChange={(v) => (editor.severity = v)}
          />
        {/snippet}
      </Field>
    {/snippet}
    {#snippet extraActions(editor)}
      <button class="btn btn-soft" data-add-to-appointment-prep onclick={() => addToAppointmentPrep(editor.name)}>
        <span>{m.appointment_prep_add_button()}</span>
      </button>
    {/snippet}
  </RecordSheet>
</div>
