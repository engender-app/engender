<script lang="ts">
  /* Electrolysis and laser sessions, on the surface kit (phase 5 UX
     ticket 25). Two lists on the screen and a third inside the editor,
     all of them `.list-group` before this; the recency figures and the
     session photos state something and go nowhere, so they are static
     rows, and the sessions themselves open the editor. */
  import { m } from '$lib/paraglide/messages';
  import { journal, liveList } from '$lib/data/live/journal.svelte';
  import { hairRemovalAreaName, hairRemovalMethodName, severityName } from '$lib/data/vocabulary/labels';
  import { daysSinceLastSession } from '$lib/data/hairRemovalSchedule';
  import { HAIR_REMOVAL_AREAS } from '$lib/data/hairRemovalAreas';
  import { fmtDay } from '$lib/data/dates';
  import { todayEpochDay, epochDayFromDateInputValueOrToday, dateInputValueFromEpochDay } from '$lib/data/epochDay';
  import type { HairRemovalSession, HairRemovalMethod } from '$lib/data/types';
  import { HAIR_REMOVAL_METHODS } from '$lib/data/types';
  import type { HairRemovalPhoto } from '$lib/data/journal/hairRemoval';
  import type { NormalizedPhoto } from '$lib/data/journal/photos';
  import Icon from '$lib/components/Icon.svelte';
  import ScreenHeader from '$lib/components/ScreenHeader.svelte';
  import Segmented from '$lib/components/Segmented.svelte';
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

  /* Two areas: how long since each area was last worked on, and the
     sessions themselves. */
  const SECTION_ROLE = { recency: 0, sessions: 1 };

  const PAIN_RATINGS = [1, 2, 3, 4, 5];

  const today = todayEpochDay();

  let sessionsQuery = liveList((j) => j.hairRemoval.getSessions());
  let sessions = $derived(sessionsQuery.rows);

  let recency = $derived(daysSinceLastSession(sessions, today));

  const dayLabel = (epochDay: number) => fmtDay(epochDay, { day: 'numeric', month: 'long', year: 'numeric' });

  const record = recordEditor<
    HairRemovalSession,
    { id?: string; date: string; area: string; method: HairRemovalMethod; painRating: string; cost: string; provider: string }
  >({
    blank: () => ({ date: dateInputValueFromEpochDay(today), area: HAIR_REMOVAL_AREAS[0], method: 'laser', painRating: '3', cost: '', provider: '' }),
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

  <ReadGate read={sessionsQuery} variant="line" count={3}>
    {#snippet rows()}
      <div class="screen-part">
        <SectionHeading text={m.hair_removal_recency_title()} />
        <ListCard role={roleAt(activeFlag.roles, SECTION_ROLE.recency)}>
          {#each HAIR_REMOVAL_AREAS as area (area)}
            {@const days = recency[area]}
            <ListRow
              static
              data-recency={area}
              title={hairRemovalAreaName(area)}
              subtitle={days === null
                ? m.hair_removal_area_never_used()
                : m.hair_removal_area_days_ago({ days: m.n_days({ n: days }) })}
            />
          {/each}
        </ListCard>

        <SectionHeading text={m.hair_removal()} />
        <ListCard role={roleAt(activeFlag.roles, SECTION_ROLE.sessions)}>
          {#each [...sessions].reverse() as session (session.id)}
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
      </div>
    {/snippet}
    {#snippet empty()}
      <div class="screen-part">
        <Notice
          icon="shuffle"
          key="hair-removal-empty"
          role={roleAt(activeFlag.roles, SECTION_ROLE.sessions)}
          title={m.hair_removal_empty_title()}
          text={m.hair_removal_empty_body()}
          action={{ label: m.hair_removal_empty_action(), primary: true, onclick: () => record.openEditor(null) }}
        />
      </div>
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
          <input class="input" type="date" {id} name="hair-removal-date" bind:value={draft.date} />
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
            options={PAIN_RATINGS.map((v) => ({ value: String(v), label: severityName(v) }))}
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
