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
  import { journal } from '$lib/data/live/journal.svelte';
  import { milestoneStatus } from '$lib/data/milestoneStatus';
  import { fmtDay } from '$lib/data/dates';
  import { todayEpochDay, epochDayFromDateInputValue, dateInputValueFromEpochDay } from '$lib/data/epochDay';
  import type { Milestone, MilestoneTemplate, Photo } from '$lib/data/types';
  import { pickPhotos, type EditorPhoto } from '$lib/stores/photoPicking';
  import { photoReview } from '$lib/stores/photoReview.svelte';
  import Icon from '$lib/components/Icon.svelte';
  import PhotoThumb from '$lib/components/PhotoThumb.svelte';
  import PhotoAlignmentReview from '$lib/components/PhotoAlignmentReview.svelte';
  import FeltSenseOfferSheet from '$lib/components/FeltSenseOfferSheet.svelte';
  import ScreenHeader from '$lib/components/ScreenHeader.svelte';
  import Sheet from '$lib/components/Sheet.svelte';
  import ListCard from '$lib/components/kit/ListCard.svelte';
  import ListRow from '$lib/components/kit/ListRow.svelte';
  import Notice from '$lib/components/kit/Notice.svelte';
  import { recordEditor } from '$lib/components/kit/recordEditor.svelte';
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
      photo: null,
      storedPhotoId: null,
      originalPhoto: null,
      templateKey: template?.key ?? null
    }),
    fromRecord: (existing) => ({
      id: existing.id,
      name: existing.name,
      date: dateInputValueFromEpochDay(existing.epochDay),
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
        epochDay: epochDayFromDateInputValue(draft.date) ?? todayEpochDay(),
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

  async function pickPhoto() {
    const [photo] = await pickPhotos(1); // a milestone shows one
    if (photo && record.editor) record.editor.photo = { kind: 'picked', photo };
  }

  const milestonePhotoReview = photoReview(
    () => {
      const fileName = record.editor?.originalPhoto?.fileName;
      return fileName ? { fileName } : null;
    },
    (photo) => {
      if (record.editor) record.editor.photo = { kind: 'picked', photo };
    }
  );

  async function saveFeelingOffer(input: { mood: number; note: string | null }) {
    if (!feelingOfferId) return;
    await journal.feltSense.add({ milestoneId: feelingOfferId }, { epochDay: todayEpochDay(), ...input });
    feelingOfferId = null;
  }
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
        <ListRow
          key={mi.id}
          data-milestone={mi.id}
          icon="flag"
          title={mi.name}
          subtitle={`${fmtDay(mi.epochDay, { day: 'numeric', month: 'short', year: 'numeric' })} · ${statusText(mi)}`}
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
      <div class="field">
        <label class="field-label" for="ms-name">{m.ms_name_label()}</label>
        <input class="input" id="ms-name" name="ms-name" placeholder={m.ms_name_placeholder()} bind:value={editor.name} />
      </div>
      <div class="field">
        <label class="field-label" for="ms-date">{m.ms_date_label()} <span class="muted">{m.ms_date_hint()}</span></label>
        <input class="input" type="date" id="ms-date" name="ms-date" bind:value={editor.date} />
      </div>
      <div class="field">
        <span class="field-label">{m.ms_photo_label()}</span>
        <div class="photo-row">
          {#if editor.photo}
            <div class="photo-wrap">
              {#if editor.photo.kind === 'stored'}
                <PhotoThumb photo={editor.photo.photo} size={64} />
              {:else}
                <PhotoThumb photo={{ fileName: null }} bytes={editor.photo.photo.thumb} size={64} />
              {/if}
              <button class="photo-remove" aria-label={m.photo_remove()} onclick={() => (editor.photo = null)}>
                <Icon name="x" size={14} />
              </button>
            </div>
          {:else}
            <button class="photo-add" aria-label={m.add_photo()} onclick={pickPhoto}>
              <Icon name="image" size={20} /><span>{m.add_photo()}</span>
            </button>
            <button class="photo-add" aria-label={m.add_photo_camera()} onclick={milestonePhotoReview.capture}>
              <Icon name="camera" size={20} /><span>{m.add_photo_camera()}</span>
            </button>
          {/if}
        </div>
      </div>
    {/snippet}
  </RecordSheet>

  <PhotoAlignmentReview
    photo={milestonePhotoReview.photo}
    reference={milestonePhotoReview.reference}
    onAccept={milestonePhotoReview.accept}
    onRetake={milestonePhotoReview.capture}
    onCancel={milestonePhotoReview.cancel}
  />

  <FeltSenseOfferSheet
    open={feelingOfferId !== null}
    title={m.ms_feeling_new_title()}
    onSave={saveFeelingOffer}
    onSkip={() => (feelingOfferId = null)}
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
