<script lang="ts">
  import { page } from '$app/state';
  import SourceRecordHandoff from '$lib/components/SourceRecordHandoff.svelte';
  /* Electrolysis and laser sessions, on the surface kit (phase 5 UX
     ticket 25). Two lists on the screen and a third inside the editor,
     all of them `.list-group` before this; the recency rows open the
     add-session form with their own area chosen (pre-production UI/UX
     ticket 28), the session photos state something and go nowhere, so
     they stay static rows, and the sessions themselves open the editor. */
  import { m } from '$lib/paraglide/messages';
  import DatePicker from '$lib/components/DatePicker.svelte';
  import { journal, liveList } from '$lib/data/live/journal.svelte';
  import { hairRemovalAreaName, hairRemovalMethodName, severityName } from '$lib/data/vocabulary/labels';
  import { daysSinceLastSession } from '$lib/data/hairRemovalSchedule';
  import { shouldShowHairRemovalRecovery } from '$lib/data/liveTiles';
  import { HAIR_REMOVAL_AREAS, type HairRemovalAreaKey } from '$lib/data/hairRemovalAreas';
  import { fmtDay } from '$lib/data/dates';
  import { todayEpochDay, epochDayFromDateInputValueOrToday, dateInputValueFromEpochDay } from '$lib/data/epochDay';
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
  import { crossfade } from '$lib/motion/reveal';
  import { activeFlag } from '$lib/theme/activeFlag.svelte';
  import { roleAt } from '$lib/theme/roles';
  import ReadGate from '$lib/components/kit/ReadGate.svelte';
  import AreaFinish from '$lib/components/AreaFinish.svelte';

  /* The strip's fill shares the chromatic role with the recency figures
     (ticket 56, following ticket 44's own rule for dilation and wear):
     index 0 is the only role guaranteed chromatic on all 8 palettes, and a
     logged day filled in a palette's achromatic band is a day drawn as
     nothing. */
  const SECTION_ROLE = { recency: 0, strip: 0, sessions: 1 };

  const PAIN_RATINGS = [1, 2, 3, 4, 5];

  const today = todayEpochDay();

  /** The untouched draft every open starts from, named once so the
      header's add control, a strip day and a recency row cannot drift
      apart in their defaults. */
  function blankDraft(area: HairRemovalAreaKey, epochDay: number = today) {
    return {
      date: dateInputValueFromEpochDay(epochDay),
      area,
      method: 'laser' as HairRemovalMethod,
      painRating: '3',
      cost: '',
      provider: ''
    };
  }

  let sessionsQuery = liveList((j) => j.hairRemoval.getSessions());
  let sessions = $derived(sessionsQuery.rows);
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

  let weeksBack = $state(0);
  let shownWeek = $derived(stripWindow(today, weeksBack));
  let weekSessions = $derived(
    [...sessions]
      .filter((session) => session.epochDay >= shownWeek.first && session.epochDay <= shownWeek.last)
      .sort((a, b) => b.epochDay - a.epochDay)
  );

  /* Hair removal's present reading (ticket 56): the recovery state the Home
     tile already computes (liveTiles.ts), not a next-session due date -
     hairRemovalSchedule.ts refuses that framing on purpose. Read with
     `enabled`/`snoozed` fixed rather than off `prefs`: this is the area's
     own screen, not a dismissible Home nudge, so a snoozed tile has nothing
     to say about it. */
  let latestSession = $derived(
    sessions.reduce<HairRemovalSession | null>((latest, session) => {
      if (session.epochDay > today) return latest;
      if (!latest || session.epochDay > latest.epochDay) return session;
      return latest;
    }, null)
  );
  let recovery = $derived(
    shouldShowHairRemovalRecovery({ latestSession, todayEpochDay: today, enabled: true, snoozed: false })
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
    { id?: string; date: string; area: string; method: HairRemovalMethod; painRating: string; cost: string; provider: string }
  >({
    blank: () => blankDraft(HAIR_REMOVAL_AREAS[0]),
    fromRecord: (session) => ({
      id: session.id,
      date: dateInputValueFromEpochDay(session.epochDay),
      area: session.area,
      method: session.method,
      painRating: String(session.painRating),
      cost: session.cost,
      provider: session.provider
    }),
    async upsert(draft) {
      await journal.hairRemoval.upsertSession({
        id: draft.id,
        epochDay: epochDayFromDateInputValueOrToday(draft.date),
        area: draft.area,
        method: draft.method,
        painRating: Number(draft.painRating),
        cost: draft.cost,
        provider: draft.provider
      });
    },
    remove: (id) => journal.hairRemoval.deleteSession(id),
    findById: (id) => sessions.find((session) => session.id === id)
  });
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
    remove: (id) => journal.hairRemoval.deletePhoto(id),
    reference: () => lastPhotoReference(photos)
  });
</script>

<div class="screen">
  <ScreenHeader title={m.hair_removal()} back="/more" subtitle={m.hair_removal_intro()}>
    {#snippet actions()}
      <button class="icon-btn press" data-add aria-label={m.hair_removal_add_aria()} onclick={() => record.openEditor(null)}>
        <Icon name="plus" size={22} />
      </button>
    {/snippet}
  </ScreenHeader>
  <SourceRecordHandoff id={sourceId} ready={!sessionsQuery.loading && !sessionsQuery.failed} found={!!sourceSession} onOpen={() => record.openEditor(sourceSession!)} />

  <ReadGate read={sessionsQuery} variant="line" count={3}>
    {#snippet rows()}
      <!-- What is true now, before what was true before (rule 16). Two
         readings, freshest first: the recovery notice while a session is
         still close enough to say something about, then the per-area
         recency that is true on every other visit - sessions land 7 to
         300+ days apart per area (hairRemovalSchedule.ts), so unlike
         dilation and wear's daily cadence, the week the strip draws is
         usually empty and cannot carry the opening reading on its own.
         The strip stays as the log's own shape, under both. -->
      {#if recovery}
        <Notice
          icon="shuffle"
          key="hair-removal-recovery"
          role={roleAt(activeFlag.roles, SECTION_ROLE.sessions)}
          title={hairRemovalAreaName(recovery.session.area)}
          text={m.tile_hair_removal_guidance()}
        />
      {/if}
      <SectionHeading text={m.hair_removal_recency_title()} />
      <ListCard role={roleAt(activeFlag.roles, SECTION_ROLE.recency)}>
        {#each HAIR_REMOVAL_AREAS as area (area)}
          {@const days = recency[area]}
          <ListRow
            data-recency={area}
            title={hairRemovalAreaName(area)}
            subtitle={days === null
              ? m.hair_removal_area_never_used()
              : m.hair_removal_area_days_ago({ days: m.n_days({ n: days }) })}
            onclick={() => openSessionForArea(area)}
          />
        {/each}
      </ListCard>

      <SectionHeading text={m.hair_removal()} />
      {#if earliest !== null}
        <DayStrip
          {today}
          markOf={(day) => markOf(day)}
          labelOf={(day, mark) =>
            m.strip_day_state({ day: dayLabel(day), state: dayAreasLabel(day) ?? m.adherence_nothing_logged() })}
          {earliest}
          onPick={openSessionFor}
          role={roleAt(activeFlag.roles, SECTION_ROLE.strip)}
          bind:weeksBack
        />
      {/if}
      {#if weekSessions.length === 0}
        <p class="muted small" data-strip-week-empty>{m.strip_week_nothing()}</p>
      {:else}
        <ListCard role={roleAt(activeFlag.roles, SECTION_ROLE.sessions)}>
          {#each weekSessions as session (session.id)}
            <ListRow
              key={session.id}
              data-hair-removal-session={session.id}
              icon="shuffle"
              title={hairRemovalAreaName(session.area)}
              subtitle={`${dayLabel(session.epochDay)} · ${hairRemovalMethodName(session.method)} · ${severityName(session.painRating)}`}
              chevron={false}
              onclick={() => record.openEditor(session)}
            />
          {/each}
        </ListCard>
      {/if}
      <AreaFinish group="hair-removal" />
    {/snippet}
    {#snippet empty()}
      <Notice
        icon="shuffle"
        key="hair-removal-empty"
        role={roleAt(activeFlag.roles, SECTION_ROLE.sessions)}
        title={m.hair_removal_empty_title()}
        text={m.hair_removal_empty_body()}
        action={{ label: m.hair_removal_empty_action(), primary: true, onclick: () => record.openEditor(null) }}
      />
      <AreaFinish group="hair-removal" />
    {/snippet}
  </ReadGate>

  <RecordSheet
    {record}
    handle="hair-removal-session"
    newTitle={m.hair_removal_new_sheet()}
    editTitle={m.hair_removal_edit_sheet()}
    saveLabel={m.hair_removal_save()}
    deleteLabel={m.hair_removal_delete()}
    confirm={{
      title: m.hair_removal_delete_sheet(),
      question: (session) => m.hair_removal_delete_q({ area: hairRemovalAreaName(session.area) }),
      hint: () => m.hair_removal_delete_hint(),
      confirmLabel: m.hair_removal_delete(),
      cancelLabel: m.keep_it()
    }}
  >
    {#snippet fields(draft)}
      <Field label={m.hair_removal_date_label()} id="hair-removal-date">
        {#snippet children(id)}
          <DatePicker name="hair-removal-date" bind:value={draft.date} {id} />
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
      <Field label={m.hair_removal_pain_label()} legend>
        {#snippet children()}
          <Segmented
            name={m.hair_removal_pain_label()}
            options={PAIN_RATINGS.map((v) => ({ value: String(v), label: severityName(v) ?? String(v) }))}
            value={draft.painRating}
            onChange={(v) => (draft.painRating = v)}
          />
        {/snippet}
      </Field>
      <Field label={m.hair_removal_cost_label()} id="hair-removal-cost">
        {#snippet children(id)}
          <input
            class="input"
            {id}
            name="hair-removal-cost"
            placeholder={m.hair_removal_cost_placeholder()}
            bind:value={draft.cost}
          />
        {/snippet}
      </Field>
      <Field label={m.hair_removal_provider_label()} id="hair-removal-provider">
        {#snippet children(id)}
          <input
            class="input"
            {id}
            name="hair-removal-provider"
            placeholder={m.hair_removal_provider_placeholder()}
            bind:value={draft.provider}
          />
        {/snippet}
      </Field>

      <SectionHeading text={m.hair_removal_photo_section_title()} />
      {#if !draft.id}
        <p class="muted small" style="margin-bottom:var(--space-3)">{m.hair_removal_photo_hint()}</p>
      {:else}
        <PhotoSection
          section={sessionPhotos}
          read={photosQuery}
          role={roleAt(activeFlag.roles, SECTION_ROLE.sessions)}
          handle="hair-removal-photo"
          deleteLabel={() => m.hair_removal_photo_delete_sheet()}
          confirm={{
            title: m.hair_removal_photo_delete_sheet(),
            question: () => m.hair_removal_photo_delete_q(),
            hint: () => m.hair_removal_photo_delete_hint(),
            confirmLabel: m.hair_removal_photo_delete(),
            cancelLabel: m.keep_it()
          }}
        >
          {#snippet empty()}
            <Notice
              icon="camera"
              key="hair-removal-photos-empty"
              title={m.hair_removal_photo_empty_title()}
              text={m.hair_removal_photo_empty_body()}
            />
          {/snippet}
        </PhotoSection>
      {/if}
    {/snippet}
  </RecordSheet>
</div>
