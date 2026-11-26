<script lang="ts">
  import { undoable } from '$lib/stores/deleteUndo';
  import { journalTextAutocomplete } from '$lib/platform';
  import SourceRecordHandoff from '$lib/components/SourceRecordHandoff.svelte';
  /* One tryout, on the surface kit (phase 5 UX ticket 25).

     Four cards became four named areas, which is the call ticket 22 made
     for the entry editor and recorded in DIRECTION.md: fields sit flush to
     the page under a heading rather than inside a box, because a box drawn
     around a form says the form is one item in a list of them.

     The felt-sense entries and the photographs kept their delete beside
     them, on the kit's split row, so a row is one control and the delete
     is another rather than a button floating inside a row that also opens
     something. */
  import { replaceRoute } from '$lib/navigation/smart-back';
  import { tick } from 'svelte';
  import { m } from '$lib/paraglide/messages';
  import { spanIsInverted } from '$lib/data/span';
  import DatePicker from '$lib/components/DatePicker.svelte';
  import { journal, liveList, liveListIn } from '$lib/data/live/journal.svelte';
  import { todayEpochDay, epochDayFromDateInputValue, epochDayFromDateInputValueOrToday, dateInputValueFromEpochDay, dayRangeEndMin } from '$lib/data/epochDay';
  import { currentDay } from '$lib/stores/today.svelte';
  import { fmtDay } from '$lib/data/dates';
  import { moodName, tryoutKindName } from '$lib/data/vocabulary/labels';
  import type { FeltSenseEntry, Tryout, TryoutKind, TryoutPhoto } from '$lib/data/types';
  import { TRYOUT_KINDS } from '$lib/data/rowValues';
  import type { NormalizedPhoto } from '$lib/data/journal/photos';
  import Icon from '$lib/components/Icon.svelte';
  import ScreenHeader from '$lib/components/ScreenHeader.svelte';
  import ChoiceChips from '$lib/components/kit/ChoiceChips.svelte';
  import MoodFace from '$lib/components/MoodFace.svelte';
  import MoodPicker from '$lib/components/MoodPicker.svelte';
  import EntryDays from '$lib/components/EntryDays.svelte';
  import { entryDayGroups } from '$lib/data/recentEntries';
  import Skeleton from '$lib/components/Skeleton.svelte';
  import Field from '$lib/components/kit/Field.svelte';
  import FieldGroupHeading from '$lib/components/kit/FieldGroupHeading.svelte';
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
  import { scrollBehavior } from '$lib/motion/tokens';
  import { activeFlag } from '$lib/theme/activeFlag.svelte';
  import { roleAt } from '$lib/theme/roles';
  import ReadGate from '$lib/components/kit/ReadGate.svelte';
  import { prefs } from '$lib/data/prefs/store.svelte';
  import AdoptTryoutConfirmationSheet from '$lib/components/AdoptTryoutConfirmationSheet.svelte';
  import DiscardSheet from '$lib/components/kit/DiscardSheet.svelte';
  import { writer } from '$lib/stores/attempt.svelte';
  import { OFFERS, answerOffer, type OfferAnswer, type TryoutAdoption } from '$lib/data/offers';

  /* Three areas below the form: how it has felt, what it looked like, and
     what was written while it ran. */
  const SECTION_ROLE = { feeling: 0, photos: 1, entries: 2 };

  const KIND_OPTIONS = TRYOUT_KINDS.map((value) => ({ value, label: tryoutKindName(value) }));

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
    }),
    saving: () => saving
  });
  let draft = $derived(detail.draft);
  let rangeInverted = $derived(spanIsInverted({
    startEpochDay: epochDayFromDateInputValueOrToday(draft.start),
    endEpochDay: epochDayFromDateInputValue(draft.end)
  }));
  let saving = $state(false);
  let saveFailed = $state(false);
  let saved = $state(false);
  let creationId = $state<string | null>(null);
  let navigationFailed = $state(false);
  let outcome: HTMLParagraphElement | undefined = $state();

  $effect(() => {
    detail.id;
    creationId = null;
    navigationFailed = false;
    saved = false;
    saveFailed = false;
  });

  $effect(() => {
    if (detail.changed) saved = false;
  });

  async function focusOutcome() {
    await tick();
    outcome?.focus({ preventScroll: true });
    outcome?.scrollIntoView({ block: 'center', behavior: scrollBehavior() });
  }

  async function openCreatedTryout() {
    if (!creationId) return;
    try {
      await replaceRoute(`/transition/tryouts/${creationId}`);
      navigationFailed = detail.isNew;
    } catch {
      navigationFailed = true;
    }
    if (navigationFailed) await focusOutcome();
  }

  async function saveTryout() {
    if (saving || creationId && detail.isNew || !draft.label.trim() || rangeInverted) return;
    const isNew = detail.isNew;
    saving = true;
    saveFailed = false;
    saved = false;
    try {
      const id = await journal.tryouts.upsertTryout({
        id: detail.record?.id,
        kind: draft.kind,
        label: draft.label,
        description: hasDescription(draft.kind) ? draft.description : null,
        startEpochDay: epochDayFromDateInputValueOrToday(draft.start),
        endEpochDay: draft.end ? epochDayFromDateInputValue(draft.end) : null
      });
      detail.commit();
      if (isNew) creationId = id;
      else saved = true;
    } catch {
      saveFailed = true;
    } finally {
      saving = false;
    }
    if (saveFailed) return;
    /* Straight onto the new tryout, which is where its felt-sense section
       is. This used to go back to the list instead, because navigating
       within the same [id] route reuses this component instance and the
       route parameter was captured in a const that never updated - so the
       section stayed hidden after a create. The parameter is read through
       detailDraft now, which is the module that reads it reactively. */
    if (isNew) await openCreatedTryout();
    else await focusOutcome();
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
    remove: (id) => undoable((j) => j.tryouts.deletePhoto(id)),
    reference: () => lastPhotoReference(photos)
  });

  const HISTORY_LIMIT = 50;
  let feelingQuery = liveList((j) => (detail.isNew ? Promise.resolve([]) : j.feltSense.forTryout(detail.id)));
  let feeling = $derived(feelingQuery.rows);

  /* Phase 5 performance ticket 07/08: an open-ended tryout's range has no
     upper bound, so a page limit is the only thing that keeps this bounded.
     Newest first, same as the query's own ORDER BY - "load more" reaches
     further back, the same shape search/+page.svelte already uses.

     Five rather than search's thirty (final audit U14): a months-long
     tryout put forty entries between the felt-sense log and the end of the
     screen, and this list is a glance at what was written while it ran, not
     the place to read it all. */
  const PAGE = 5;
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
    detail.record ? { start: detail.record.startEpochDay, end: detail.record.endEpochDay ?? currentDay() } : null
  );
  const compareLink = compareStretchLink(() => stretch);
  const TRYOUT_COMPARE_COPY = {
    title: m.tryout_compare_title,
    openHint: m.tryout_compare_open_hint,
    tooShort: m.tryout_compare_too_short,
    noPrecedingData: m.tryout_compare_no_data,
    action: m.open_compare
  };

  let feelingMood = $state<number | null>(null);
  let feelingNote = $state('');
  /* One reading per tap, and a failed one keeps the mood and note and says
     so (UI 17). Only what was sent is cleared: a mood or note changed while
     the write ran is the next reading, not this one. */
  const feelingWrite = writer();
  async function addFeeling() {
    const mood = feelingMood;
    if (mood == null) return;
    const typed = feelingNote;
    const note = typed.trim() || null;
    if (!(await feelingWrite.run(() => journal.feltSense.add({ tryoutId: detail.id }, { epochDay: todayEpochDay(), mood, note }), m.write_failed()))) return;
    if (feelingMood === mood) feelingMood = null;
    if (feelingNote === typed) feelingNote = '';
  }

  const feelingRecord = recordEditor<FeltSenseEntry>({
    remove: (id) => undoable((j) => j.feltSense.remove(id)),
    findById: (id) => feeling.find((f) => f.id === id)
  });
  /* One example per kind, so changing the picker changes the hint too.
     "Other" has none to give: its label already asks what it is. */
  function labelPlaceholder(kind: TryoutKind): string | undefined {
    if (kind === 'name') return m.tryout_label_placeholder_name();
    if (kind === 'pronouns') return m.tryout_label_placeholder_pronouns();
    if (kind === 'style') return m.tryout_label_placeholder_style();
    if (kind === 'makeup') return m.tryout_label_placeholder_makeup();
    return undefined;
  }

  /* One entry in the offer registry (phase 8 features ticket 22,
     ADR-0045). No `openOffer` guard here, unlike the roadmap and the
     surgery hub: what stops this being offered twice is `canAdopt` below -
     a tryout that has ended cannot be adopted again - and there is no
     minted record to check for.

     The middle answer, adopt without a milestone, is a decline of the
     milestone that still writes the adoption, so it goes through
     `answerOffer` as a confirmation carrying `createMilestone: false`
     rather than as `'decline'`. offers.ts's header records the
     difference. */
  const ADOPT_OFFER = OFFERS['tryout-adoption-milestone'];
  let adoptOpen = $state(false);
  let canAdopt = $derived(
    !detail.isNew &&
    (draft.kind === 'name' || draft.kind === 'pronouns') &&
    detail.record?.endEpochDay == null
  );

  async function answerAdoptOffer(
    given: OfferAnswer,
    options: {
      createMilestone: boolean;
      milestoneTitle: string;
      milestoneEpochDay: number;
      updateProfileName: boolean;
    } | null
  ) {
    const subject: TryoutAdoption | null =
      adoptOpen && !detail.isNew && detail.record && options
        ? {
            tryoutId: detail.id,
            endEpochDay: todayEpochDay(),
            createMilestone: options.createMilestone,
            milestoneTitle: options.milestoneTitle,
            milestoneEpochDay: options.milestoneEpochDay
          }
        : null;

    if (saving) return;
    adoptOpen = false;
    saving = true;
    saveFailed = false;
    try {
      if (await answerOffer(ADOPT_OFFER, subject, given, journal)) {
        /* The stored name, never the milestone's title or an unsaved edit
           in the label field: the switch promised "use {name}", and a
           milestone renamed "Started going by Alex" is not what anyone
           wants to be called (phase 15 after-release ticket 15). */
        if (options?.updateProfileName && detail.record?.kind === 'name') {
          prefs.name = detail.record.label;
        }
        const endEpochDay = todayEpochDay();
        draft.end = dateInputValueFromEpochDay(endEpochDay);
        if (detail.record) detail.commit({ ...detail.record, endEpochDay });
      }
    } catch {
      saveFailed = true;
    } finally {
      saving = false;
    }
  }
</script>


<div class="screen">
  <ScreenHeader title={detail.isNew ? m.tryout_new_title() : m.tryout_edit_title()} back="/transition/tryouts" />
  <SourceRecordHandoff id={detail.isNew ? null : detail.id} ready={!detail.loading && !detail.failed} found={!!detail.record} />

  {#if detail.failed}
    <Notice key="tryout-read" title={detail.record ? m.read_refresh_failed() : m.read_failed()}
      text={detail.record ? m.read_stale_body() : undefined}
      action={{ label: m.read_retry(), onclick: () => detail.retry() }} />
  {/if}
  {#if detail.loading && !detail.failed}
    <div out:crossfade><Skeleton variant="block" count={3} /></div>
  {:else if detail.isNew || detail.record}

  <fieldset disabled={saving || detail.isNew && creationId !== null} aria-busy={saving}>
    <!-- Two named parts, what and when (bug session 18, item 74): the form
         was five fields in a row, and its first two labels, "What are you
         trying?" and "What is it?", asked nearly the same thing. -->
    <FieldGroupHeading legend={m.tryout_group_what()} />
    <Field label={m.tryout_kind_label()} legend>
      {#snippet children()}
        <ChoiceChips
          name={m.tryout_kind_label()}
          options={KIND_OPTIONS}
          value={draft.kind}
          onChange={(v) => (draft.kind = v as TryoutKind)}
          key="tryout-kind"
        />
      {/snippet}
    </Field>
    <Field label={m.name_label()} hint={m.tryout_label_required()} id="tr-label">
      {#snippet children(id, describedBy)}
        <input autocomplete={journalTextAutocomplete()}
          class="input"
          {id}
          name="tr-label"
          required
          aria-invalid={!draft.label.trim()}
          aria-describedby={describedBy}
          placeholder={labelPlaceholder(draft.kind)}
          bind:value={draft.label}
        />
      {/snippet}
    </Field>
    {#if hasDescription(draft.kind)}
      <div class="disclosed" transition:disclose>
        <Field label={m.tryout_description_label()} id="tr-description">
          {#snippet children(id)}
            <textarea autocomplete={journalTextAutocomplete()}
              class="input"
              {id}
              rows="2"
              bind:value={draft.description}
            ></textarea>
          {/snippet}
        </Field>
      </div>
    {/if}
    <!-- When, as one pair: Started and Ended are one question, and side by
         side they read as a span rather than two more rows of the form.
         The end hint sits under its input so the two inputs share a top
         edge, the lab editor's Value and Unit. -->
    <FieldGroupHeading legend={m.tryout_group_when()} />
    <div class="cd-endpoints tryout-span">
      <Field label={m.started_label()} id="tr-start">
        {#snippet children(id)}
          <DatePicker name="tr-start" bind:value={draft.start} {id} />
        {/snippet}
      </Field>
      <Field label={m.tryout_end_label()} hint={m.tryout_end_hint()} hintAfter id="tr-end">
        {#snippet children(id, describedBy)}
          <DatePicker name="tr-end" min={dayRangeEndMin(draft.start)} bind:value={draft.end} {id} describedBy={rangeInverted ? `${describedBy} tr-range-error` : describedBy} aria-invalid={rangeInverted || undefined} />
        {/snippet}
      </Field>
    </div>
    <div aria-live="polite">
      {#if rangeInverted}
        <div class="disclosed" transition:disclose>
          <p class="muted small" id="tr-range-error">{m.era_conflict_inverted()}</p>
        </div>
      {/if}
    </div>
    <div class="details-actions">
      <button
        class="btn btn-primary press"
        data-save-tryout
        disabled={draft.label.trim().length === 0 || rangeInverted}
        aria-describedby={rangeInverted ? "tr-range-error" : undefined}
        onclick={saveTryout}
      >
        <span>{detail.isNew ? m.save() : m.save_changes()}</span>
      </button>
      {#if canAdopt}
        <div class="action-slot">
          <button
            type="button"
            class="btn btn-soft press"
            data-adopt-tryout
            onclick={() => (adoptOpen = true)}
          >
            <Icon name="check" size={18} />
            <span>{m.tryout_adopt_permanently()}</span>
          </button>
        </div>
      {/if}
    </div>
  </fieldset>
  {#if saveFailed || navigationFailed && detail.isNew || saved}
    <div class="disclosed" transition:disclose>
      {#if saveFailed}
        <p class="notice notice-danger" role="alert">{m.record_save_failed()}</p>
      {:else if navigationFailed && detail.isNew}
        <p class="notice" role="status" tabindex="-1" bind:this={outcome} data-tryout-saved>{m.tryout_saved_navigation_failed()}</p>
        <button class="btn btn-primary" data-tryout-continue onclick={openCreatedTryout}><span>{m.tryout_saved_continue()}</span></button>
      {:else}
        <p class="notice" role="status" tabindex="-1" bind:this={outcome} data-tryout-saved>{m.saved()}</p>
      {/if}
    </div>
  {/if}

  {#if !detail.isNew}
    <SectionHeading text={m.tryout_feeling_title()} />
    <!-- First in how it has felt rather than after the entries (final
         audit U14, Alicja 2026-09-22): the one control that acts on the
         whole stretch, so it opens the section instead of sitting behind
         forty rows of what was written during it. -->
    {#if compareLink.state.status !== 'hidden'}
      {@const compareNotice = compareStretchNoticeProps(compareLink.state, openEnded, TRYOUT_COMPARE_COPY)}
      <div class="screen-part">
        <Notice
          icon="columns"
          key="tryout-compare"
          role={roleAt(activeFlag.roles, SECTION_ROLE.feeling)}
          title={compareNotice.title}
          text={compareNotice.text}
          action={compareNotice.action}
        />
      </div>
    {/if}
    <MoodPicker value={feelingMood} onPick={(v) => (feelingMood = v)} compact />
    <!-- Named rather than left to its placeholder, which is an example
         that disappears the moment somebody types into it: every other
         note in the app (labs, dilation, a visit) carries a label, and
         this was the one field on the screen with none. -->
    <Field label={m.note_label()} id="tr-feeling-note">
      {#snippet children(id)}
        <textarea autocomplete={journalTextAutocomplete()}
          class="input"
          {id}
          rows="2"
          placeholder={m.tryout_feeling_note_placeholder()}
          bind:value={feelingNote}
        ></textarea>
      {/snippet}
    </Field>
    <button
      class="btn btn-soft btn-block press"
      style="margin:var(--space-3) 0"
      disabled={feelingMood == null || feelingWrite.busy}
      data-add-feeling
      onclick={addFeeling}
    >
      <span>{m.tryout_feeling_save()}</span>
    </button>
    <ReadGate read={feelingQuery} variant="line" count={2}>
      {#snippet rows()}
        <ListCard role={roleAt(activeFlag.roles, SECTION_ROLE.feeling)}>
          {#each feeling.slice(0, HISTORY_LIMIT) as f (f.id)}
            <!-- The reading first, then when (phase 15 after-release ticket
                 15): this log is "how it's felt", and rows that held only a
                 date never said how. A reading saved or deleted here opens
                 or closes its row rather than appearing or vanishing in one
                 frame; the rows already there when the log loads do not. -->
            <div class="rows-divide" transition:disclose>
              <ListRow
                static
                data-feeling={f.id}
                data-feeling-mood={f.mood}
                title={moodName(f.mood)}
                subtitle={[dayLabel(f.epochDay), f.note]}
                action={{
                  icon: 'trash',
                  label: m.tryout_feeling_delete_sheet(),
                  onclick: () => feelingRecord.askToDelete(f),
                  attrs: { 'data-delete-feeling': f.id }
                }}
              >
                {#snippet leading()}
                  <span class="feeling-face"><MoodFace step={f.mood} size={36} /></span>
                {/snippet}
              </ListRow>
            </div>
          {/each}
        </ListCard>
      {/snippet}
      {#snippet empty()}
        <Notice
          icon="heart"
          key="tryout-feeling-empty"
          role={roleAt(activeFlag.roles, SECTION_ROLE.feeling)}
          text={m.tryout_feeling_none()}
        />
      {/snippet}
    </ReadGate>

    <SectionHeading text={m.photos_title()} />
    <PhotoSection
      section={tryoutPhotos}
      read={photosQuery}
      role={roleAt(activeFlag.roles, SECTION_ROLE.photos)}
      handle="tryout-photo"
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
        <div class="screen-part">
          <Notice
            icon="camera"
            key="tryout-photos-empty"
            role={roleAt(activeFlag.roles, SECTION_ROLE.photos)}
            title={m.no_photos_title()}
          />
        </div>
      {/snippet}
    </PhotoSection>

    <SectionHeading text={m.tryout_entries_title()} />
    <ReadGate read={entriesInRangeRead} variant="card" count={2}>
      {#snippet rows()}
        <!-- Days of entries, the drawing every list of entries uses (release
             audit U9). -->
        <EntryDays groups={entryDayGroups(entriesInRange)} />
      {/snippet}
      {#snippet empty()}
        <Notice
          icon="book"
          key="tryout-entries-empty"
          role={roleAt(activeFlag.roles, SECTION_ROLE.entries)}
          title={m.tryout_entries_none()}
        />
      {/snippet}
    </ReadGate>
    <!-- Below the gate rather than inside it: the gate's box clips while it
         grows (motion/reveal.ts `resize`), so a button inside it vanished
         for the length of every "more" and reappeared at the bottom. Out
         here it rides the growing edge down, and opens and closes its own
         height when it arrives with the first page or goes with the last. -->
    {#if entriesRemaining > 0}
      <div class="screen-part" transition:disclose>
        <button class="btn btn-soft btn-block" data-tryout-entries-more onclick={() => (pages += 1)}>
          <span>{m.list_more({ count: Math.min(PAGE, entriesRemaining) })}</span>
        </button>
      </div>
    {/if}
  {/if}

  <RecordSheet
    record={feelingRecord}
    handle="feeling"
    confirm={{
      title: m.tryout_feeling_delete_sheet(),
      question: () => m.tryout_feeling_delete_q(),
      hint: () => m.delete_undo_hint(),
      confirmLabel: m.delete(),
      cancelLabel: m.keep_it()
    }}
  />

  <AdoptTryoutConfirmationSheet
    open={adoptOpen}
    copy={ADOPT_OFFER.copy}
    tryout={detail.record ?? null}
    feltSense={feeling}
    onConfirm={(options) => answerAdoptOffer('confirm', options)}
    onDismiss={() => void answerAdoptOffer('decline', null)}
  />
  {/if}
</div>

<DiscardSheet guard={detail.guard} />

<style>
  .feeling-face {
    flex: 0 0 auto;
    display: grid;
    place-items: center;
  }

  @container app (max-width: 359px) {
    .tryout-span {
      grid-template-columns: 1fr;
    }
  }

  fieldset {
    border: 0;
    padding: 0;
    margin: 0;
    min-width: 0;
  }
</style>
