<script lang="ts">
  import { undoable } from '$lib/stores/deleteUndo';
  import { journalTextAutocomplete } from '$lib/platform';
  import SourceRecordHandoff from '$lib/components/SourceRecordHandoff.svelte';
  import { bootState } from '$lib/stores/boot.svelte';
  import { withSourceReturn } from '$lib/navigation/sourceRecord';
  /* Open with the rail to show which milestones fall before and after today.
     The list below retains editing, photos and delete.
     Tap a row to edit or use its own delete control. The header's add control
     opens a sheet with all eight neutral templates in fixed order. */
  import { m } from '$lib/paraglide/messages';
  import { page } from '$app/state';
  import { goto, afterNavigate } from '$app/navigation';
  import DatePicker from '$lib/components/DatePicker.svelte';
  import { journal, liveList } from '$lib/data/live/journal.svelte';
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
  import { currentDay } from '$lib/stores/today.svelte';
  import type { Milestone, MilestoneTemplate, Photo } from '$lib/data/types';
  import type { NormalizedPhoto } from '$lib/data/journal/photos';
  import type { EditorPhoto } from '$lib/stores/photoPicking';
  import Icon from '$lib/components/Icon.svelte';
  import LinkedDocuments from '$lib/components/LinkedDocuments.svelte';
  import MilestoneRail from '$lib/components/MilestoneRail.svelte';
  import PhotoThumb from '$lib/components/PhotoThumb.svelte';
  import PhotoAlignmentReview from '$lib/components/PhotoAlignmentReview.svelte';
  import ScreenHeader from '$lib/components/ScreenHeader.svelte';
  import Sheet from '$lib/components/Sheet.svelte';
  import Switch from '$lib/components/Switch.svelte';
  import Field from '$lib/components/kit/Field.svelte';
  import PhotoDayPromptSheet from '$lib/components/kit/PhotoDayPromptSheet.svelte';
  import ListCard from '$lib/components/kit/ListCard.svelte';
  import ListRow from '$lib/components/kit/ListRow.svelte';
  import Notice from '$lib/components/kit/Notice.svelte';
  import Skeleton from '$lib/components/Skeleton.svelte';
  import { recordEditor } from '$lib/components/kit/recordEditor.svelte';
  import { collapse, crossfade, disclose, resize } from '$lib/motion/reveal';
  import { photoSection } from '$lib/components/kit/photoSection.svelte';
  import RecordSheet from '$lib/components/kit/RecordSheet.svelte';
  import { activeFlag } from '$lib/theme/activeFlag.svelte';
  import { roleAt } from '$lib/theme/roles';
  import { vocabulary } from '$lib/data/vocabulary/vocabulary';

  let templates = $derived(vocabulary.milestoneTemplates);
  let picking = $state(false);
  /* Closed by default: the rail already says what is
     true now, and the record beneath it - where a milestone is edited or
     deleted - is a delete affordance most visits never need open. */
  let milestoneListOpen = $state(false);

  function openPicker() {
    picking = true;
  }

  /* A milestone shows one photo, so `photo` is whatever it will end up with -
     the stored row, a picked replacement, or none - and `storedPhotoId`
      remembers what was there when the editor opened, so Save can describe
      preserve, remove or replace. Nothing is committed until Save (F1), so
      closing the sheet undoes both. `originalPhoto` is that same starting
      point held separately: the alignment review compares a
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
    /* Part of the record and of Save, unlike
       the journey anchor below: whether Home celebrates a milestone is a
       fact about this milestone, not a global choice pointing at one. */
    celebrate: boolean;
  };

  // Mirrored, and the journal already orders them by day (ADR-0004).
  let sorted = $derived(vocabulary.milestones);

  /* Eras aren't mirrored the way milestones are, so the rail's bands read
     a live query - `erasQuery.rows` is `[]` before it resolves, which
     draws a rail with no bands rather than one waiting on a loading
     state that never shows. */
  let erasQuery = liveList((j) => j.eras.getEras());

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
      templateKey: template?.key ?? null,
      celebrate: true
    }),
    fromRecord: (existing) => ({
      id: existing.id,
      name: existing.name,
      date: dateInputValueFromEpochDay(existing.epochDay),
      description: existing.description,
      photo: existing.photo && { kind: 'stored', photo: existing.photo },
      storedPhotoId: existing.photo?.id ?? null,
      originalPhoto: existing.photo ?? null,
      templateKey: existing.templateKey,
      celebrate: existing.celebrate !== false
    }),
    async upsert(draft) {
      const photo =
        draft.photo?.kind === 'picked'
          ? { action: 'replace' as const, photo: draft.photo.photo }
          : draft.storedPhotoId && !draft.photo
            ? { action: 'remove' as const }
            : { action: 'preserve' as const };

      await journal.milestones.upsertMilestone({
        id: draft.id,
        name: draft.name.trim() || m.ms_default_name(),
        epochDay: epochDayFromDateInputValueOrToday(draft.date),
        description: draft.description,
        templateKey: draft.templateKey,
        celebrate: draft.celebrate,
        photo
      });
    },
    saved: () => m.saved(),
    remove: (id) => undoable((j) => j.milestones.deleteMilestone(id)),
    findById: (id) => sorted.find((mi) => mi.id === id)
  });

  function statusText(mi: Milestone): string {
    const s = milestoneStatus(mi, currentDay());
    if (s.type === 'countdown') return m.ms_status_in_days({ days: m.n_days({ n: s.days ?? 0 }) });
    if (s.type === 'today') return m.today_status();
    return m.ms_status_years_ago({ years: m.n_years({ n: s.years ?? 0 }) });
  }

  function openEditor(existing: Milestone | null, seed: MilestoneTemplate | null) {
    picking = false;
    template = seed;
    record.openEditor(existing);
  }

  let restoredId = $state<string | null>(null);
  export const snapshot = {
    capture: () => ({ editorId: record.editor?.id ?? null, milestoneListOpen }),
    restore: (state: { editorId: string | null; milestoneListOpen: boolean }) => {
      restoredId = state.editorId;
      milestoneListOpen = state.milestoneListOpen;
    }
  };
  afterNavigate(({ type }) => { if (type !== 'popstate') restoredId = null; });
  let sourceId = $derived(restoredId ?? page.url.searchParams.get('edit'));
  let sourceMilestone = $derived(sorted.find((mi) => mi.id === sourceId));

  function milestoneOriginHref(href: string, id: string): string {
    const source = new URL(page.url);
    source.searchParams.set('edit', id);
    return withSourceReturn(href, source);
  }

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

  /* The day-prompt (ADR-0008/0015): normalizing always strips whatever date the picked file
     carried, so a photo picked or captured here is asked for a day before it lands in the
     draft. A milestone shows at most one photo, so this holds at most one pending pick -
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
    // Only the draft loses it; the milestone keeps its photo until Save.
    deleted: () => null,
    reference: () => {
      const fileName = record.editor?.originalPhoto?.fileName;
      return fileName ? { fileName } : null;
    }
  });

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
  <a class="btn btn-ghost press" data-manage-eras href="/settings/eras">
    <Icon name="era" size={20} />
    <span>{m.eras_manage()}</span>
  </a>
  <SourceRecordHandoff id={sourceId} ready={bootState.status === 'ready'} found={!!sourceMilestone} onOpen={() => openEditor(sourceMilestone!, null)} />


  <div use:resize>
    {#if !vocabulary.ready}
      <!-- `sorted` reads `[]` on a cold navigation straight to this screen
           for a few frames before the mirror behind it hydrates, which
           otherwise looked exactly like the true "no milestones yet"
           empty state below. -->
      <div out:crossfade><Skeleton variant="block" count={1} /></div>
    {:else if sorted.length}
      <!-- What is true now, before what was true before. The rail carries today's place among the milestones and the
           hollow marks ahead of it; the list under it is the same set as
           rows, which is where a milestone is opened, edited or deleted. -->
      <!-- Wrapped so the whole of it can leave as one when the last milestone is deleted,
           and the empty notice can arrive, instead of one swapping for the other in a
           frame. -->
      <div out:crossfade>
      <MilestoneRail
        milestones={sorted}
        eras={erasQuery.rows}
        onOpen={(mi) => openEditor(mi, null)}
        onOpenEra={(id) => goto(`/settings/eras?edit=${id}`)}
      />
      <ListCard role={roleAt(activeFlag.roles, 0)}>
        <ListRow
          data-ms-log-toggle
          onclick={() => (milestoneListOpen = !milestoneListOpen)}
          aria-expanded={milestoneListOpen}
          chevron={false}
          title={m.ms_log_heading()}
        >
          {#snippet trailing()}
            {m.ms_log_heading_count({ count: sorted.length })}
            <Icon name={milestoneListOpen ? 'chevronDown' : 'chevronRight'} size={20} />
          {/snippet}
        </ListRow>
        {#if milestoneListOpen}
          <div data-ms-log transition:disclose>
            {#each sorted as mi (mi.id)}
              {@const origin = resolveMilestoneOrigin(mi)}
              <div class="rows-divide" transition:collapse>
                <ListRow
                  key={mi.id}
                  data-milestone={mi.id}
                  icon="summit"
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
                         disc with the summit in it is what a milestone without one
                         gets, rather than the picture being a fourth thing on the
                         row beside the glyph standing in for it.

                         Round, and at the disc's own size: a list where some rows
                         lead with a circle and others with a rounded square reads
                         as two lists interleaved, which is what the rendered screen
                         showed (2026-08-26). -->
                    {#if mi.photo}
                      <span class="ms-photo"><PhotoThumb photo={mi.photo} size={36} /></span>
                    {:else}
                      <span class="kit-row-ico"><Icon name="summit" size={22} /></span>
                    {/if}
                  {/snippet}
                </ListRow>
              </div>
            {/each}
          </div>
        {/if}
      </ListCard>
      </div>
    {:else}
      <div in:crossfade>
        <Notice
          icon="summit"
          key="milestones-empty"
          role={roleAt(activeFlag.roles, 0)}
          title={m.ms_none()}
          action={{ label: m.add_milestone(), primary: true, onclick: openPicker }}
        />
      </div>
    {/if}
  </div>

  <Sheet open={picking} title={m.ms_add_heading()} onClose={() => (picking = false)}>
    <h3 class="ms-picker-heading">{m.ms_add_heading()}</h3>
    <ListCard role={roleAt(activeFlag.roles, 0)}>
      <ListRow
        key="own"
        data-own
        icon="pencil"
        title={m.ms_own_title()}
        onclick={() => openEditor(null, null)}
      />
      {#each templates as tp (tp.key)}
        <div class="rows-divide">
          <ListRow key={tp.key} data-template={tp.key} icon="summit" title={tp.name} onclick={() => openEditor(null, tp)} />
        </div>
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
    saveLabel={(draft) => (draft.id ? m.save_changes() : m.add_milestone())}
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
          icon="summit"
          key="milestone-provenance"
          text={editingOrigin.text}
          action={editingOrigin.href ? { label: m.prov_open_source(), href: milestoneOriginHref(editingOrigin.href, editor.id!) } : undefined}
        />
      {/if}
      <Field label={m.name_label()} id="ms-name">
        {#snippet children(id)}
          <input autocomplete={journalTextAutocomplete()} class="input" {id} name="ms-name" placeholder={m.ms_name_placeholder()} bind:value={editor.name} />
        {/snippet}
      </Field>
      <Field label={m.ms_description_label()} id="ms-description">
        {#snippet children(id)}
          <textarea autocomplete={journalTextAutocomplete()}
            class="input"
            {id}
            name="ms-description"
            rows="3"
            placeholder={m.ms_description_placeholder()}
            bind:value={editor.description}
          ></textarea>
        {/snippet}
      </Field>
      <Field label={m.date_label()} hint={m.ms_date_hint()} id="ms-date">
        {#snippet children(id, describedBy)}
          <DatePicker name="ms-date" bind:value={editor.date} {id} {describedBy} />
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
              <button class="photo-add" data-add-photo aria-label={m.add()} onclick={milestonePhoto.pick}>
                <Icon name="image" size={20} /><span>{m.add()}</span>
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
      <Field label={m.ms_celebrate_label()} legend>
        {#snippet children()}
          <div class="kit-row is-static" data-milestone-celebrate>
            <span class="kit-row-text">
              <span class="kit-row-sub">{m.ms_celebrate_hint()}</span>
            </span>
            <span class="kit-row-trail">
              <Switch checked={editor.celebrate} label={m.ms_celebrate_label()} onChange={(v) => (editor.celebrate = v)} />
            </span>
          </div>
        {/snippet}
      </Field>
      {#if editor.id}
        <!-- Written straight to the preference the moment the switch moves,
             not part of Save (ADR-0049): the anchor is one
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
             (ADR-0065); the milestone stores nothing about the
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
      confirmLabel: m.remove(),
      cancelLabel: m.keep_it()
    }}
  />

  <PhotoAlignmentReview
    photo={milestonePhoto.review.photo}
    reference={milestonePhoto.review.reference}
    onAccept={milestonePhoto.review.accept}
    busy={milestonePhoto.review.busy}
    onRetake={milestonePhoto.review.capture}
    onCancel={milestonePhoto.review.cancel}
  />

  <PhotoDayPromptSheet
    open={pendingMilestonePhoto !== null}
    bind:day={pendingMilestoneDay}
    fieldId="milestone-photo-day-prompt"
    hint={m.photo_day_prompt_hint_milestone()}
    onSave={() => resolveMilestonePhotoDay(pendingMilestoneDay)}
    onSkip={() => resolveMilestonePhotoDay(null)}
  />

</div>

<style>
  .ms-picker-heading {
    margin: 0 0 var(--space-3);
  }

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
