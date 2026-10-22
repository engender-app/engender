<script lang="ts">
  import { undoable } from '$lib/stores/deleteUndo';
  import { journalTextAutocomplete } from '$lib/platform';
  import ReadReserve from '$lib/components/kit/ReadReserve.svelte';
  import { readReserve, rememberReserve } from '$lib/data/homeReserve';
  import PhotoViewer from '$lib/components/PhotoViewer.svelte';
  import SectionJump from '$lib/components/kit/SectionJump.svelte';
  import { page } from '$app/state';
  import { goto } from '$app/navigation';
  import { resolve } from '$app/paths';
  import { timelapseSupported } from '$lib/data/photos/journey-render';
  import { scrollBehavior } from '$lib/motion/tokens';
  import SourceRecordHandoff from '$lib/components/SourceRecordHandoff.svelte';
  /* Staging in the person's own words, and fixed-position photos, on the
     surface kit (phase 5 UX ticket 25).

     Staging was a grade on Norwood-Hamilton or Sinclair until functional
     audit ticket 23 made it free text; an older grade reads as the scale
     and code it named (hairStageScales.ts). The same ticket took out the
     28-day "time for a photo" notice. The two cards that say something
     rather than hold something - where the week count is measured from,
     and how to take a photo so two of them compare - are notices, and the
     protocol's dismiss is the notice's own. */
  import { m } from '$lib/paraglide/messages';
  import { toast } from '$lib/stores/toasts.svelte';
  import DatePicker from '$lib/components/DatePicker.svelte';
  import { journal, liveList } from '$lib/data/live/journal.svelte';
  import { prefs } from '$lib/data/prefs/store.svelte';
  import { hairAnchorEpochDay } from '$lib/data/hairAnchor';
  import { hrtAnchor } from '$lib/data/personalEffectWindow';
  import { hairStagingText } from '$lib/data/vocabulary/labels';
  import { fmtDay } from '$lib/data/dates';
  import { epochDayFromDateInputValue, epochDayFromDateInputValueOrToday, dateInputValueFromEpochDay, todayEpochDay } from '$lib/data/epochDay';
  import { currentDay } from '$lib/stores/today.svelte';
  import type { HairStage } from '$lib/data/types';
  import type { HairPhoto } from '$lib/data/journal/hairProgress';
  import type { ComparePair } from '$lib/data/photos/compare-state';
  import { openingPair, toComparePair } from '$lib/data/photos/compare-state';
  import type { NormalizedPhoto } from '$lib/data/journal/photos';
  import Icon from '$lib/components/Icon.svelte';
  import ScreenHeader from '$lib/components/ScreenHeader.svelte';
  import Sheet from '$lib/components/Sheet.svelte';
  import Field from '$lib/components/kit/Field.svelte';
  import ListCard from '$lib/components/kit/ListCard.svelte';
  import ListRow from '$lib/components/kit/ListRow.svelte';
  import Notice from '$lib/components/kit/Notice.svelte';
  import PhotoSection from '$lib/components/kit/PhotoSection.svelte';
  import PhotoWipe from '$lib/components/kit/PhotoWipe.svelte';
  import { recordEditor } from '$lib/components/kit/recordEditor.svelte';
  import { photoSection } from '$lib/components/kit/photoSection.svelte';
  import { lastPhotoReference } from '$lib/components/kit/photoSection';
  import RecordSheet from '$lib/components/kit/RecordSheet.svelte';
  import SectionHeading from '$lib/components/kit/SectionHeading.svelte';
  import { disclose } from '$lib/motion/reveal';
  import { activeFlag } from '$lib/theme/activeFlag.svelte';
  import { roleAt } from '$lib/theme/roles';
  import ReadGate from '$lib/components/kit/ReadGate.svelte';
  import AreaFinish from '$lib/components/AreaFinish.svelte';

  /* Two areas, two stripes: the staging and the photographs. The notices
     that talk about the app rather than about the journal take no role at
     all, which is the call Home's backup notice makes. */
  const SECTION_ROLE = { stages: 0, photos: 1 };

  const today = $derived(currentDay());

  let episodesQuery = liveList((j) => j.regimen.getEpisodes());

  /* The day this screen counts weeks from: whatever the person set here,
     else the HRT start, else nothing (hairAnchor.ts, functional audit
     ticket 18). An SSRI or finasteride logged before HRT no longer starts
     the count. */
  let anchorEpochDay = $derived(hairAnchorEpochDay(prefs.hairAnchorEpochDay, hrtAnchor(episodesQuery.rows, prefs.hrtStartEpochDay)));
  let anchorIsUserSet = $derived(prefs.hairAnchorEpochDay !== null);

  let stagesQuery = liveList((j) => j.hairProgress.getStages());
  let stages = $derived(stagesQuery.rows);

  /* Newest first. */
  let newestStages = $derived([...stages].reverse());

  let photosQuery = liveList((j) => j.hairProgress.getPhotos());
  let photos = $derived(photosQuery.rows);

  /* Latched: a reserve must not put its placeholder back over the body. */
  let bodyRevealed = $state(false);
  $effect.pre(() => {
    if (!bodyRevealed && !episodesQuery.loading && !stagesQuery.loading && !photosQuery.loading) bodyRevealed = true;
  });
  const bodyEstimate = readReserve('hair-progress');
  const rememberBody = (px: number) => rememberReserve('hair-progress', px);
  let sourceId = $derived(page.url.searchParams.get('photo'));
  let sourcePhoto = $derived(photos.find((photo) => photo.id === sourceId));
  let viewing = $state<HairPhoto | null>(null);

  /** Null with no anchor, or for a record dated before it - "since
      starting" has no honest answer for either. */
  function sinceStart(epochDay: number): string | null {
    if (anchorEpochDay == null || epochDay < anchorEpochDay) return null;
    const weeks = Math.floor((epochDay - anchorEpochDay) / 7);
    return m.hair_since_start({ weeks: m.n_weeks({ n: weeks }) });
  }

  const dayLabel = (epochDay: number) => fmtDay(epochDay, { day: 'numeric', month: 'long', year: 'numeric' });

  /** The date, plus " · since starting" once an anchor makes that honest -
      composed here rather than as adjacent mustaches in the markup, so the
      separator's spacing does not depend on Svelte's block-boundary
      whitespace trimming. */
  function stageSubtitle(epochDay: number): string {
    const since = sinceStart(epochDay);
    return since ? `${dayLabel(epochDay)} · ${since}` : dayLabel(epochDay);
  }

  let anchorEditor = $state<string | null>(null);

  function openAnchorEditor() {
    anchorEditor = dateInputValueFromEpochDay(prefs.hairAnchorEpochDay ?? anchorEpochDay ?? today);
  }

  function saveAnchor() {
    if (anchorEditor === null) return;
    // A date input the person cleared reads as null, which is this
    // preference's own "not set" - so an empty field saves as unset rather
    // than silently keeping the old day.
    prefs.hairAnchorEpochDay = epochDayFromDateInputValue(anchorEditor);
    anchorEditor = null;
    toast(m.saved(), { kind: 'record-saved' });
  }

  function clearAnchor() {
    prefs.hairAnchorEpochDay = null;
    anchorEditor = null;
  }

  /* Save stays disabled until something is written: a staging is what the
     person says they see, so an empty one says nothing. */
  type StageDraft = { id?: string; date: string; description: string };

  const stageRecord = recordEditor<HairStage, StageDraft>({
    blank: () => ({ date: dateInputValueFromEpochDay(today), description: '' }),
    fromRecord: (existing) => ({
      id: existing.id,
      date: dateInputValueFromEpochDay(existing.epochDay),
      description: existing.description
    }),
    async upsert(draft) {
      const description = draft.description.trim();
      if (!description) return false;
      await journal.hairProgress.upsertStage({
        id: draft.id,
        epochDay: epochDayFromDateInputValueOrToday(draft.date),
        description
      });
    },
    remove: (id) => undoable((j) => j.hairProgress.deleteStage(id)),
    findById: (id) => stages.find((s) => s.id === id)
  });

  async function storePhoto(photo: NormalizedPhoto): Promise<void> {
    await journal.hairProgress.addPhoto(todayEpochDay(), photo);
  }

  const hairPhotos = photoSection<HairPhoto>({
    photos: () => photos,
    add: storePhoto,
    remove: (id) => undoable((j) => j.hairProgress.deletePhoto(id)),
    reference: () => lastPhotoReference(photos)
  });

  function dismissProtocol() {
    prefs.hairPhotoProtocolDismissed = true;
  }

  /* Which two photographs the wipe is comparing, held as ids rather than as
     positions: the list under it is where photos are deleted, and a pair
     held by position would quietly re-aim itself at two other photographs
     when one earlier in the list goes. A pair whose photographs are gone
     falls back to the opening one, which is the oldest and the newest -
     the widest comparison the list holds, and the reading an area owes
     when it opens (DIRECTION.md rule 16). */
  let comparing = $state<string[]>([]);
  let restoredComparison = $state(false);
  export const snapshot = {
    capture: () => [...comparing],
    restore: (ids: string[]) => { comparing = ids; restoredComparison = true; }
  };
  const canRecord = timelapseSupported();
  let comparisonHeading = $state<HTMLHeadingElement>();

  function openComparison() {
    comparisonHeading?.scrollIntoView({ behavior: scrollBehavior(), block: 'start' });
    comparisonHeading?.focus({ preventScroll: true });
  }

  let wipePair = $derived(toComparePair(comparing, photos) ?? openingPair(photos.length));

  function setWipePair(next: ComparePair) {
    comparing = [photos[next.left].id, photos[next.right].id];
  }

  /* The jump between the two halves is the kit's SectionJump (after-release
     28): it scrolls the app's region, remembers where staging was read to,
     and follows the scroll once both halves have mounted. */
  let jumper = $state<SectionJump>();
  const jumpSections = $derived([
    { value: 'staging', label: m.hair_stage_section_title(), target: 'hair-staging' },
    { value: 'photos', label: m.hair_jump_photos(), target: 'hair-photos' }
  ]);

  $effect(() => {
    if (typeof window === 'undefined') return;
    if (episodesQuery.loading) return;
    if (!restoredComparison && window.location.hash === '#hair-photos') {
      jumper?.jump('photos');
    }
  });
</script>

<div class="screen">
  <ScreenHeader title={m.hair_progress()} back="/care/changes" />
  <SourceRecordHandoff id={sourceId} ready={!photosQuery.loading && !photosQuery.failed} found={!!sourcePhoto} onOpen={() => { viewing = sourcePhoto!; }} />
  <PhotoViewer photo={viewing} onClose={() => { viewing = null; }} />

  <div data-hair-jump>
    <SectionJump bind:this={jumper} name={m.hair_jump_label()} sections={jumpSections} key="hair-sections" />
  </div>

  <!-- The body waits for the regimen (the anchor line), the stages and the
       photos together, held at last visit's height and faded in (ux-carpet
       ticket 205). It used to swap from a page-level skeleton: cut in at
       full opacity, with nothing to travel its height, and a stages gate
       inside it that could still be answering. -->
  <ReadReserve ready={bodyRevealed} estimate={bodyEstimate} onrest={rememberBody} data-hair-body>
    <div data-anchor>
      <Notice
        icon="clock"
        key="hair-anchor"
        text={anchorEpochDay == null
          ? m.hair_unanchored_note()
          : anchorIsUserSet
            ? m.hair_anchor_from_set({ date: dayLabel(anchorEpochDay) })
            : m.hair_anchor_from_hrt({ date: dayLabel(anchorEpochDay) })}
        action={{
          label: anchorIsUserSet ? m.hair_anchor_change_action() : m.hair_anchor_set_action(),
          onclick: openAnchorEditor
        }}
      />
    </div>

    <SectionHeading id="hair-staging" text={m.hair_stage_section_title()}>
      {#snippet action()}
        <button class="icon-btn press" data-add-stage aria-label={m.hair_stage_add_aria()} onclick={() => stageRecord.openEditor(null)}>
          <Icon name="plus" size={20} />
        </button>
      {/snippet}
    </SectionHeading>

    <ReadGate read={stagesQuery} variant="line" count={2}>
      {#snippet rows()}
        <ListCard role={roleAt(activeFlag.roles, SECTION_ROLE.stages)}>
          {#each newestStages as s (s.id)}
            <ListRow
              key={s.id}
              data-hair-stage={s.id}
              icon="comb"
              title={hairStagingText(s)}
              subtitle={stageSubtitle(s.epochDay)}
              chevron={false}
              onclick={() => stageRecord.openEditor(s)}
            />
          {/each}
        </ListCard>
      {/snippet}
      {#snippet empty()}
        <Notice
          icon="comb"
          key="hair-stages-empty"
          role={roleAt(activeFlag.roles, SECTION_ROLE.stages)}
          title={m.hair_stage_empty_title()}
          text={m.hair_stage_empty_body()}
          action={{ label: m.hair_stage_empty_action(), primary: true, onclick: () => stageRecord.openEditor(null) }}
        />
      {/snippet}
    </ReadGate>

    <SectionHeading id="hair-photos" text={m.hair_photo_section_title()}>
      {#snippet action()}
        <button
          class="icon-btn press"
          data-jump-staging
          aria-label={m.hair_jump_staging_aria()}
          onclick={() => jumper?.jump('staging')}
        >
          <span class="jump-up"><Icon name="chevronDown" size={20} /></span>
        </button>
      {/snippet}
    </SectionHeading>

    {#if !photosQuery.loading && !photosQuery.failed}
      <div class="hair-photo-actions" role="group" aria-label={m.hair_photo_section_title()}>
        <button class="btn btn-soft press" data-hair-compare disabled={!wipePair} onclick={openComparison}>{m.ph_compare()}</button>
        <button class="btn btn-soft press" data-hair-collage disabled={!photos.length} onclick={() => goto(resolve('/media/photos/export?source=hair&output=collage&from=hair-progress'))}>{m.pj_output_collage()}</button>
        <button class="btn btn-soft press" data-hair-timelapse disabled={!photos.length || !canRecord} onclick={() => goto(resolve('/media/photos/export?source=hair&output=timelapse&from=hair-progress'))}>{m.pj_output_timelapse()}</button>
      </div>
      {#if photos.length === 0}
        <p class="muted small">{m.hair_photo_exports_required()}</p>
      {/if}
      {#if photos.length < 2}
        <p class="muted small">{m.hair_photo_compare_required()}</p>
      {/if}
      {#if !canRecord}
        <p class="muted small">{m.pj_timelapse_unavailable()}</p>
      {/if}
    {/if}

    {#if !prefs.hairPhotoProtocolDismissed}
      <div data-protocol>
        <Notice
          icon="info"
          key="hair-photo-protocol"
          title={m.hair_photo_protocol_title()}
          text={m.hair_photo_protocol_body()}
          dismiss={{ label: m.hair_photo_protocol_dismiss_aria(), onclick: dismissProtocol }}
        />
      </div>
    {/if}

    {#if wipePair}
      <!-- The reading before the records: what changed between two of these
           photographs, then the list of all of them (DIRECTION.md rule 16).
           `disclose` because the pair only exists once the query answers,
           and a frame this size arriving in one frame is a yank. -->
      <div class="disclosed" transition:disclose>
        <h3 bind:this={comparisonHeading} tabindex="-1" data-hair-comparison>{m.ph_compare()}</h3>
        <PhotoWipe
          {photos}
          pair={wipePair}
          onPair={setWipePair}
          role={roleAt(activeFlag.roles, SECTION_ROLE.photos)}
          date={(photo) => dayLabel(photo.epochDay)}
          note={(photo) => sinceStart(photo.epochDay)}
        />
      </div>
    {/if}

    <div style="margin:var(--space-4) 0">
      <PhotoSection
        section={hairPhotos}
        read={photosQuery}
        role={roleAt(activeFlag.roles, SECTION_ROLE.photos)}
        handle="hair-photo"
        reverse
        title={(p) => dayLabel(p.epochDay)}
        subtitle={(p) => sinceStart(p.epochDay)}
        deleteLabel={() => m.hair_photo_delete_sheet()}
        confirm={{
          title: m.hair_photo_delete_sheet(),
          question: () => m.hair_photo_delete_q(),
          hint: () => m.hair_photo_delete_hint(),
          confirmLabel: m.hair_photo_delete(),
          cancelLabel: m.keep_it()
        }}
      >
        {#snippet empty()}
          <div class="screen-part">
            <Notice
              icon="camera"
              key="hair-photos-empty"
              role={roleAt(activeFlag.roles, SECTION_ROLE.photos)}
              title={m.hair_photo_empty_title()}
              text={m.hair_photo_empty_body()}
            />
          </div>
        {/snippet}
      </PhotoSection>
    </div>
  </ReadReserve>

  <Sheet open={anchorEditor !== null} title={m.hair_anchor_sheet()} onClose={() => (anchorEditor = null)}>
    {#if anchorEditor !== null}
      <h3>{m.hair_anchor_sheet()}</h3>
      <p class="muted small" style="margin-bottom:var(--space-4)">{m.hair_anchor_sheet_hint()}</p>
      <Field label={m.hair_anchor_date_label()} id="hair-anchor-date">
        {#snippet children(id)}
          <DatePicker name="hair-anchor-date" bind:value={anchorEditor!} {id} />
        {/snippet}
      </Field>
      <div class="stack-3">
        <button class="btn btn-primary" data-save-hair-anchor onclick={saveAnchor}><span>{m.hair_anchor_save()}</span></button>
        {#if anchorIsUserSet}
          <button class="btn btn-ghost" data-clear-hair-anchor onclick={clearAnchor}><span>{m.hair_anchor_clear()}</span></button>
        {/if}
      </div>
    {/if}
  </Sheet>

  <!-- Saying you are done with this area (phase 8 features ticket 04). -->
  <AreaFinish group="hair-progress" held={!bodyRevealed} />

  <RecordSheet
    record={stageRecord}
    handle="hair-stage"
    newTitle={m.hair_stage_new_sheet()}
    editTitle={m.hair_stage_edit_sheet()}
    saveLabel={m.hair_stage_save()}
    deleteLabel={m.hair_stage_delete()}
    canSave={(draft) => draft.description.trim() !== ''}
    confirm={{
      title: m.hair_stage_delete_sheet(),
      question: () => m.hair_stage_delete_q(),
      hint: () => m.hair_stage_delete_hint(),
      confirmLabel: m.hair_stage_delete(),
      cancelLabel: m.keep_it()
    }}
  >
    {#snippet fields(stageEditor)}
      <Field label={m.hair_other_label()} id="hair-stage-text">
        {#snippet children(id)}
          <textarea autocomplete={journalTextAutocomplete()}
            class="input"
            {id}
            name="hair-stage-text"
            placeholder={m.hair_other_placeholder()}
            bind:value={stageEditor.description}
          ></textarea>
        {/snippet}
      </Field>
      <Field label={m.hair_stage_date_label()} id="hair-stage-date">
        {#snippet children(id)}
          <DatePicker name="hair-stage-date" bind:value={stageEditor.date} {id} />
        {/snippet}
      </Field>
    {/snippet}
  </RecordSheet>
</div>

<style>
  .hair-photo-actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
    margin-bottom: var(--space-3);
  }

  .hair-photo-actions .btn {
    flex: 1;
  }

  .jump-up {
    display: inline-flex;
    transform: rotate(180deg);
  }
</style>
