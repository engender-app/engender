<script lang="ts">
  import { onDestroy } from 'svelte';
  import { goto } from '$app/navigation';
  import { m } from '$lib/paraglide/messages';
  import { todayEpochDay } from '$lib/data/epochDay';
  import { fmtDay, fmtTime } from '$lib/data/dates';
  import { journal, liveQuery, onFirstResult } from '$lib/data/live/journal.svelte';
  import { createEntryDraft, type EntryDraft } from '$lib/data/entryDraft';
  import { applyPersistedDraft, draftMatchesRoute, serializeDraft } from '$lib/data/entryDraftPersistence';
  import { localStorageEntryDraft } from '$lib/data/entryDraftStore';
  import { pickPhotos, type ReferencePhoto } from '$lib/stores/photoPicking';
  import { photoReview } from '$lib/stores/photoReview.svelte';
  import { pickRecording, startRecording, type ActiveRecording } from '$lib/stores/voiceRecording';
  import { pickVideo, startVideoRecording, type ActiveVideoRecording } from '$lib/stores/videoRecording';
  import { VIDEO_MAX_DURATION_MS } from '$lib/data/videoNotes/limits';
  import { prefs } from '$lib/data/prefs/store.svelte';
  import { toast } from '$lib/stores/toasts.svelte';
  import type { EntryPrompt, EntryTemplate, GenderDimension } from '$lib/data/types';
  import { activeFlag } from '$lib/theme/activeFlag.svelte';
  import { roleAt } from '$lib/theme/roles';
  import { entryContainerName } from '$lib/motion/container.svelte';
  import Icon from '$lib/components/Icon.svelte';
  import ScreenHeader from '$lib/components/ScreenHeader.svelte';
  import { smartBack } from '$lib/navigation/smart-back';
  import ListCard from '$lib/components/kit/ListCard.svelte';
  import ListRow from '$lib/components/kit/ListRow.svelte';
  import Notice from '$lib/components/kit/Notice.svelte';
  import SectionHeading from '$lib/components/kit/SectionHeading.svelte';
  import MoodPicker from '$lib/components/MoodPicker.svelte';
  import DimensionSlider from '$lib/components/DimensionSlider.svelte';
  import TagPicker from '$lib/components/TagPicker.svelte';
  import BodyRegionPicker from '$lib/components/BodyRegionPicker.svelte';
  import PhotoThumb from '$lib/components/PhotoThumb.svelte';
  import PhotoAlignmentReview from '$lib/components/PhotoAlignmentReview.svelte';
  import VoicePlayer from '$lib/components/VoicePlayer.svelte';
  import VideoNotePlayer from '$lib/components/VideoNotePlayer.svelte';
  import Sheet from '$lib/components/Sheet.svelte';
  import Skeleton from '$lib/components/Skeleton.svelte';
  import { vocabulary } from '$lib/data/vocabulary/vocabulary';

  let { epochDay, entryId, seedMood }: { epochDay?: number; entryId?: number; seedMood?: number | null } = $props();

  /* The editor is a writing surface rather than a set of areas to look at,
     so it spends almost none of the flag: what colour it does take goes on
     the two things that are not fields - the guided prompt, and the template
     list inside its sheet. Role 0, the only index guaranteed to be a colour
     on all 8 palettes, since there is no reading order to follow with one
     role in play. The attachments surface below is deliberately uncoloured;
     everything inside it is a photograph or a waveform bringing its own. */
  let role = $derived(roleAt(activeFlag.roles, 0));

  /* An entry to edit is a round trip away now, so the draft cannot be built
     during initialisation the way it was over the synchronous store. The
     route wraps this component in {#key}, so a different entry or day mounts
     a fresh editor and this loads once.

     What keeps a re-run from throwing away what the user typed is
     `onFirstResult`, which fills the draft from the first result and never
     again - not the query's dependencies, which this no longer names. */
  let loaded = liveQuery((j) => (entryId != null ? j.entries.getEntry(entryId) : Promise.resolve(undefined)));
  let existing = $derived(loaded.value);
  let day = $derived(existing?.epochDay ?? epochDay ?? todayEpochDay());

  /* Local draft; committed as one action on Save (F1), and filled from the
     stored entry the moment it arrives (entryDraft.ts, ticket 29). */
  // Captured once on purpose: the route wraps this component in {#key}, so a
  // different entry or day mounts a fresh editor with a fresh draft.
  // svelte-ignore state_referenced_locally
  let entryDraft = $state<EntryDraft>(createEntryDraft(epochDay ?? todayEpochDay(), undefined, seedMood));

  /* Survives an Android process death (ticket 14): mirrored to localStorage
     on every change below and cleared the moment this editor unmounts, so
     only a killed-while-backgrounded process ever leaves it to be found on
     the next mount. A same-process background/resume never unmounts this
     component at all, so its in-memory state alone already handles that
     case - this only ever restores after a real process death. */
  const draftStore = localStorageEntryDraft();

  function restoreIfPersisted(target: EntryDraft) {
    const persisted = draftStore.read();
    if (!persisted) return;
    if (draftMatchesRoute(persisted, entryId, target.epochDay)) applyPersistedDraft(target, persisted);
    else draftStore.clear(); // a different editor's leftovers - not this one's to resume
  }

  // svelte-ignore state_referenced_locally
  restoreIfPersisted(entryDraft);

  onFirstResult(loaded, (entry) => {
    if (!entry) return;
    const fresh = createEntryDraft(entry.epochDay, entry);
    restoreIfPersisted(fresh);
    entryDraft = fresh;
    starred = entry.starred;
  });

  /* Curation metadata (CONTEXT: "Starred"), read once like the rest of
     `existing` and kept in its own local state rather than `entryDraft`:
     starring is its own mutation (entries.ts, setEntryStarred), never part
     of a content save, and `loaded`'s deliberately empty table list (see
     above) means it will not refresh itself from elsewhere either. */
  let starred = $state(false);

  async function toggleStarred() {
    if (!existing) return;
    const next = !starred;
    await journal.entries.setEntryStarred(existing.id, next);
    starred = next;
  }

  /* Same reasoning as toggleStarred above, but for one stored photo: the
     draft's copy of it has to be updated by hand too, or the star shown
     here would go stale the moment the write lands. */
  async function togglePhotoStarred(index: number) {
    const item = entryDraft.photos[index];
    if (item.kind !== 'stored') return;
    const next = !item.photo.starred;
    await journal.photos.setStarred(item.photo.id, next);
    entryDraft.photos = entryDraft.photos.map((p, i) =>
      i === index && p.kind === 'stored' ? { ...p, photo: { ...p.photo, starred: next } } : p
    );
  }

  $effect(() => {
    draftStore.write(serializeDraft(entryDraft));
  });

  onDestroy(() => draftStore.clear());

  let deleteOpen = $state(false);
  let saving = $state(false);
  let templateSheetOpen = $state(false);
  let promptDismissed = $state(false);
  /* Guided prompts and templates are entry-creation aids (ticket 17), not
     something to surface while editing an already-saved entry - `entryId`
     is undefined only for a new one. Read once, like `seedMood` above: the
     route wraps this component in {#key}, so a fresh editor always means a
     fresh prompt, never a stale one left over from a previous mount. */
  // svelte-ignore state_referenced_locally
  let prompt = $state<EntryPrompt | null>(
    entryId == null && prefs.guidedPromptsEnabled ? vocabulary.randomPrompt() : null
  );

  /* A template only ever pre-fills what this install currently shows -
     a hidden dimension or tag stays out of the draft even if the template
     names it, because the picker that would let someone edit it back off
     is exactly what `hidden` took out of the editor (CONTEXT: "Hidden").
     Applying the same template twice cannot double up: applyTemplate()
     unions the tags and overwrites the dims by key. */
  function applyTemplate(tpl: EntryTemplate) {
    const visibleTagIds = new Set(vocabulary.visibleTagGroups.flatMap((g) => g.tags.map((t) => t.id)));
    const visibleDimKeys = new Set(vocabulary.visibleDimensions.map((d) => d.key));
    entryDraft.applyTemplate(
      tpl.tags.filter((id) => visibleTagIds.has(id)),
      Object.fromEntries(Object.entries(tpl.dims).filter(([key]) => visibleDimKeys.has(key)))
    );
    templateSheetOpen = false;
  }
  /* The union of the ticked scales and the entry's own: an entry logged
     when more was ticked keeps its extra scales on screen (marked below),
     instead of silently dropping their history on save. */
  let dims = $derived.by(() => {
    const active = vocabulary.activeDimensions;
    const extras = Object.keys(entryDraft.dims)
      .filter((key) => !active.some((d) => d.key === key))
      .map((key) => vocabulary.dimensions.find((d) => d.key === key))
      .filter((d): d is GenderDimension => !!d);
    return [...active.map((dim) => ({ dim, ticked: true })), ...extras.map((dim) => ({ dim, ticked: false }))];
  });
  let isToday = $derived(day === todayEpochDay());

  // An entry holds several photos, so one trip through the picker can bring
  // back several (photoPicking.ts).
  async function addPhoto() {
    for (const photo of await pickPhotos()) entryDraft.addPhoto(photo);
  }

  // The context is this entry: the last photo already in its own draft,
  // stored or just picked, not the journal's last photo overall.
  function lastDraftPhotoReference(): ReferencePhoto | null {
    const last = entryDraft.photos.at(-1);
    if (!last) return null;
    if (last.kind === 'picked') return { bytes: last.photo.full };
    return last.photo.fileName ? { fileName: last.photo.fileName } : null;
  }

  const entryPhotoReview = photoReview(lastDraftPhotoReference, (photo) => entryDraft.addPhoto(photo));

  // Unset while nothing is being recorded; the record/stop button reads
  // this to know which state it is showing (ticket 24).
  let activeRecording = $state<ActiveRecording | null>(null);

  async function toggleRecording() {
    if (activeRecording) {
      const bytes = await activeRecording.stop();
      activeRecording = null;
      if (bytes) entryDraft.addRecording(bytes);
      return;
    }
    activeRecording = await startRecording();
  }

  /* Picking one that already exists, rather than making one here. Photos
     offered a gallery from the start and these two did not, which is what
     Alicja asked for on 2026-08-25 against the built screen: a recording of
     her own voice from a year ago is the same kind of thing as a photo from
     a year ago, and the editor could take one and not the other.

     The store owns whether the file is admissible - the wrong kind, too
     long, too large to store - and reports its own refusals, so there is
     nothing to branch on here beyond "did anything come back". */
  async function addRecordingFile() {
    const bytes = await pickRecording();
    if (bytes) entryDraft.addRecording(bytes);
  }

  /* Video notes (ticket 22). Three pieces of state where a voice recording
     needs one: the live capture for the preview, the countdown, and a flag
     for the wait while an oversized capture is compressed - that step runs in
     real time (videoNotes/reencode.ts), so a 30-second note takes another 30
     seconds and a silent editor would look broken. */
  let activeVideo = $state<ActiveVideoRecording | null>(null);
  let videoSecondsLeft = $state(0);
  let compressingVideo = $state(false);

  const VIDEO_MAX_SECONDS = Math.round(VIDEO_MAX_DURATION_MS / 1000);

  async function finishVideo(active: ActiveVideoRecording) {
    activeVideo = null;
    compressingVideo = true;
    try {
      const bytes = await active.stop();
      if (bytes) entryDraft.addVideo(bytes);
    } finally {
      compressingVideo = false;
    }
  }

  /* The same, for a video, and it borrows the compressing flag: an oversized
     pick goes through the same real-time re-encode a capture does, so a
     30-second file takes another 30 seconds and a silent editor would look
     broken. */
  async function addVideoFile() {
    compressingVideo = true;
    try {
      const bytes = await pickVideo();
      if (bytes) entryDraft.addVideo(bytes);
    } finally {
      compressingVideo = false;
    }
  }

  async function toggleVideo() {
    if (activeVideo) {
      await finishVideo(activeVideo);
      return;
    }
    const started = await startVideoRecording();
    if (!started) return;
    activeVideo = started;
    videoSecondsLeft = VIDEO_MAX_SECONDS;
    /* The cap is enforced in the store, not here (videoRecording.ts): this
       only mirrors it, so a note that hits 30 seconds is collected the same
       way a tapped Stop collects one. */
    started.capped.then(() => {
      if (activeVideo === started) void finishVideo(started);
    });
  }

  /* The countdown, which exists only while something is recording - an
     interval that outlived the capture would keep the editor re-rendering
     for nothing. */
  $effect(() => {
    if (!activeVideo) return;
    const tick = setInterval(() => {
      videoSecondsLeft = Math.max(0, videoSecondsLeft - 1);
    }, 1000);
    return () => clearInterval(tick);
  });

  /* Binds the live stream to the preview element. srcObject cannot be set as
     an attribute, so it takes an effect rather than markup. */
  function previewStream(node: HTMLVideoElement, stream: MediaStream) {
    node.srcObject = stream;
    return {
      destroy() {
        node.srcObject = null;
      }
    };
  }

  // A recording still running when the editor unmounts (navigating away
  // mid-recording) must not leave the microphone or the camera open behind
  // the screen.
  onDestroy(() => {
    activeRecording?.stop();
    activeVideo?.stop();
  });

  let moodMissing = $derived(entryDraft.mood == null);

  async function saveEntry() {
    if (moodMissing) {
      toast(m.entry_needs_mood());
      return;
    }
    if (saving) return; // a second tap while the worker is writing
    saving = true;
    try {
      const id = await journal.entries.upsertEntry(entryDraft.toUpsert());
      /* A quick log (seedMood set) that is still mood-only at save time
         offers to fill in the active preset's scales too, right on Home
         (ticket 13, beta B2) - the entry id travels there as a query param
         since the save already navigates there, the way `seedMood` and
         `celebrate` also arrive as query params (though those are read
         directly; this one is consumed once and stripped from the URL by
         +page.svelte, since the sheet must not reopen on a reload or the
         back button). Offering that sheet replaces the "Add details" nudge
         below rather than stacking alongside it - both are the same kind of
         post-save suggestion, and showing both would ask for the same thing
         twice. */
      const offerDims = seedMood != null && entryDraft.hasMoodOnlyContent && vocabulary.activeDimensions.length > 0;
      await goto(offerDims ? `/?quickLogDims=${id}` : '/');
      if (offerDims) {
        toast(m.saved(), { kind: 'saved' });
      } else if (prefs.entryNudges && entryDraft.hasMoodOnlyContent) {
        toast(m.saved(), { actionLabel: m.add_details(), onAction: () => goto(`/entry/${id}`), kind: 'saved' });
      } else {
        toast(m.saved(), { kind: 'saved' });
      }
    } catch (error) {
      console.error('could not save the entry', error);
      toast(m.entry_save_failed());
    } finally {
      saving = false;
    }
  }

  async function confirmDelete() {
    deleteOpen = false;
    if (existing) await journal.entries.deleteEntry(existing.id);
    goto('/');
  }
</script>

<!-- The destination half of the app's one container transform (DIRECTION.md
     tier 2, deferred to this ticket by ticket 18): the tapped entry row is
     the box this screen grows out of. Named off the `entryId` prop rather
     than off the loaded entry, and that is the whole trick - the browser
     photographs the new screen as soon as the navigation settles, and the
     entry itself is a worker round trip behind that, so a name waiting on
     `existing` would arrive after the picture was taken. The route knows
     which entry this is without asking anybody.

     The name itself lives on `.editor-bg`, not on this element - see
     EntryCard.svelte's comment, the other half of the same fix: a view
     transition scales its named element's whole rasterised image between
     the card's rect and this screen's, and this screen's own heading and
     fields rode inside that image too, at whatever size the small card
     was, before growing into a screen (Alicja, 2026-08-27: "the ridiculous
     huge text transition"). The plain fill grows now; the real content
     sits outside the named element and crossfades in place through the
     screen's own transition instead. -->
<div class="screen editor">
  <div class="editor-bg" style:view-transition-name={entryContainerName(entryId != null ? String(entryId) : null)}></div>
  <!-- Back goes wherever you opened it from, not to the entry's own day. An
       entry is drawn on Home, on a day, in search, on the timeline, inside a
       tryout and in the counterevidence journal, and every one of those sent
       you to /day/... on the way back - a screen you may never have been on
       (Alicja, 2026-08-26, from the counterevidence journal). The day stays
       as the fallback for a deep link or a reload, which is what smartBack
       is for (NAV-005). -->
  <ScreenHeader
    title={existing ? m.entry() : m.new_entry()}
    screen="entry"
    back={() => smartBack(existing ? `/day/${day}` : '/')}
  >
    {#snippet actions()}
      {#if existing}
        <button
          class="icon-btn press"
          aria-label={starred ? m.unstar_entry() : m.star_entry()}
          aria-pressed={starred}
          onclick={toggleStarred}
        >
          <Icon name="star" size={20} cls={starred ? 'is-starred' : ''} />
        </button>
        <button class="icon-btn press" aria-label={m.delete_entry()} onclick={() => (deleteOpen = true)}>
          <Icon name="trash" size={20} />
        </button>
      {/if}
    {/snippet}
  </ScreenHeader>
  <p class="editor-date">
    {isToday ? `${m.today()} · ` : ''}{fmtDay(day, { weekday: 'long', day: 'numeric', month: 'long' })}{existing ? ` · ${fmtTime(existing.timestamp)}` : ''}
  </p>

  {#if prompt && !promptDismissed}
    <Notice
      icon="sparkle"
      key="entry-prompt"
      {role}
      text={prompt.text}
      dismiss={{ label: m.dismiss(), onclick: () => (promptDismissed = true) }}
      aria-live="polite"
    />
  {/if}

  {#if entryId == null}
    <button class="btn btn-ghost" data-use-template onclick={() => (templateSheetOpen = true)}>
      <Icon name="sparkle" size={18} /><span>{m.use_template()}</span>
    </button>
  {/if}

  <!-- An existing entry has to arrive before the draft can hold it, so the
       editor waits rather than showing an empty form that fills itself in
       under the user's hands. A new entry has nothing to wait for. -->
  {#if loaded.loading}
    <Skeleton variant="block" count={3} />
  {:else}
  <SectionHeading text={m.mood()} />
  <MoodPicker value={entryDraft.mood} onPick={(v) => entryDraft.setMood(v)} />

  <SectionHeading text={m.gender_label()}>
    {#snippet action()}
      <a class="kit-heading-action" href="/settings">{m.scales_change()}</a>
    {/snippet}
  </SectionHeading>
  <!-- Nothing ticked and nothing kept from this entry is a resting state,
       not a gap: somebody can reach it by unticking five boxes, and a mood,
       tags, a note and a photo are still an entry. The section says what it
       is rather than leaving a heading over nothing (phase 5 ticket 35).

       One line or the other, never both. "However it feels right now, there
       are no wrong answers" is reassurance about answering the sliders, and
       with no sliders under it it was reassurance about nothing, stacked on
       top of the line explaining why they are missing. -->
  {#if dims.length === 0}
    <p class="editor-hint" data-no-scales>{m.editor_no_scales()}</p>
  {:else}
    <p class="editor-hint">{m.gender_hint()}</p>
  {/if}
  {#each dims as { dim, ticked } (dim.key)}
    <DimensionSlider {dim} value={entryDraft.dims[dim.key] ?? null} onInput={(v) => entryDraft.setDim(dim.key, v)} />
    {#if !ticked}
      <p class="editor-hint editor-hint-tight">{m.scale_not_ticked()}</p>
    {/if}
  {/each}

  <SectionHeading text={m.tags_label()} />
  <TagPicker
    groups={vocabulary.visibleTagGroups}
    selected={entryDraft.tags}
    onToggle={(id) => entryDraft.toggleTag(id)}
  />

  <SectionHeading text={m.note_label()} />
  <textarea
    class="input editor-note"
    id="ed-note"
    name="note"
    rows="4"
    placeholder={m.note_placeholder()}
    bind:value={entryDraft.note}
  ></textarea>

  <SectionHeading text={m.body_map_label()} />
  <p class="editor-hint">{m.body_map_hint()}</p>
  <BodyRegionPicker
    regions={vocabulary.visibleBodyRegions}
    values={entryDraft.bodyRegions}
    onToggle={(key) => entryDraft.toggleBodyRegion(key)}
    onFeeling={(key, feeling) => entryDraft.setBodyRegionFeeling(key, feeling)}
  />

  <!-- One area for everything an entry carries besides its words, rather
       than three headed cards in a row. A photo, a voice note and a video
       note are the same act - attaching something to today - and the three
       of them were half the editor's length. They keep their own labels
       inside it, because "Record" on two buttons side by side does not say
       which one is which, and the label is what disambiguates them. -->
  <SectionHeading text={m.attachments_label()} />
  <div class="editor-media" data-editor-media>
    <section class="editor-media-group">
      <h3 class="editor-media-label">{m.photos_label()}</h3>
      <div class="photo-row">
        {#each entryDraft.photos as p, i (p)}
          <div class="photo-wrap">
            {#if p.kind === 'stored'}
              <PhotoThumb photo={p.photo} size={72} />
              <button
                class="photo-star"
                class:is-starred={p.photo.starred}
                aria-label={p.photo.starred ? m.unstar_photo() : m.star_photo()}
                aria-pressed={p.photo.starred}
                onclick={() => togglePhotoStarred(i)}
              >
                <Icon name="star" size={14} cls={p.photo.starred ? 'is-starred' : ''} />
              </button>
            {:else}
              <PhotoThumb photo={{ fileName: null }} bytes={p.photo.thumb} size={72} />
            {/if}
            <button class="photo-remove" aria-label={m.photo_remove()} onclick={() => entryDraft.removePhoto(i)}>
              <Icon name="x" size={14} />
            </button>
          </div>
        {/each}
        <button class="photo-add press" aria-label={m.add_photo()} onclick={addPhoto}>
          <Icon name="image" size={22} /><span>{m.add_photo()}</span>
        </button>
        <button class="photo-add press" aria-label={m.add_photo_camera()} onclick={entryPhotoReview.capture}>
          <Icon name="camera" size={22} /><span>{m.add_photo_camera()}</span>
        </button>
      </div>
    </section>

    <section class="editor-media-group">
      <h3 class="editor-media-label">{m.recordings_label()}</h3>
      {#if entryDraft.recordings.length > 0}
        <div class="recording-list">
          {#each entryDraft.recordings as r, i (r)}
            <div class="recording-row">
              {#if r.kind === 'stored'}
                <VoicePlayer fileName={r.recording.fileName} />
              {:else}
                <VoicePlayer bytes={r.bytes} />
              {/if}
              <button class="recording-remove press" aria-label={m.recording_remove()} onclick={() => entryDraft.removeRecording(i)}>
                <Icon name="x" size={16} />
              </button>
            </div>
          {/each}
        </div>
      {/if}
      <div class="photo-row">
        <button class="photo-add press" aria-label={activeRecording ? m.stop_recording() : m.add_recording()} onclick={toggleRecording}>
          <Icon name={activeRecording ? 'stop' : 'mic'} size={22} />
          <span>{activeRecording ? m.stop_recording() : m.add_recording()}</span>
        </button>
        <button class="photo-add press" data-add-recording-file aria-label={m.add_recording_file()} onclick={addRecordingFile}>
          <Icon name="image" size={22} /><span>{m.add_recording_file()}</span>
        </button>
      </div>
    </section>

    <section class="editor-media-group">
      <h3 class="editor-media-label">{m.videos_label()}</h3>
      {#if entryDraft.videos.length > 0}
        <div class="recording-list">
          {#each entryDraft.videos as v, i (v)}
            <div class="video-row">
              {#if v.kind === 'stored'}
                <VideoNotePlayer fileName={v.video.fileName} />
              {:else}
                <VideoNotePlayer bytes={v.bytes} />
              {/if}
              <button class="recording-remove press" aria-label={m.video_remove()} onclick={() => entryDraft.removeVideo(i)}>
                <Icon name="x" size={16} />
              </button>
            </div>
          {/each}
        </div>
      {/if}
      {#if activeVideo}
        <div class="video-preview">
          <!-- Muted: routing the microphone back to the speaker would howl. -->
          <!-- svelte-ignore a11y_media_has_caption -->
          <video use:previewStream={activeVideo.stream} muted autoplay playsinline></video>
          <span class="video-countdown">0:{videoSecondsLeft.toString().padStart(2, '0')}</span>
        </div>
      {:else if compressingVideo}
        <p class="video-hint">{m.video_compressing()}</p>
      {:else}
        <p class="video-hint">{m.video_recording_hint()}</p>
      {/if}
      <div class="photo-row">
        <button
          class="photo-add press"
          disabled={compressingVideo}
          aria-label={activeVideo ? m.stop_video() : m.add_video()}
          onclick={toggleVideo}
        >
          <Icon name={activeVideo ? 'stop' : 'video'} size={22} />
          <span>{activeVideo ? m.stop_video() : m.add_video()}</span>
        </button>
        <button
          class="photo-add press"
          data-add-video-file
          disabled={compressingVideo || !!activeVideo}
          aria-label={m.add_video_file()}
          onclick={addVideoFile}
        >
          <Icon name="image" size={22} /><span>{m.add_video_file()}</span>
        </button>
      </div>
    </section>
  </div>

  <div class="editor-savebar">
    <button class="btn btn-primary" data-save disabled={saving} onclick={saveEntry}>
      <Icon name="check" size={20} /><span>{m.save_entry()}</span>
    </button>
  </div>
  {/if}

  <Sheet bind:open={templateSheetOpen} title={m.use_template()}>
    <SectionHeading text={m.use_template()} />
    <ListCard {role}>
      {#each vocabulary.entryTemplates as tpl (tpl.key)}
        <ListRow key={tpl.key} title={tpl.name} chevron={false} onclick={() => applyTemplate(tpl)} />
      {/each}
    </ListCard>
  </Sheet>

  <Sheet bind:open={deleteOpen} title={m.delete_entry_q()}>
    <SectionHeading text={m.delete_entry_q()} />
    <p class="editor-hint">{m.delete_entry_hint()}</p>
    <div class="stack-3">
      <button class="btn btn-danger" onclick={confirmDelete}><span>{m.delete_entry()}</span></button>
      <button class="btn btn-ghost" onclick={() => (deleteOpen = false)}><span>{m.keep_it()}</span></button>
    </div>
  </Sheet>

  <PhotoAlignmentReview
    photo={entryPhotoReview.photo}
    reference={entryPhotoReview.reference}
    onAccept={entryPhotoReview.accept}
    onRetake={entryPhotoReview.capture}
    onCancel={entryPhotoReview.cancel}
  />
</div>

<style>
  /* The container transform's own layer - a plain fill behind the real
     screen, carrying no text, the same fix as .entry-card-bg/.kit-entry-bg
     in components.css/kit.css. Those two sit inside a grid container, where
     an absolutely positioned sibling and the plain grid items around it
     share one paint layer and fall back to DOM order - bg first, content on
     top, no z-index needed. `.screen` here is plain block layout, so its
     static children never leave the layer below a positioned box; without
     help this fill painted over every heading, slider and pill in the
     screen instead of behind them. `isolation: isolate` scopes the fix to
     this screen alone rather than reordering anything outside it. */
  .screen.editor {
    isolation: isolate;
  }
  .editor-bg {
    position: absolute; inset: 0;
    z-index: -1;
    background: var(--bg);
  }
  .editor-date { color: var(--text-2); font-size: var(--text-sm); margin: calc(-1 * var(--space-2)) 0 var(--space-4); }

  /* The line under a heading that needs one. A hint is the area's own second
     sentence rather than a caption on a field, so it sits at the page's
     left edge with the controls under it, and it is the same --text-2 the
     date line above uses. */
  .editor-hint {
    color: var(--text-2);
    font-size: var(--text-sm);
    margin: 0 0 var(--space-3);
  }
  /* Under a slider rather than under a heading: it belongs to the control
     above it, so it closes up against it. */
  .editor-hint-tight { margin: calc(-1 * var(--space-2)) 0 var(--space-3); }

  .editor-note {
    width: 100%;
    resize: vertical;
    font-family: var(--font-body);
  }

  /* Everything an entry carries besides its words, on one surface (phase 5
     ticket 22). Three headed cards in a row were half the editor's length and
     said the same thing three times; this is one area with three labelled
     groups, separated by the same hairline a list card puts between its rows.

     Uncoloured on purpose. Every other area of every other screen takes a
     flag stripe, and this one is full of photographs and waveforms that bring
     their own colour - a tinted ground behind a photo grid is a tint behind a
     photograph. */
  .editor-media {
    background: var(--surface);
    border: 1px solid var(--outline);
    border-radius: var(--r-card);
    overflow: hidden;
  }
  .editor-media-group { padding: var(--space-4); }
  .editor-media-group + .editor-media-group { border-top: 1px solid var(--outline); }
  .editor-media-label {
    font-size: var(--text-xs);
    font-weight: var(--weight-bold);
    letter-spacing: 0.04em;
    color: var(--text-2);
    margin: 0 0 var(--space-3);
  }

  /* Same 44px-touch-target/24px-badge shape as .photo-remove (screens.css),
     opposite corner so the two never collide. */
  .photo-star {
    position: absolute; bottom: -16px; left: -16px;
    width: var(--touch-target); height: var(--touch-target);
    border: none; cursor: pointer;
    background: none; color: var(--bg);
    display: flex; align-items: center; justify-content: center;
  }
  .photo-star::before {
    content: '';
    position: absolute; inset: 0; margin: auto;
    width: 24px; height: 24px; border-radius: 50%;
    background: var(--text);
  }
  .photo-star :global(.icon) { position: relative; }
  .photo-star.is-starred { color: var(--accent); }

  /* A recording plays back at native <audio> width, not a 72px tile, so it
     gets its own row rather than photo-row/photo-wrap's fixed square
     (screens.css). */
  .recording-list { display: flex; flex-direction: column; gap: var(--space-2); margin-bottom: var(--space-3); }
  .recording-row { display: flex; align-items: center; gap: var(--space-2); }
  .recording-remove {
    flex-shrink: 0;
    width: var(--touch-target); height: var(--touch-target);
    border: none; cursor: pointer;
    background: none; color: var(--text-2);
    display: flex; align-items: center; justify-content: center;
  }

  /* A video note is taller than an <audio> transport, so its remove button sits
     at the top of the row rather than centred against a 36px strip (ticket 22).
     The list wrapper is .recording-list either way - the gap and the column are
     the same, and a second class with the same rules would only drift. */
  .video-row { display: flex; align-items: flex-start; gap: var(--space-2); }
  .video-hint { margin: 0 0 var(--space-3); color: var(--text-2); font-size: 0.85rem; }
  .video-preview { position: relative; margin-bottom: var(--space-3); }
  .video-preview video {
    /* Mirrored, because a preview of your own face that moves the wrong way
       when you do is disorienting. The recording itself is not flipped - only
       what the person sees while framing it. Sizing and background are
       screens.css's .video-note-player, .video-preview video rule, shared
       with VideoNotePlayer.svelte's own stored-note box on purpose - two
       rules for one shape would only drift. */
    transform: scaleX(-1);
  }
  .video-countdown {
    position: absolute; top: var(--space-2); right: var(--space-2);
    padding: 2px 8px; border-radius: var(--radius-pill);
    background: rgb(0 0 0 / 0.6); color: #fff;
    font-size: 0.8rem; font-variant-numeric: tabular-nums;
  }
</style>
