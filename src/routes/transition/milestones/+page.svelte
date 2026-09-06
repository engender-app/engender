<script lang="ts">
  /* Milestones, on the surface kit (phase 5 UX ticket 25).

     Two things were crowded.

     The screen opened on an "add a milestone" card - a heading, a shuffle
     control, a dashed row for writing your own and three shuffled
     templates - so the first thing a person with fourteen milestones saw
     was a picker for a fifteenth. The templates are a sheet now, opened
     from the header's add control the way every feature screen on the hub
     opens its editor, and the screen opens on the milestones.

     And each row carried two icon buttons, an edit and a delete, on top of
     a photo, a name and a status line. Tapping the row is the edit, which
     is what a row with an editor behind it means everywhere else in the
     app; the delete stays as the row's own one control. */
  import { m } from '$lib/paraglide/messages';
  import { page } from '$app/state';
  import { replaceState } from '$app/navigation';
  import DatePicker from '$lib/components/DatePicker.svelte';
  import { journal } from '$lib/data/live/journal.svelte';
  import { milestoneStatus } from '$lib/data/milestoneStatus';
  import { prefs } from '$lib/data/prefs/store.svelte';
  import { resolveMilestoneOrigin } from '$lib/data/provenance';
  import { fmtDay } from '$lib/data/dates';
  import {
    todayEpochDay,
    epochDayFromDateInputValue,
    epochDayFromDateInputValueOrToday,
    dateInputValueFromEpochDay
  } from '$lib/data/epochDay';
  import type { Milestone, MilestoneTemplate, Photo } from '$lib/data/types';
  import type { NormalizedPhoto } from '$lib/data/journal/photos';
  import type { EditorPhoto } from '$lib/stores/photoPicking';
  import Icon from '$lib/components/Icon.svelte';
  import LinkedDocuments from '$lib/components/LinkedDocuments.svelte';
  import PhotoThumb from '$lib/components/PhotoThumb.svelte';
  import PhotoAlignmentReview from '$lib/components/PhotoAlignmentReview.svelte';
  import FeltSenseOfferSheet from '$lib/components/FeltSenseOfferSheet.svelte';
  import { OFFERS, answerOffer, type OfferAnswer } from '$lib/data/offers';
  import ScreenHeader from '$lib/components/ScreenHeader.svelte';
  import Sheet from '$lib/components/Sheet.svelte';
  import Switch from '$lib/components/Switch.svelte';
  import Field from '$lib/components/kit/Field.svelte';
  import PhotoDayPromptSheet from '$lib/components/kit/PhotoDayPromptSheet.svelte';
  import ListCard from '$lib/components/kit/ListCard.svelte';
  import ListRow from '$lib/components/kit/ListRow.svelte';
  import Notice from '$lib/components/kit/Notice.svelte';
  import { recordEditor } from '$lib/components/kit/recordEditor.svelte';
  import { photoSection } from '$lib/components/kit/photoSection.svelte';
  import RecordSheet from '$lib/components/kit/RecordSheet.svelte';
  import { activeFlag } from '$lib/theme/activeFlag.svelte';
  import { roleAt } from '$lib/theme/roles';
  import { vocabulary } from '$lib/data/vocabulary/vocabulary';

  let shown = $state(vocabulary.randomTemplates(3));
  let picking = $state(false);

  function openPicker() {
    shown = vocabulary.randomTemplates(3);
    picking = true;
  }
  /* A milestone shows one photo, so `photo` is whatever it will end up with -
     the stored row, a picked replacement, or none - and `storedPhotoId`
      remembers what was there when the editor opened, so Save can describe
      preserve, remove or replace. Nothing is committed until Save (F1), so
      closing the sheet undoes both. `originalPhoto` is that same starting
      point held separately: the alignment review (ticket 12) compares a
      retake against the photo this milestone had before this edit, even
      after removing it clears `photo` to make room for a new one. */
  type Draft = {
    id?: string;
    name: string;
    date: string;
    description: string;
    photo: EditorPhoto | null;
    storedPhotoId: string | null;
    originalPhoto: Photo | null;
    templateKey: string | null;
  };
  /* Offered, never required, right after a brand-new milestone is created
     (CONTEXT: "Felt-sense entry") - editing an existing one never opens
     this, the same reasoning ticket 24 gives for the anniversary showing
     on MilestoneCard being its own separate offer, not this one repeated. */
  let feelingOfferId = $state<string | null>(null);

  // Mirrored, and the journal already orders them by day (ADR-0004).
  let sorted = $derived(vocabulary.milestones);

  /* What a blank draft is seeded from, set by whichever row of the picker
     was tapped just before it opens. Held beside the editor rather than
     passed through it: `openEditor` takes the record being edited, and a
     template is not one - it is a name and a key for a milestone that does
     not exist yet. */
  let template: MilestoneTemplate | null = null;

  const record = recordEditor<Milestone, Draft>({
    blank: () => ({
      name: template?.name ?? '',
      date: dateInputValueFromEpochDay(todayEpochDay()),
      description: '',
      photo: null,
      storedPhotoId: null,
      originalPhoto: null,
      templateKey: template?.key ?? null
    }),
    fromRecord: (existing) => ({
      id: existing.id,
      name: existing.name,
      date: dateInputValueFromEpochDay(existing.epochDay),
      description: existing.description,
      photo: existing.photo && { kind: 'stored', photo: existing.photo },
      storedPhotoId: existing.photo?.id ?? null,
      originalPhoto: existing.photo ?? null,
      templateKey: existing.templateKey
    }),
    async upsert(draft) {
      const isNew = !draft.id;
      const photo =
        draft.photo?.kind === 'picked'
          ? { action: 'replace' as const, photo: draft.photo.photo }
          : draft.storedPhotoId && !draft.photo
            ? { action: 'remove' as const }
            : { action: 'preserve' as const };

      const id = await journal.milestones.upsertMilestone({
        id: draft.id,
        name: draft.name.trim() || m.ms_default_name(),
        epochDay: epochDayFromDateInputValueOrToday(draft.date),
        description: draft.description,
        templateKey: draft.templateKey,
        photo
      });
      if (isNew) feelingOfferId = id;
    },
    remove: (id) => journal.milestones.deleteMilestone(id),
    findById: (id) => sorted.find((mi) => mi.id === id)
  });

  function statusText(mi: Milestone): string {
    const s = milestoneStatus(mi, todayEpochDay());
    if (s.type === 'countdown') return m.ms_status_in_days({ days: m.n_days({ n: s.days ?? 0 }) });
    if (s.type === 'today') return m.ms_status_today();
    return m.ms_status_years_ago({ years: m.n_years({ n: s.years ?? 0 }) });
  }

  function openEditor(existing: Milestone | null, seed: MilestoneTemplate | null) {
    picking = false;
    template = seed;
    record.openEditor(existing);
  }

  /* The timeline screen's deep link (ticket 99 item 4): a milestone card
     there opens straight into this same editor rather than a detail page
     of its own. The one-shot-param shape /doses' `add` uses, with one
     difference that matters: `add` needs no data, and this needs a
     milestone to open.

     So the param comes off only once the milestone has actually been
     found, never on the way past. Reached from the timeline the mirror is
     long since filled and the two happen in the same tick; opened cold, on
     a link pasted into a fresh tab, this effect can run before boot has
     filled `vocabulary.milestones` - and stripping the param there threw
     the id away before anything could be done with it, so the editor never
     opened at all and the URL kept a param nothing would look at again
     (found by the ticket's own code review, reproduced by loading the deep
     link in a fresh tab). Reading the list is what subscribes this effect
     to it, so the arrival of the real data is what runs this again. */
  $effect(() => {
    const id = page.url.searchParams.get('edit');
    if (!id) return;
    const existing = vocabulary.milestones.find((mi) => mi.id === id);
    if (!existing) return;
    openEditor(existing, null);
    replaceState('/transition/milestones', {});
  });

  /* A milestone shows at most one photo, so its "list" is that one slot or
     none - the same shape a stored photo's own id would have, whether it
     is already saved or just picked and waiting on this edit's Save
     (F1's `photo` action). Deleting it here only clears the draft; nothing
     is actually removed until Save, which is why ms_photo_delete_hint says
     so rather than the other four screens' "cannot be undone". */
  type MilestonePhotoSlot = { id: 'milestone-photo'; fileName: string | null };

  function milestonePhotoSlots(photo: EditorPhoto | null): MilestonePhotoSlot[] {
    if (!photo) return [];
    return [{ id: 'milestone-photo', fileName: photo.kind === 'stored' ? photo.photo.fileName : null }];
  }

  /* The day-prompt (ticket 47, ADR-0008/0015): normalizing always strips
     whatever date the picked file carried, so a photo picked or captured
     here is asked for a day before it lands in the draft. A milestone
     shows at most one photo, so this holds at most one pending pick -
     unlike the entry editor's queue, there is never a second to lose. */
  let pendingMilestonePhoto = $state<NormalizedPhoto | null>(null);
  let pendingMilestoneDay = $state('');

  function offerMilestonePhotoDay(photo: NormalizedPhoto) {
    pendingMilestonePhoto = photo;
    pendingMilestoneDay = record.editor?.date ?? dateInputValueFromEpochDay(todayEpochDay());
  }

  // Skipping (day === null) leaves the override unset: the photo inherits
  // this milestone's day, exactly as before this ticket.
  function resolveMilestonePhotoDay(day: string | null) {
    if (!pendingMilestonePhoto || !record.editor) {
      pendingMilestonePhoto = null;
      return;
    }
    record.editor.photo = {
      kind: 'picked',
      photo: { ...pendingMilestonePhoto, epochDayOverride: day ? epochDayFromDateInputValue(day) : null }
    };
    pendingMilestonePhoto = null;
  }

  const milestonePhoto = photoSection<MilestonePhotoSlot>({
    photos: () => milestonePhotoSlots(record.editor?.photo ?? null),
    add: (photo) => {
      offerMilestonePhotoDay(photo);
    },
    remove: () => {
      if (record.editor) record.editor.photo = null;
    },
    reference: () => {
      const fileName = record.editor?.originalPhoto?.fileName;
      return fileName ? { fileName } : null;
    }
  });

  /* One entry in the offer registry (phase 8 features ticket 22,
     ADR-0045). `feelingOfferId` is the open offer's subject, so a save that
     arrives with no milestone behind it writes nothing without this screen
     having to check for that itself. */
  const FEELING_OFFER = OFFERS['new-milestone-felt-sense'];

  async function answerFeelingOffer(
    given: OfferAnswer,
    input: { mood: number; note: string | null } | null
  ) {
    const subject =
      feelingOfferId && input
        ? { owner: { milestoneId: feelingOfferId }, epochDay: todayEpochDay(), ...input }
        : null;
    /* Closed before the write, so a second tap finds no open offer. */
    feelingOfferId = null;
    await answerOffer(FEELING_OFFER, subject, given, journal);
  }

  /* The editor's own draft carries no origin - it's a name, a date, a
     template key, a photo (RecordSheet's Draft shape) - so the notice below
     reads it off the stored record being edited instead. A brand-new
     milestone has neither an id nor an origin, which is exactly right: a
     hand-written record says nothing here (ADR-0010). */
  let editingOrigin = $derived.by(() => {
    const id = record.editor?.id;
    const found = id ? sorted.find((mi) => mi.id === id) : undefined;
    return found ? resolveMilestoneOrigin(found) : null;
  });
</script>

<div class="screen">
  <ScreenHeader title={m.milestones()} back="/more" subtitle={m.ms_intro()}>
    {#snippet actions()}
      <button class="icon-btn press" data-add aria-label={m.ms_add_heading()} onclick={openPicker}>
        <Icon name="plus" size={22} />
      </button>
    {/snippet}
  </ScreenHeader>

  {#if sorted.length}
    <ListCard role={roleAt(activeFlag.roles, 0)}>
      {#each sorted as mi (mi.id)}
        {@const origin = resolveMilestoneOrigin(mi)}
        <ListRow
          key={mi.id}
          data-milestone={mi.id}
          icon="flag"
          title={mi.name}
          subtitle={[
            `${fmtDay(mi.epochDay, { day: 'numeric', month: 'short', year: 'numeric' })} · ${statusText(mi)}`,
            origin?.text,
            mi.id === prefs.journeyAnchorMilestoneId && m.journey_anchor_row_badge()
          ]}
          chevron={false}
          onclick={() => openEditor(mi, null)}
          action={{ icon: 'trash', label: m.ms_delete_aria({ name: mi.name }), onclick: () => record.askToDelete(mi) }}
        >
          {#snippet leading()}
            <!-- A milestone that has a photograph of itself shows it. The
                 disc with a flag in it is what a milestone without one
                 gets, rather than the picture being a fourth thing on the
                 row beside the glyph standing in for it.

                 Round, and at the disc's own size: a list where some rows
                 lead with a circle and others with a rounded square reads
                 as two lists interleaved, which is what the rendered screen
                 showed (2026-08-26). -->
            {#if mi.photo}
              <span class="ms-photo"><PhotoThumb photo={mi.photo} size={36} /></span>
            {:else}
              <span class="kit-row-ico"><Icon name="flag" size={22} /></span>
            {/if}
          {/snippet}
        </ListRow>
      {/each}
    </ListCard>
  {:else}
    <Notice
      icon="flag"
      key="milestones-empty"
      role={roleAt(activeFlag.roles, 0)}
      title={m.ms_none()}
      text={m.ms_intro()}
      action={{ label: m.ms_add(), primary: true, onclick: openPicker }}
    />
  {/if}

  <Sheet open={picking} title={m.ms_add_heading()} onClose={() => (picking = false)}>
    <div class="spread" style="margin-bottom:var(--space-3)">
      <h3>{m.ms_add_heading()}</h3>
      <button class="icon-btn press" data-shuffle aria-label={m.ms_shuffle()} onclick={() => (shown = vocabulary.randomTemplates(3))}>
        <Icon name="shuffle" size={20} />
      </button>
    </div>
    <ListCard role={roleAt(activeFlag.roles, 0)}>
      <ListRow
        key="own"
        data-own
        icon="pencil"
        title={m.ms_own_title()}
        subtitle={m.ms_own_sub()}
        onclick={() => openEditor(null, null)}
      />
      {#each shown as tp (tp.key)}
        <ListRow key={tp.key} data-template={tp.key} icon="flag" title={tp.name} onclick={() => openEditor(null, tp)} />
      {/each}
    </ListCard>
  </Sheet>

  <!-- The heading used to be a third thing: the sheet was labelled "A
       milestone" while the heading below it said the name being typed. It
       is the title pair on both lines now, which is also the label a screen
       reader reads out. -->
  <RecordSheet
    {record}
    handle="milestone"
    newTitle={m.ms_new_title()}
    editTitle={m.ms_edit_title()}
    saveLabel={(draft) => (draft.id ? m.ms_save_changes() : m.ms_add())}
    confirm={{
      title: m.ms_delete_sheet(),
      question: (milestone) => m.ms_delete_q({ name: milestone.name }),
      hint: () => m.ms_delete_hint(),
      confirmLabel: m.ms_delete_sheet(),
      cancelLabel: m.keep_it()
    }}
  >
    {#snippet fields(editor)}
      {#if editingOrigin}
        <Notice
          icon="sparkle"
          key="milestone-provenance"
          text={editingOrigin.text}
          action={editingOrigin.href ? { label: m.prov_open_source(), href: editingOrigin.href } : undefined}
        />
      {/if}
      <Field label={m.ms_name_label()} id="ms-name">
        {#snippet children(id)}
          <input class="input" {id} name="ms-name" placeholder={m.ms_name_placeholder()} bind:value={editor.name} />
        {/snippet}
      </Field>
      <Field label={m.ms_date_label()} hint={m.ms_date_hint()} id="ms-date">
        {#snippet children(id)}
          <DatePicker name="ms-date" bind:value={editor.date} {id} />
        {/snippet}
      </Field>
      <Field label={m.ms_description_label()} id="ms-description">
        {#snippet children(id)}
          <textarea
            class="input"
            {id}
            name="ms-description"
            rows="3"
            placeholder={m.ms_description_placeholder()}
            bind:value={editor.description}
          ></textarea>
        {/snippet}
      </Field>
      <Field label={m.ms_photo_label()} legend>
        {#snippet children()}
          <div class="photo-row">
            {#if editor.photo}
              <div class="photo-wrap">
                {#if editor.photo.kind === 'stored'}
                  <PhotoThumb photo={editor.photo.photo} size={64} />
                {:else}
                  <PhotoThumb photo={{ fileName: null }} bytes={editor.photo.photo.thumb} size={64} />
                {/if}
                <button
                  class="photo-remove"
                  aria-label={m.photo_remove()}
                  onclick={() => milestonePhoto.record.askToDelete('milestone-photo')}
                >
                  <Icon name="x" size={14} />
                </button>
              </div>
            {:else}
              <button class="photo-add" data-add-photo aria-label={m.add_photo()} onclick={milestonePhoto.pick}>
                <Icon name="image" size={20} /><span>{m.add_photo()}</span>
              </button>
              <button
                class="photo-add"
                data-capture-photo
                aria-label={m.add_photo_camera()}
                onclick={milestonePhoto.review.capture}
              >
                <Icon name="camera" size={20} /><span>{m.add_photo_camera()}</span>
              </button>
            {/if}
          </div>
        {/snippet}
      </Field>
      {#if editor.id}
        <!-- Written straight to the preference the moment the switch moves,
             not part of Save (ticket 10, ADR-0049): the anchor is one
             global choice this milestone points at, not a field the record
             itself owns, and a brand-new milestone has no id for it to
             point at yet. -->
        <Field label={m.journey_anchor_field_label()} legend>
          {#snippet children()}
            <div class="kit-row is-static" data-milestone-anchor={editor.id}>
              <span class="kit-row-text">
                <span class="kit-row-sub">{m.journey_anchor_field_hint()}</span>
              </span>
              <span class="kit-row-trail">
                <Switch
                  checked={prefs.journeyAnchorMilestoneId === editor.id}
                  label={m.journey_anchor_field_label()}
                  onChange={(v) => (prefs.journeyAnchorMilestoneId = v ? (editor.id ?? null) : null)}
                />
              </span>
            </div>
          {/snippet}
        </Field>
        <!-- The target's own screen lists the documents pointing at it
             (ticket 56, ADR-0065); the milestone stores nothing about the
             link. -->
        <LinkedDocuments kind="milestone" id={editor.id} />
      {/if}
    {/snippet}
  </RecordSheet>

  <RecordSheet
    record={milestonePhoto.record}
    handle="milestone-photo"
    confirm={{
      title: m.ms_photo_delete_sheet(),
      question: () => m.ms_photo_delete_q(),
      hint: () => m.ms_photo_delete_hint(),
      confirmLabel: m.ms_photo_delete(),
      cancelLabel: m.keep_it()
    }}
  />

  <PhotoAlignmentReview
    photo={milestonePhoto.review.photo}
    reference={milestonePhoto.review.reference}
    onAccept={milestonePhoto.review.accept}
    onRetake={milestonePhoto.review.capture}
    onCancel={milestonePhoto.review.cancel}
  />

  <PhotoDayPromptSheet
    open={pendingMilestonePhoto !== null}
    bind:day={pendingMilestoneDay}
    fieldId="milestone-photo-day-prompt"
    onSave={() => resolveMilestonePhotoDay(pendingMilestoneDay)}
    onSkip={() => resolveMilestonePhotoDay(null)}
  />

  <FeltSenseOfferSheet
    open={feelingOfferId !== null}
    copy={FEELING_OFFER.copy}
    onSave={(input) => answerFeelingOffer('confirm', input)}
    onSkip={() => void answerFeelingOffer('decline', null)}
  />
</div>

<style>
  .ms-photo {
    flex: 0 0 auto;
    width: 36px;
    height: 36px;
    border-radius: 50%;
    overflow: hidden;
    display: grid;
    place-items: center;
    border: var(--role-hairline);
  }
</style>
