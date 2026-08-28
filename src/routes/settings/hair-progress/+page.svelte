<script lang="ts">
  /* Staging against a published scale, and fixed-position photos, on the
     surface kit (phase 5 UX ticket 25).

     Three of this screen's four cards were saying something rather than
     holding something - where the week count is measured from, that a
     photo is due, and how to take one so two of them compare. All three
     are notices now, which is the surface for a remark with at most one
     action on it, and the protocol's dismiss is the notice's own rather
     than an icon button wired into a header row. */
  import { m } from '$lib/paraglide/messages';
  import { journal, liveList } from '$lib/data/live/journal.svelte';
  import { prefs } from '$lib/data/prefs/store.svelte';
  import { hairAnchorEpochDay } from '$lib/data/hairAnchor';
  import { isHairPhotoDue } from '$lib/data/hairPhotoSchedule';
  import { hairScaleName, hairScaleSub, hairStageName } from '$lib/data/vocabulary/labels';
  import { HAIR_SCALES, gradesOfScale, isGradedScale, stagesByScale } from '$lib/data/hairStageScales';
  import { fmtDay } from '$lib/data/dates';
  import { todayEpochDay, epochDayFromDateInputValue, epochDayFromDateInputValueOrToday, dateInputValueFromEpochDay } from '$lib/data/epochDay';
  import type { HairStage } from '$lib/data/types';
  import type { HairPhoto } from '$lib/data/journal/hairProgress';
  import type { NormalizedPhoto } from '$lib/data/journal/photos';
  import Icon from '$lib/components/Icon.svelte';
  import ScreenHeader from '$lib/components/ScreenHeader.svelte';
  import Sheet from '$lib/components/Sheet.svelte';
  import Skeleton from '$lib/components/Skeleton.svelte';
  import Field from '$lib/components/kit/Field.svelte';
  import ListCard from '$lib/components/kit/ListCard.svelte';
  import ListRow from '$lib/components/kit/ListRow.svelte';
  import Notice from '$lib/components/kit/Notice.svelte';
  import PhotoSection from '$lib/components/kit/PhotoSection.svelte';
  import { recordEditor } from '$lib/components/kit/recordEditor.svelte';
  import { photoSection } from '$lib/components/kit/photoSection.svelte';
  import { lastPhotoReference } from '$lib/components/kit/photoSection';
  import RecordSheet from '$lib/components/kit/RecordSheet.svelte';
  import SectionHeading from '$lib/components/kit/SectionHeading.svelte';
  import { crossfade, disclose } from '$lib/motion/reveal';
  import { activeFlag } from '$lib/theme/activeFlag.svelte';
  import { roleAt } from '$lib/theme/roles';
  import ReadGate from '$lib/components/kit/ReadGate.svelte';

  /* Two areas, two stripes: the staging and the photographs. The notices
     that talk about the app rather than about the journal take no role at
     all, which is the call Home's backup notice makes. */
  const SECTION_ROLE = { stages: 0, photos: 1 };

  const today = todayEpochDay();

  /* Bounded from epoch day 0 rather than from the anchor itself: getDoses
     needs a range (doses.ts has no unbounded read). No dose can predate
     1970-01-01, so this is unbounded in practice. */
  let dosesQuery = liveList((j) => j.doses.getDoses(0, today));
  let doses = $derived(dosesQuery.rows);

  /* The day this screen counts weeks from: whatever the person set, else
     their earliest logged dose of anything, else nothing (hairAnchor.ts,
     ticket 33). No drug is named - ticket 09's finasteride/dutasteride/
     minoxidil list is gone. */
  let anchorEpochDay = $derived(hairAnchorEpochDay(prefs.hairAnchorEpochDay, doses));
  let anchorIsUserSet = $derived(prefs.hairAnchorEpochDay !== null);

  let stagesQuery = liveList((j) => j.hairProgress.getStages());
  let stages = $derived(stagesQuery.rows);

  /* Grouped so that no list, and no run of subtitles, ever reads as one
     series across two scales (ticket 33, hairStageScales.ts). Newest first
     within each scale, which is the order the single list used to be in. */
  let stageGroups = $derived(stagesByScale([...stages].reverse()));

  let photosQuery = liveList((j) => j.hairProgress.getPhotos());
  let photos = $derived(photosQuery.rows);

  let lastPhotoEpochDay = $derived(photos.at(-1)?.epochDay ?? null);
  let photoDue = $derived(isHairPhotoDue(anchorEpochDay, lastPhotoEpochDay, today));

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
  }

  function clearAnchor() {
    prefs.hairAnchorEpochDay = null;
    anchorEditor = null;
  }

  /* `scale` starts null on a new staging and the save button stays disabled
     until it is picked. No scale is preselected on purpose: defaulting to
     either one would be the app guessing which pattern the person has, which
     is the assumption ticket 33 exists to remove. */
  type StageDraft = { id?: string; date: string; scale: string | null; stage: string; description: string };

  const stageRecord = recordEditor<HairStage, StageDraft>({
    blank: () => ({ date: dateInputValueFromEpochDay(today), scale: null, stage: '', description: '' }),
    fromRecord: (existing) => ({
      id: existing.id,
      date: dateInputValueFromEpochDay(existing.epochDay),
      scale: existing.scale,
      stage: existing.stage,
      description: existing.description
    }),
    async upsert(draft) {
      if (!draft.scale) return false;
      await journal.hairProgress.upsertStage({
        id: draft.id,
        epochDay: epochDayFromDateInputValueOrToday(draft.date),
        scale: draft.scale,
        stage: draft.stage,
        description: draft.description
      });
    },
    remove: (id) => journal.hairProgress.deleteStage(id),
    findById: (id) => stages.find((s) => s.id === id)
  });

  /** Picking a scale clears both the grade and the prose rather than
      carrying either over. The two scales share codes and mean different
      things by them, so a kept '3' would silently become a different claim
      (hairStageScales.ts) - and prose has nowhere to live on a graded scale,
      so clearing it here is what stops a person's own words disappearing
      between the sheet and the save (hairProgress.ts's checkedStaging drops
      it either way). */
  function pickScale(draft: StageDraft, scale: string) {
    if (draft.scale === scale) return;
    draft.scale = scale;
    draft.stage = gradesOfScale(scale)[0] ?? '';
    draft.description = '';
  }

  async function storePhoto(photo: NormalizedPhoto): Promise<void> {
    await journal.hairProgress.addPhoto(today, photo);
  }

  const hairPhotos = photoSection<HairPhoto>({
    photos: () => photos,
    add: storePhoto,
    remove: (id) => journal.hairProgress.deletePhoto(id),
    reference: () => lastPhotoReference(photos)
  });

  function dismissProtocol() {
    prefs.hairPhotoProtocolDismissed = true;
  }
</script>

<div class="screen">
  <ScreenHeader title={m.hair_progress()} back="/more" subtitle={m.hair_intro()} />

  {#if dosesQuery.loading}
    <div out:crossfade><Skeleton variant="block" count={1} /></div>
  {:else}
    <div data-anchor>
      <Notice
        icon="clock"
        key="hair-anchor"
        text={anchorEpochDay == null
          ? m.hair_unanchored_note()
          : anchorIsUserSet
            ? m.hair_anchor_from_set({ date: dayLabel(anchorEpochDay) })
            : m.hair_anchor_from_dose({ date: dayLabel(anchorEpochDay) })}
        action={{
          label: anchorIsUserSet ? m.hair_anchor_change_action() : m.hair_anchor_set_action(),
          onclick: openAnchorEditor
        }}
      />
    </div>

    <SectionHeading text={m.hair_stage_section_title()}>
      {#snippet action()}
        <button class="icon-btn press" data-add-stage aria-label={m.hair_stage_add_aria()} onclick={() => stageRecord.openEditor(null)}>
          <Icon name="plus" size={20} />
        </button>
      {/snippet}
    </SectionHeading>

    <ReadGate read={stagesQuery} variant="line" count={2}>
      {#snippet rows()}
        <div class="screen-part">
          {#each stageGroups as group (group.scale)}
            <!-- Each scale keeps its own card and its own name above it. A run
                 of subtitles across two scales reads as one series, which is
                 the thing ticket 33 split these groups apart to stop. -->
            <p class="hair-scale-name" data-scale-group={group.scale}>{hairScaleName(group.scale)}</p>
            <ListCard role={roleAt(activeFlag.roles, SECTION_ROLE.stages)}>
              {#each group.stages as s (s.id)}
                {@const graded = isGradedScale(s.scale)}
                <ListRow
                  key={s.id}
                  data-hair-stage={s.id}
                  icon="comb"
                  title={graded ? hairStageName(s.scale, s.stage) : s.description || m.hair_other_unwritten()}
                  subtitle={stageSubtitle(s.epochDay)}
                  chevron={false}
                  onclick={() => stageRecord.openEditor(s)}
                />
              {/each}
            </ListCard>
          {/each}
        </div>
      {/snippet}
      {#snippet empty()}
        <div class="screen-part">
          <Notice
            icon="comb"
            key="hair-stages-empty"
            role={roleAt(activeFlag.roles, SECTION_ROLE.stages)}
            title={m.hair_stage_empty_title()}
            text={m.hair_stage_empty_body()}
            action={{ label: m.hair_stage_empty_action(), primary: true, onclick: () => stageRecord.openEditor(null) }}
          />
        </div>
      {/snippet}
    </ReadGate>

    <p class="muted small">{m.hair_scale_source()}</p>

    <SectionHeading text={m.hair_photo_section_title()} />

    {#if photoDue}
      <div data-photo-due>
        <Notice
          icon="camera"
          key="hair-photo-due"
          role={roleAt(activeFlag.roles, SECTION_ROLE.photos)}
          title={m.hair_photo_due_title()}
          text={m.hair_photo_due_body()}
        />
      </div>
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
  {/if}

  <Sheet open={anchorEditor !== null} title={m.hair_anchor_sheet()} onClose={() => (anchorEditor = null)}>
    {#if anchorEditor !== null}
      <h3>{m.hair_anchor_sheet()}</h3>
      <p class="muted small" style="margin-bottom:var(--space-4)">{m.hair_anchor_sheet_hint()}</p>
      <Field label={m.hair_anchor_date_label()} id="hair-anchor-date">
        {#snippet children(id)}
          <input class="input" type="date" {id} name="hair-anchor-date" bind:value={anchorEditor!} />
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

  <RecordSheet
    record={stageRecord}
    handle="hair-stage"
    newTitle={m.hair_stage_new_sheet()}
    editTitle={m.hair_stage_edit_sheet()}
    saveLabel={m.hair_stage_save()}
    deleteLabel={m.hair_stage_delete()}
    canSave={(draft) => draft.scale !== null}
    confirm={{
      title: m.hair_stage_delete_sheet(),
      question: () => m.hair_stage_delete_q(),
      hint: () => m.hair_stage_delete_hint(),
      confirmLabel: m.hair_stage_delete(),
      cancelLabel: m.keep_it()
    }}
  >
    {#snippet fields(stageEditor)}
      <Field label={m.hair_stage_date_label()} id="hair-stage-date">
        {#snippet children(id)}
          <input class="input" type="date" {id} name="hair-stage-date" bind:value={stageEditor.date} />
        {/snippet}
      </Field>
      <Field label={m.hair_scale_label()} legend>
        {#snippet children(id)}
          <ListCard role={roleAt(activeFlag.roles, SECTION_ROLE.stages)}>
            <div role="radiogroup" aria-labelledby={id}>
              {#each HAIR_SCALES as scale (scale)}
                <button
                  class="kit-row"
                  role="radio"
                  aria-checked={stageEditor.scale === scale}
                  data-pick-scale={scale}
                  onclick={() => pickScale(stageEditor, scale)}
                >
                  <span class="kit-row-text">
                    <span class="kit-row-title">{hairScaleName(scale)}</span>
                    <span class="kit-row-sub">{hairScaleSub(scale)}</span>
                  </span>
                  <span class="kit-row-trail">
                    {#if stageEditor.scale === scale}<Icon name="check" size={20} />{/if}
                  </span>
                </button>
              {/each}
            </div>
          </ListCard>
        {/snippet}
      </Field>
      {#if stageEditor.scale}
        {@const scale = stageEditor.scale}
        <div class="disclosed" transition:disclose>
          {#if isGradedScale(scale)}
            <Field label={m.hair_stage_label()} id="hair-stage-value">
              {#snippet children(id)}
                <select class="input" {id} bind:value={stageEditor.stage}>
                  {#each gradesOfScale(scale) as grade (grade)}
                    <option value={grade}>{hairStageName(scale, grade)}</option>
                  {/each}
                </select>
              {/snippet}
            </Field>
          {:else}
            <Field label={m.hair_other_label()} id="hair-other-value">
              {#snippet children(id)}
                <input
                  class="input"
                  {id}
                  name="hair-other-value"
                  placeholder={m.hair_other_placeholder()}
                  bind:value={stageEditor.description}
                />
              {/snippet}
            </Field>
          {/if}
        </div>
      {/if}
    {/snippet}
  </RecordSheet>
</div>

<style>
  /* The scale's own name over its card. Not a SectionHeading: the area is
     already named ("Staging") and these are the two scales inside it, so
     giving each the screen-title size would make the area's own heading
     the smaller of the two. */
  .hair-scale-name {
    margin: var(--space-4) 0 var(--space-2);
    font-size: var(--text-sm);
    font-weight: var(--weight-medium);
    color: var(--text-2);
  }
</style>
