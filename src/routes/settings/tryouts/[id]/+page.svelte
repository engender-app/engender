<script lang="ts">
  /* One tryout, on the surface kit (phase 5 UX ticket 25).

     Four cards became four named areas, which is the call ticket 22 made
     for the entry editor and recorded in DIRECTION.md: fields sit flush to
     the page under a heading rather than inside a box, because a box drawn
     around a form says the form is one item in a list of them.

     The felt-sense entries and the photographs kept their delete beside
     them, on the kit's split row, so a row is one control and the delete
     is another rather than a button floating inside a row that also opens
     something. */
  import { goto } from '$app/navigation';
  import { m } from '$lib/paraglide/messages';
  import DatePicker from '$lib/components/DatePicker.svelte';
  import { journal, liveList, liveListIn, liveQuery } from '$lib/data/live/journal.svelte';
  import { todayEpochDay, epochDayFromDateInputValue, epochDayFromDateInputValueOrToday, dateInputValueFromEpochDay } from '$lib/data/epochDay';
  import { fmtDay } from '$lib/data/dates';
  import { tryoutKindName } from '$lib/data/vocabulary/labels';
  import type { FeltSenseEntry, Tryout, TryoutKind, TryoutPhoto } from '$lib/data/types';
  import type { NormalizedPhoto } from '$lib/data/journal/photos';
  import Icon from '$lib/components/Icon.svelte';
  import ScreenHeader from '$lib/components/ScreenHeader.svelte';
  import Segmented from '$lib/components/Segmented.svelte';
  import MoodPicker from '$lib/components/MoodPicker.svelte';
  import EntryCard from '$lib/components/EntryCard.svelte';
  import Skeleton from '$lib/components/Skeleton.svelte';
  import Field from '$lib/components/kit/Field.svelte';
  import ListCard from '$lib/components/kit/ListCard.svelte';
  import ListRow from '$lib/components/kit/ListRow.svelte';
  import Notice from '$lib/components/kit/Notice.svelte';
  import PhotoSection from '$lib/components/kit/PhotoSection.svelte';
  import { detailDraft } from '$lib/components/kit/detailDraft.svelte';
  import { recordEditor } from '$lib/components/kit/recordEditor.svelte';
  import { photoSection } from '$lib/components/kit/photoSection.svelte';
  import { lastPhotoReference } from '$lib/components/kit/photoSection';
  import { compareStretchLink } from '$lib/components/kit/compareStretchLink.svelte';
  import { compareStretchNoticeProps } from '$lib/data/compareStretch';
  import RecordSheet from '$lib/components/kit/RecordSheet.svelte';
  import SectionHeading from '$lib/components/kit/SectionHeading.svelte';
  import { crossfade, disclose } from '$lib/motion/reveal';
  import { activeFlag } from '$lib/theme/activeFlag.svelte';
  import { roleAt } from '$lib/theme/roles';
  import ReadGate from '$lib/components/kit/ReadGate.svelte';
  import { prefs } from '$lib/data/prefs/store.svelte';
  import AdoptTryoutConfirmationSheet from '$lib/components/AdoptTryoutConfirmationSheet.svelte';

  /* Three areas below the form: how it has felt, what it looked like, and
     what was written while it ran. */
  const SECTION_ROLE = { feeling: 0, photos: 1, entries: 2 };

  const KINDS: TryoutKind[] = ['name', 'pronouns', 'style', 'garment', 'makeup', 'presentation_step'];
  const KIND_OPTIONS = KINDS.map((value) => ({ value, label: tryoutKindName(value) }));

  // A name or pronoun set already gets a placeholder shaped for it; every
  // other kind gets the free-text description instead (ticket 13's own
  // scope split).
  const hasDescription = (kind: TryoutKind) => kind !== 'name' && kind !== 'pronouns';

  const dayLabel = (epochDay: number) => fmtDay(epochDay, { day: 'numeric', month: 'short', year: 'numeric' });

  const detail = detailDraft<Tryout, { kind: TryoutKind; label: string; description: string; start: string; end: string }>({
    read: async (j, id) => (await j.tryouts.getTryouts()).find((t) => t.id === id),
    blank: () => ({
      kind: 'name',
      label: '',
      description: '',
      start: dateInputValueFromEpochDay(todayEpochDay()),
      end: ''
    }),
    fromRecord: (found) => ({
      kind: found.kind,
      label: found.label,
      description: found.description ?? '',
      start: dateInputValueFromEpochDay(found.startEpochDay),
      end: found.endEpochDay == null ? '' : dateInputValueFromEpochDay(found.endEpochDay)
    })
  });
  let draft = $derived(detail.draft);

  async function saveTryout() {
    const id = await journal.tryouts.upsertTryout({
      id: detail.record?.id,
      kind: draft.kind,
      label: draft.label,
      description: hasDescription(draft.kind) ? draft.description : null,
      startEpochDay: epochDayFromDateInputValueOrToday(draft.start),
      endEpochDay: draft.end ? epochDayFromDateInputValue(draft.end) : null
    });
    /* Straight onto the new tryout, which is where its felt-sense section
       is. This used to go back to the list instead, because navigating
       within the same [id] route reuses this component instance and the
       route parameter was captured in a const that never updated - so the
       section stayed hidden after a create. The parameter is read through
       detailDraft now, which is the module that reads it reactively. */
    if (detail.isNew) await goto(`/settings/tryouts/${id}`);
  }

  /* Only once a tryout has its own id, the same reasoning hair-removal's
     own photo section gives: a photo belongs to one tryout, so there is
     nothing to attach it to before that first save. */
  let photosQuery = liveList((j) => (detail.isNew ? Promise.resolve([]) : j.tryouts.getPhotos(detail.id)));
  let photos = $derived(photosQuery.rows);

  async function storePhoto(photo: NormalizedPhoto): Promise<void> {
    if (detail.isNew) return;
    await journal.tryouts.addPhoto(detail.id, todayEpochDay(), photo);
  }

  const tryoutPhotos = photoSection<TryoutPhoto>({
    photos: () => photos,
    add: storePhoto,
    remove: (id) => journal.tryouts.deletePhoto(id),
    reference: () => lastPhotoReference(photos)
  });

  const HISTORY_LIMIT = 50;
  let feelingQuery = liveList((j) => (detail.isNew ? Promise.resolve([]) : j.feltSense.forTryout(detail.id)));
  let feeling = $derived(feelingQuery.rows);

  /* Phase 5 performance ticket 07/08: an open-ended tryout's range has no
     upper bound, so a page limit is the only thing that keeps this bounded.
     Newest first, same as the query's own ORDER BY - "load more" reaches
     further back, the same shape search/+page.svelte already uses. */
  const PAGE = 30;
  let pages = $state(1);

  /* Reset by anything that changes what range is being read, the same
     reason search/+page.svelte's own `pages` reset gives: page three of
     one range is not page three of a different one, and leaving it where
     it was after an edit would silently ask for pages*PAGE entries in what
     might now be a much smaller range. */
  $effect(() => {
    detail.record?.startEpochDay;
    detail.record?.endEpochDay;
    pages = 1;
  });

  /* One default for the whole answer, as on the search screen: the page and
     its count are one read, and defaulting them apart let the two disagree. */
  const NOTHING_IN_RANGE = { hits: [], total: 0 };

  /* Through the record rather than beside it: the range comes from the
     tryout, so this only runs once there is one and only counts as answered
     once the answer was read for the tryout on the route. Read beside it,
     the first run had no range to search, answered with nothing, and left
     "no entries in this range" on screen over a tryout with ninety of them
     (detailDraft.ts, and the browser-tier probe for it). */
  let entriesQuery = detail.readingRecord((j, tryout) => {
    const range = { startEpochDay: tryout.startEpochDay, endEpochDay: tryout.endEpochDay };
    return Promise.all([
      j.entries.searchEntries('', [], range, PAGE * pages),
      j.entries.countSearchMatches('', [], range)
    ]).then(([hits, total]) => ({ hits, total }));
  });
  /* The page of hits, gated like any list; the count beside it is the read's
     other half and is not the page's length. */
  let entriesInRangeRead = liveListIn(entriesQuery, (page) => page.hits);
  let entriesInRange = $derived(entriesInRangeRead.rows);
  let entriesRemaining = $derived(
    Math.max(0, (entriesQuery.value ?? NOTHING_IN_RANGE).total - entriesInRange.length)
  );

  /* Ticket 18: this stretch as one side of `/compare`, and the same-length
     window before it as the other - an open-ended tryout's own end clamps
     to today at read time and is never stored (ADR-0049, ADR-0010), the
     same clamp `periodFromEra` already gives an open era on `/compare`
     itself. `compareStretchLink` answers whether there is enough journal
     to offer that at all. */
  let openEnded = $derived(detail.record ? detail.record.endEpochDay === null : false);
  let stretch = $derived(
    detail.record ? { start: detail.record.startEpochDay, end: detail.record.endEpochDay ?? todayEpochDay() } : null
  );
  const compareLink = compareStretchLink(() => stretch);
  const TRYOUT_COMPARE_COPY = {
    title: m.tryout_compare_title,
    openHint: m.tryout_compare_open_hint,
    tooShort: m.tryout_compare_too_short,
    noPrecedingData: m.tryout_compare_no_data,
    action: m.tryout_compare_action
  };

  let feelingMood = $state<number | null>(null);
  let feelingNote = $state('');
  async function addFeeling() {
    if (feelingMood == null) return;
    await journal.feltSense.add(
      { tryoutId: detail.id },
      { epochDay: todayEpochDay(), mood: feelingMood, note: feelingNote.trim() || null }
    );
    feelingMood = null;
    feelingNote = '';
  }

  const feelingRecord = recordEditor<FeltSenseEntry>({
    remove: (id) => journal.feltSense.remove(id),
    findById: (id) => feeling.find((f) => f.id === id)
  });
  /* One example per kind. Name and pronouns had their own and the other four
     shared "a short name for it", so moving between Style, Garment, Makeup
     and Presentation step changed the highlight and nothing else - which
     reads as a switcher that does not work (Alicja, 2026-08-26). An example
     of the thing itself is the shortest way to say what the kind means. */
  function labelPlaceholder(kind: TryoutKind): string {
    if (kind === 'name') return m.tryout_label_placeholder_name();
    if (kind === 'pronouns') return m.tryout_label_placeholder_pronouns();
    if (kind === 'style') return m.tryout_label_placeholder_style();
    if (kind === 'garment') return m.tryout_label_placeholder_garment();
    if (kind === 'makeup') return m.tryout_label_placeholder_makeup();
    if (kind === 'presentation_step') return m.tryout_label_placeholder_presentation_step();
    return m.tryout_label_placeholder_other();
  }

  let adoptOpen = $state(false);
  let canAdopt = $derived(
    !detail.isNew &&
    (draft.kind === 'name' || draft.kind === 'pronouns') &&
    detail.record?.endEpochDay == null
  );

  async function handleAdoptConfirm(options: {
    createMilestone: boolean;
    milestoneTitle: string;
    milestoneEpochDay: number;
    updateProfileName: boolean;
  }) {
    if (detail.isNew || !detail.record) return;
    await journal.tryouts.adoptTryout(detail.id, {
      endEpochDay: todayEpochDay(),
      createMilestone: options.createMilestone,
      milestoneTitle: options.milestoneTitle,
      milestoneEpochDay: options.milestoneEpochDay
    });
    if (options.updateProfileName && draft.kind === 'name') {
      prefs.name = options.milestoneTitle || draft.label;
    }
    draft.end = dateInputValueFromEpochDay(todayEpochDay());
    adoptOpen = false;
  }
</script>


<div class="screen">
  <ScreenHeader title={detail.isNew ? m.tryout_new_title() : m.tryout_edit_title()} back="/settings/tryouts" />

  <div class="editor-section">
    <Field label={m.tryout_kind_label()} legend>
      {#snippet children()}
        <Segmented
          name={m.tryout_kind_label()}
          options={KIND_OPTIONS}
          value={draft.kind}
          onChange={(v) => (draft.kind = v as TryoutKind)}
        />
      {/snippet}
    </Field>
    <Field label={m.tryout_label_label()} id="tr-label">
      {#snippet children(id)}
        <input
          class="input"
          {id}
          name="tr-label"
          placeholder={labelPlaceholder(draft.kind)}
          bind:value={draft.label}
        />
      {/snippet}
    </Field>
    {#if hasDescription(draft.kind)}
      <div class="disclosed" transition:disclose>
        <Field label={m.tryout_description_label()} id="tr-description">
          {#snippet children(id)}
            <textarea
              class="input"
              {id}
              rows="2"
              placeholder={m.tryout_description_placeholder()}
              bind:value={draft.description}
            ></textarea>
          {/snippet}
        </Field>
      </div>
    {/if}
    <Field label={m.tryout_start_label()} id="tr-start">
      {#snippet children(id)}
        <DatePicker name="tr-start" bind:value={draft.start} {id} />
      {/snippet}
    </Field>
    <Field label={m.tryout_end_label()} hint={m.tryout_end_hint()} id="tr-end">
      {#snippet children(id)}
        <DatePicker name="tr-end" bind:value={draft.end} {id} />
      {/snippet}
    </Field>
    {#if canAdopt}
      <button
        type="button"
        class="btn btn-primary press"
        data-adopt-tryout
        onclick={() => (adoptOpen = true)}
      >
        <Icon name="check" size={18} />
        <span>{m.tryout_adopt_permanently()}</span>
      </button>
    {/if}
    <button
      class="btn press"
      class:btn-primary={!canAdopt}
      class:btn-soft={canAdopt}
      data-save-tryout
      disabled={draft.label.trim().length === 0}
      onclick={saveTryout}
    >
      <span>{detail.isNew ? m.tryout_save() : m.tryout_save_changes()}</span>
    </button>
  </div>

  {#if !detail.isNew}
    <SectionHeading text={m.tryout_feeling_title()} />
    <MoodPicker value={feelingMood} onPick={(v) => (feelingMood = v)} compact />
    <textarea
      class="input"
      rows="2"
     
      placeholder={m.tryout_feeling_note_placeholder()}
      bind:value={feelingNote}
    ></textarea>
    <button
      class="btn btn-soft btn-block press"
      style="margin:var(--space-3) 0"
      disabled={feelingMood == null}
      data-add-feeling
      onclick={addFeeling}
    >
      <span>{m.tryout_feeling_save()}</span>
    </button>
    <ReadGate read={feelingQuery} variant="line" count={2}>
      {#snippet rows()}
        <div class="screen-part">
          <ListCard role={roleAt(activeFlag.roles, SECTION_ROLE.feeling)}>
            {#each feeling.slice(0, HISTORY_LIMIT) as f (f.id)}
              <ListRow
                static
                data-feeling={f.id}
                title={dayLabel(f.epochDay)}
                subtitle={f.note}
                action={{
                  icon: 'trash',
                  label: m.tryout_feeling_delete_sheet(),
                  onclick: () => feelingRecord.askToDelete(f),
                  attrs: { 'data-delete-feeling': f.id }
                }}
              />
            {/each}
          </ListCard>
        </div>
      {/snippet}
      {#snippet empty()}
        <div class="screen-part">
          <Notice
            icon="heart"
            key="tryout-feeling-empty"
            role={roleAt(activeFlag.roles, SECTION_ROLE.feeling)}
            text={m.tryout_feeling_none()}
          />
        </div>
      {/snippet}
    </ReadGate>

    <SectionHeading text={m.tryout_photo_section_title()} />
    <PhotoSection
      section={tryoutPhotos}
      read={photosQuery}
      role={roleAt(activeFlag.roles, SECTION_ROLE.photos)}
      handle="tryout-photo"
      deleteLabel={() => m.tryout_photo_delete_sheet()}
      confirm={{
        title: m.tryout_photo_delete_sheet(),
        question: () => m.tryout_photo_delete_q(),
        hint: () => m.tryout_photo_delete_hint(),
        confirmLabel: m.tryout_photo_delete(),
        cancelLabel: m.keep_it()
      }}
    >
      {#snippet empty()}
        <div class="screen-part">
          <Notice
            icon="camera"
            key="tryout-photos-empty"
            role={roleAt(activeFlag.roles, SECTION_ROLE.photos)}
            title={m.tryout_photo_empty_title()}
            text={m.tryout_photo_empty_body()}
          />
        </div>
      {/snippet}
    </PhotoSection>

    <SectionHeading text={m.tryout_entries_title()} />
    <ReadGate read={entriesInRangeRead} variant="card" count={2}>
      {#snippet rows()}
        <div class="screen-part">
          {#each entriesInRange as e (e.id)}
            <EntryCard entry={e} />
          {/each}
          {#if entriesRemaining > 0}
            <button class="btn btn-soft search-more" data-tryout-entries-more onclick={() => (pages += 1)}>
              <span>{m.search_more({ count: Math.min(PAGE, entriesRemaining) })}</span>
            </button>
          {/if}
        </div>
      {/snippet}
      {#snippet empty()}
        <div class="screen-part">
          <Notice
            icon="book"
            key="tryout-entries-empty"
            role={roleAt(activeFlag.roles, SECTION_ROLE.entries)}
            title={m.tryout_entries_none()}
            text={m.tryout_entries_none_body()}
          />
        </div>
      {/snippet}
    </ReadGate>

    {#if compareLink.state.status !== 'hidden'}
      {@const compareNotice = compareStretchNoticeProps(compareLink.state, openEnded, TRYOUT_COMPARE_COPY)}
      <div class="screen-part">
        <Notice
          icon="shuffle"
          key="tryout-compare"
          role={roleAt(activeFlag.roles, SECTION_ROLE.entries)}
          title={compareNotice.title}
          text={compareNotice.text}
          action={compareNotice.action}
        />
      </div>
    {/if}
  {/if}

  <RecordSheet
    record={feelingRecord}
    handle="feeling"
    confirm={{
      title: m.tryout_feeling_delete_sheet(),
      question: () => m.tryout_feeling_delete_q(),
      hint: () => m.tryout_feeling_delete_hint(),
      confirmLabel: m.tryout_feeling_delete(),
      cancelLabel: m.keep_it()
    }}
  />

  <AdoptTryoutConfirmationSheet
    open={adoptOpen}
    tryout={detail.record ?? null}
    feltSense={feeling}
    onConfirm={handleAdoptConfirm}
    onDismiss={() => (adoptOpen = false)}
  />
</div>
