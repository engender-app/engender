<script lang="ts">
  import { undoable } from '$lib/stores/deleteUndo';
  import { journalTextAutocomplete } from '$lib/platform';
  import { navigating, page } from '$app/state';
  import SourceRecordHandoff from '$lib/components/SourceRecordHandoff.svelte';
  /* Electrolysis and laser sessions, on the surface kit (phase 5 UX
     ticket 25). Two lists on the screen and a third inside the editor,
     all of them `.list-group` before this; the recency rows open the
     add-session form with their own area chosen (pre-production UI/UX
     ticket 28), the session photos state something and go nowhere, so
     they stay static rows, and the sessions themselves open the editor. */
  import { m } from '$lib/paraglide/messages';
  import DatePicker from '$lib/components/DatePicker.svelte';
  import Disclosure from '$lib/components/kit/Disclosure.svelte';
  import { journal, liveList } from '$lib/data/live/journal.svelte';
  import { hairRemovalAreaName, hairRemovalMethodName, severityName } from '$lib/data/vocabulary/labels';
  import { daysSinceLastSession } from '$lib/data/hairRemovalSchedule';
  import { HAIR_REMOVAL_AREAS, type HairRemovalAreaKey } from '$lib/data/hairRemovalAreas';
  import { fmtDay, intlLocale } from '$lib/data/dates';
  import { todayEpochDay, epochDayFromDateInputValueOrToday, dateInputValueFromEpochDay } from '$lib/data/epochDay';
  import { currentDay } from '$lib/stores/today.svelte';
  import type { HairRemovalSession, HairRemovalMethod } from '$lib/data/types';
  import { HAIR_REMOVAL_METHODS } from '$lib/data/types';
  import type { HairRemovalPhoto } from '$lib/data/journal/hairRemoval';
  import type { NormalizedPhoto } from '$lib/data/journal/photos';
  import Icon from '$lib/components/Icon.svelte';
  import ScreenHeader from '$lib/components/ScreenHeader.svelte';
  import Segmented from '$lib/components/Segmented.svelte';
  import DayStrip from '$lib/components/DayStrip.svelte';
  import { stripWindow, type DayMark } from '$lib/components/dayStrip';
  import Field from '$lib/components/kit/Field.svelte';
  import ListCard from '$lib/components/kit/ListCard.svelte';
  import ListRow from '$lib/components/kit/ListRow.svelte';
  import Notice from '$lib/components/kit/Notice.svelte';
  import PhotoSection from '$lib/components/kit/PhotoSection.svelte';
  import SectionHeading from '$lib/components/kit/SectionHeading.svelte';
  import { recordEditor } from '$lib/components/kit/recordEditor.svelte';
  import { photoSection } from '$lib/components/kit/photoSection.svelte';
  import { lastPhotoReference } from '$lib/components/kit/photoSection';
  import RecordSheet from '$lib/components/kit/RecordSheet.svelte';
  import { activeFlag } from '$lib/theme/activeFlag.svelte';
  import { roleAt } from '$lib/theme/roles';
  import ReadGate from '$lib/components/kit/ReadGate.svelte';
  import AreaFinish from '$lib/components/AreaFinish.svelte';
  import { crossfade } from '$lib/motion/reveal';
  import CostField from '$lib/components/CostField.svelte';
  import { blankCostDraft, costDraftFrom, costDraftOk, costFromDraft, type CostDraft } from '$lib/components/costDraft';
  import { deviceDefaultCurrency } from '$lib/data/cost';
  import { costLine } from '$lib/data/vocabulary/costLabel';

  /* The strip's fill shares the chromatic role with the recency figures
     (ticket 56, following ticket 44's own rule for dilation and wear):
     index 0 is the only role guaranteed chromatic on every palette, and a
     logged day filled in a palette's achromatic band is a day drawn as
     nothing. */
  const SECTION_ROLE = { recency: 0, strip: 0, sessions: 1 };

  /* '' is no rating: the draft opens unrated and an unrated session stores
     none (FA 28). */
  const PAIN_OPTIONS = [
    { value: '', label: m.hair_removal_pain_unrated() },
    ...[1, 2, 3, 4, 5].map((v) => ({ value: String(v), label: severityName(v) ?? String(v) }))
  ];

  const today = $derived(currentDay());

  /** The untouched draft every open starts from, named once so the
      header's add control, a strip day and a recency row cannot drift
      apart in their defaults. */
  function blankDraft(area: HairRemovalAreaKey, epochDay: number = today) {
    return {
      date: dateInputValueFromEpochDay(epochDay),
      area,
      method: 'laser' as HairRemovalMethod,
      painRating: '',
      minutes: null as number | null,
      cost: blankCostDraft(deviceDefaultCurrency()),
      provider: '',
      note: ''
    };
  }

  let sessionsQuery = liveList((j) => j.hairRemoval.getSessions());
  let sessions = $derived(sessionsQuery.rows);
  let savedId = $state<string | null>(null);
  let savedSession = $derived(sessions.find((session) => session.id === savedId));
  let sourceId = $derived(page.url.searchParams.get('session'));
  let sourceSession = $derived(sessions.find((session) => session.id === sourceId));

  let recency = $derived(daysSinceLastSession(sessions, today));

  const dayLabel = (epochDay: number) => fmtDay(epochDay, { day: 'numeric', month: 'long', year: 'numeric' });

  /* The log is a week at a time now (phase 10 redesign ticket 56, reusing
     ticket 44's DayStrip/dayStrip.ts). A day here is `logged` or nothing -
     there is no `expected`, the same restraint wear's own strip applies,
     because nothing schedules a hair-removal session and hairRemovalSchedule.ts
     refuses due framing on purpose. */
  let sessionsByDay = $derived.by(() => {
    const byDay = new Map<number, HairRemovalSession[]>();
    for (const session of sessions) {
      byDay.set(session.epochDay, [...(byDay.get(session.epochDay) ?? []), session]);
    }
    return byDay;
  });
  let markOf = $derived((epochDay: number): DayMark => (sessionsByDay.has(epochDay) ? 'logged' : 'off'));
  let earliest = $derived(sessions.length === 0 ? null : Math.min(...sessions.map((session) => session.epochDay)));

  /** What a cell says on the day a screen reader reaches it: the areas
      treated that day, joined the way the week's own rows already state a
      session (area, method, pain) - a day can hold more than one session. */
  const dayAreasLabel = (epochDay: number): string | null => {
    const onDay = sessionsByDay.get(epochDay);
    return onDay && onDay.length ? onDay.map((session) => hairRemovalAreaName(session.area)).join(' · ') : null;
  };

  /* The newest session at or before today, which is the week the strip
     opens on. */
  let latestSession = $derived(
    sessions.reduce<HairRemovalSession | null>((latest, session) => {
      if (session.epochDay > today) return latest;
      if (!latest || session.epochDay > latest.epochDay) return session;
      return latest;
    }, null)
  );
  // Start on the latest logged week until the person chooses another week.
  let weeksBack = $state<number | null>(null);
  let shownWeeksBack = $derived(weeksBack ?? (latestSession ? Math.floor((today - latestSession.epochDay) / 7) : 0));
  let shownWeek = $derived(stripWindow(today, shownWeeksBack));
  let areasOpen = $state(false);
  let weekSessions = $derived(
    [...sessions]
      .filter((session) => session.epochDay >= shownWeek.first && session.epochDay <= shownWeek.last)
      .sort((a, b) => b.epochDay - a.epochDay)
  );

  /** A tap on a strip day: its first session if it has one, or a blank
      draft anchored to that day if it has none - the same two ways the add
      control already offers, pointed at one day. */
  function openSessionFor(epochDay: number) {
    const existing = sessionsByDay.get(epochDay)?.[0];
    if (existing) {
      record.openEditor(existing);
      return;
    }
    record.editor = blankDraft(HAIR_REMOVAL_AREAS[0], epochDay);
  }

  /** A recency row's handoff (pre-production UI/UX ticket 28): no per-area
      history destination exists - the body-map inspector reads the
      dysphoria-scoped region vocabulary, which these treatment areas are
      deliberately never merged with - so the row opens the existing
      add-session form with its area already chosen. A seeded blank is a
      clean baseline: nothing saves until Save, and dismissing an untouched
      form closes it directly. */
  function openSessionForArea(area: HairRemovalAreaKey) {
    record.editor = blankDraft(area);
  }

  const record = recordEditor<
    HairRemovalSession,
    { id?: string; date: string; area: string; method: HairRemovalMethod; painRating: string; minutes: number | null; cost: CostDraft; provider: string; note: string }
  >({
    blank: () => blankDraft(HAIR_REMOVAL_AREAS[0]),
    fromRecord: (session) => ({
      id: session.id,
      date: dateInputValueFromEpochDay(session.epochDay),
      area: session.area,
      method: session.method,
      painRating: session.painRating === null ? '' : String(session.painRating),
      minutes: session.minutes,
      cost: costDraftFrom(session.cost, deviceDefaultCurrency(), intlLocale()),
      provider: session.provider,
      note: session.note ?? ''
    }),
    async upsert(draft) {
      const id = await journal.hairRemoval.upsertSession({
        id: draft.id,
        epochDay: epochDayFromDateInputValueOrToday(draft.date),
        area: draft.area,
        method: draft.method,
        painRating: draft.painRating === '' ? null : Number(draft.painRating),
        minutes: draft.minutes,
        cost: costFromDraft(draft.cost),
        provider: draft.provider,
        note: draft.note
      });
      if (!draft.id) savedId = id;
    },
    // A new session's notice below says more than a toast would.
    saved: (draft) => (draft.id ? m.saved() : null),
    remove: (id) => undoable((j) => j.hairRemoval.deleteSession(id)),
    findById: (id) => sessions.find((session) => session.id === id)
  });
  /** Empty is fine; a length is a whole number of minutes in a day. */
  const minutesOk = (draft: { minutes: number | null }) =>
    draft.minutes === null || (Number.isInteger(draft.minutes) && draft.minutes >= 1 && draft.minutes <= 1440);
  const canSave = (draft: { minutes: number | null; cost: CostDraft }) => minutesOk(draft) && costDraftOk(draft.cost);
  let editor = $derived(record.editor);
  let deleteTarget = $derived(record.deleteTarget);

  /* Only once a session has its own id: a photo belongs to one session
     (hairRemoval.ts's own foreign key), so there is nothing to attach it to
     before that first save. */
  let photosQuery = liveList((j) => (editor?.id ? j.hairRemoval.getPhotos(editor.id) : Promise.resolve([])));
  let photos = $derived(photosQuery.rows);

  async function storePhoto(photo: NormalizedPhoto): Promise<void> {
    if (!editor?.id) return;
    await journal.hairRemoval.addPhoto(editor.id, photo);
  }

  const sessionPhotos = photoSection<HairRemovalPhoto>({
    photos: () => photos,
    add: storePhoto,
    remove: (id) => undoable((j) => j.hairRemoval.deletePhoto(id)),
    reference: () => lastPhotoReference(photos)
  });
</script>

{#snippet areaControls()}
  <Disclosure label={m.hair_removal_areas_title()} id="hair-removal-areas" bind:open={areasOpen} data-hair-removal-areas strong>
    <SectionHeading text={m.hair_removal_recency_title()} />
    <ListCard role={roleAt(activeFlag.roles, SECTION_ROLE.recency)}>
      {#each HAIR_REMOVAL_AREAS as area (area)}
        {@const days = recency[area]}
        <ListRow
          data-recency={area}
          title={hairRemovalAreaName(area)}
          subtitle={days === null
            ? m.hair_removal_area_never_used()
            : m.days_ago({ days: m.n_days({ n: days }) })}
          onclick={() => openSessionForArea(area)}
        />
      {/each}
    </ListCard>
  </Disclosure>
{/snippet}

<div class="screen">
  <ScreenHeader title={m.hair_removal()} back="/more">
    {#snippet actions()}
      <button class="icon-btn press" data-add aria-label={m.hair_removal_add_aria()} onclick={() => record.openEditor(null)}>
        <Icon name="plus" size={22} />
      </button>
    {/snippet}
  </ScreenHeader>
  {#if savedSession}
    <Notice
      icon="check"
      key={savedSession.id}
      data-hair-removal-saved={savedSession.id}
      aria-live="polite"
      title={m.hair_removal_saved()}
      text={`${hairRemovalAreaName(savedSession.area)} · ${hairRemovalMethodName(savedSession.method)} · ${dayLabel(savedSession.epochDay)}`}
      action={{ label: m.hair_removal_add_photo(), onclick: () => { if (savedSession) record.openEditor(savedSession); } }}
    />
  {/if}
  <SourceRecordHandoff id={sourceId} ready={!sessionsQuery.loading && !sessionsQuery.failed} found={!!sourceSession} onOpen={() => record.openEditor(sourceSession!)} />

  <ReadGate read={sessionsQuery} variant="line" count={3}>
    {#snippet rows()}
      <SectionHeading text={m.hair_removal_sessions_title()} />
      {#if earliest !== null}
        <DayStrip
          {today}
          markOf={(day) => markOf(day)}
          labelOf={(day, mark) =>
            m.strip_day_state({ day: dayLabel(day), state: dayAreasLabel(day) ?? m.adherence_nothing_logged() })}
          {earliest}
          onPick={openSessionFor}
          role={roleAt(activeFlag.roles, SECTION_ROLE.strip)}
          bind:weeksBack={() => shownWeeksBack, (value) => (weeksBack = value)}
        />
      {/if}
      <!-- A week swaps in one slot; the read gate travels its changed height. -->
      <div class="hair-removal-week">
        {#key `${shownWeek.first}:${weekSessions.map((session) => session.id).join(',')}`}
          <div transition:crossfade={{ instant: navigating.to !== null }}>
            {#if weekSessions.length === 0}
              <p class="muted small" data-strip-week-empty>{m.strip_week_nothing()}</p>
            {:else}
              <ListCard role={roleAt(activeFlag.roles, SECTION_ROLE.sessions)}>
                {#each weekSessions as session (session.id)}
                  <ListRow
                    key={session.id}
                    data-hair-removal-session={session.id}
                    icon="razor"
                    title={hairRemovalAreaName(session.area)}
                    subtitle={[dayLabel(session.epochDay), hairRemovalMethodName(session.method), session.minutes === null ? null : m.hair_removal_minutes_short({ n: session.minutes }), severityName(session.painRating), costLine(session.cost)].filter(Boolean).join(' · ')}
                    chevron={false}
                    onclick={() => record.openEditor(session)}
                  />
                {/each}
              </ListCard>
            {/if}
          </div>
        {/key}
      </div>
    {/snippet}
    {#snippet empty()}
      <div out:crossfade|global={{ instant: navigating.to !== null }}>
        <Notice
          icon="razor"
          key="hair-removal-empty"
          role={roleAt(activeFlag.roles, SECTION_ROLE.sessions)}
          title={m.empty_log_title()}
          action={{ label: m.hair_removal_empty_action(), primary: true, onclick: () => record.openEditor(null) }}
        />
      </div>
    {/snippet}
  </ReadGate>

  <!-- Region controls and area state share one lifetime across empty and populated answers. -->
  {#if !sessionsQuery.loading && (!sessionsQuery.failed || (sessionsQuery.stale && sessions.length > 0))}
    <div class="screen-part">
      {@render areaControls()}
      <AreaFinish group="hair-removal" />
    </div>
  {/if}

  <RecordSheet
    {record}
    handle="hair-removal-session"
    newTitle={m.hair_removal_new_sheet()}
    editTitle={m.hair_removal_edit_sheet()}
    saveLabel={m.save()}
    canSave={canSave}
    deleteLabel={m.delete()}
    confirm={{
      title: m.hair_removal_delete_sheet(),
      question: (session) => m.hair_removal_delete_q({ area: hairRemovalAreaName(session.area) }),
      hint: () => m.delete_undo_hint(),
      confirmLabel: m.delete(),
      cancelLabel: m.keep_it()
    }}
  >
    {#snippet fields(draft)}
      <Field label={m.hair_removal_method_label()} legend>
        {#snippet children()}
          <Segmented
            name={m.hair_removal_method_label()}
            options={HAIR_REMOVAL_METHODS.map((method) => ({ value: method, label: hairRemovalMethodName(method) }))}
            value={draft.method}
            onChange={(v) => (draft.method = v as HairRemovalMethod)}
          />
        {/snippet}
      </Field>
      <Field label={m.hair_removal_area_label()} id="hair-removal-area">
        {#snippet children(id)}
          <select class="input" {id} bind:value={draft.area}>
            {#each HAIR_REMOVAL_AREAS as area (area)}
              <option value={area}>{hairRemovalAreaName(area)}</option>
            {/each}
          </select>
        {/snippet}
      </Field>
      <Field label={m.hair_removal_minutes_label()} id="hair-removal-minutes">
        {#snippet children(id)}
          <input
            class="input"
            {id}
            name="hair-removal-minutes"
            type="number"
            inputmode="numeric"
            min="1"
            max="1440"
            step="1"
            placeholder={m.hair_removal_minutes_placeholder()}
            bind:value={draft.minutes}
          />
        {/snippet}
      </Field>
      <Field label={m.hair_removal_pain_label()} legend>
        {#snippet children()}
          <Segmented
            name={m.hair_removal_pain_label()}
            options={PAIN_OPTIONS}
            value={draft.painRating}
            onChange={(v) => (draft.painRating = v)}
          />
        {/snippet}
      </Field>
      <CostField id="hair-removal-cost" bind:draft={draft.cost} />
      <Field label={m.hair_removal_provider_label()} id="hair-removal-provider">
        {#snippet children(id)}
          <input autocomplete={journalTextAutocomplete()}
            class="input"
            {id}
            name="hair-removal-provider"
            placeholder={m.hair_removal_provider_placeholder()}
            bind:value={draft.provider}
          />
        {/snippet}
      </Field>
      <Field label={m.note_label()} id="hair-removal-note">
        {#snippet children(id)}
          <textarea autocomplete={journalTextAutocomplete()}
            class="input"
            {id}
            name="hair-removal-note"
            rows="3"
            placeholder={m.hair_removal_note_placeholder()}
            bind:value={draft.note}
          ></textarea>
        {/snippet}
      </Field>

      <Field label={m.date_label()} id="hair-removal-date">
        {#snippet children(id)}
          <DatePicker name="hair-removal-date" bind:value={draft.date} {id} />
        {/snippet}
      </Field>

      <SectionHeading text={m.photos_title()} />
      {#if !draft.id}
        <p class="muted small" style="margin-bottom:var(--space-3)">{m.hair_removal_photo_hint()}</p>
      {:else}
        <PhotoSection
          section={sessionPhotos}
          read={photosQuery}
          role={roleAt(activeFlag.roles, SECTION_ROLE.sessions)}
          handle="hair-removal-photo"
          deleteLabel={() => m.photo_delete_sheet()}
          confirm={{
            title: m.photo_delete_sheet(),
            question: () => m.photo_delete_q(),
            hint: () => m.delete_undo_hint(),
            confirmLabel: m.delete(),
            cancelLabel: m.keep_it()
          }}
        >
          {#snippet empty()}
            <Notice
              icon="camera"
              key="hair-removal-photos-empty"
              title={m.no_photos_title()}
            />
          {/snippet}
        </PhotoSection>
      {/if}
    {/snippet}
  </RecordSheet>
</div>

<style>
  .hair-removal-week {
    position: relative;
  }
</style>
