<script lang="ts">
  import { page } from '$app/state';
  import SourceRecordHandoff from '$lib/components/SourceRecordHandoff.svelte';
  import { sourceReturnTo } from '$lib/navigation/sourceRecord';
  import { smartBack } from '$lib/navigation/smart-back';
  import { rovingRadio } from '$lib/components/rovingRadio';
  import { onDestroy, tick } from 'svelte';
  import { goto } from '$app/navigation';
  import { m } from '$lib/paraglide/messages';
  import {
    todayEpochDay,
    epochDayMonthsAgo,
    epochDayFromDateInputValue,
    dateInputValueFromEpochDay
  } from '$lib/data/epochDay';
  import { fmtDay, fmtTime } from '$lib/data/dates';
  import { journal, liveQuery, onFirstResult } from '$lib/data/live/journal.svelte';
  import { ui } from '$lib/stores/ui.svelte';
  import { createEntryDraft, type EntryDraft } from '$lib/data/entryDraft';
  import { ENTRY_SECTIONS, sectionState, type EntrySection } from '$lib/data/entrySections';
  import { isReducedMotion } from '$lib/motion/tokens';
  import { debriefListItems } from '$lib/data/journal/debriefNote';
  import { roomAnswersFor } from '$lib/stores/inTheRoom';
  import { applyPersistedDraft, draftMatchesRoute, serializeDraft } from '$lib/data/entryDraftPersistence';
  import { localStorageEntryDraft } from '$lib/data/entryDraftStore';
  import { journalDataKey } from '$lib/stores/boot.svelte';
  import { activeEpisodesAt } from '$lib/data/regimenEpisode';
  import { matchDoseRoute } from '$lib/data/doseSchedule';
  import { stockRemainingLabel } from '$lib/data/vocabulary/stockLabel';
  import { startOfDayTimestamp } from '$lib/data/epochDay';
  import { cycleTrackingVisible } from '$lib/data/cycleTracking';
  import { areaQuiet } from '$lib/data/areaState';
  import type { NormalizedPhoto } from '$lib/data/journal/photos';
  import { pickPhotos, type ReferencePhoto } from '$lib/stores/photoPicking';
  import { photoReview } from '$lib/stores/photoReview.svelte';
  import { pickRecording, startRecording, type ActiveRecording } from '$lib/stores/voiceRecording';
  import { pickVideo, startVideoRecording, type ActiveVideoRecording } from '$lib/stores/videoRecording';
  import { VIDEO_MAX_DURATION_MS } from '$lib/data/videoNotes/limits';
  import { prefs } from '$lib/data/prefs/store.svelte';
  import { toast } from '$lib/stores/toasts.svelte';
  import type { EntryTemplate, GenderDimension } from '$lib/data/types';
  import { activeFlag } from '$lib/theme/activeFlag.svelte';
  import { roleAt } from '$lib/theme/roles';
  import { roleAttrs } from '$lib/components/kit/role';
  import { entryContainerName } from '$lib/motion/container.svelte';
  import Icon from '$lib/components/Icon.svelte';
  import ScreenHeader from '$lib/components/ScreenHeader.svelte';
  import Field from '$lib/components/kit/Field.svelte';
  import PhotoDayPromptSheet from '$lib/components/kit/PhotoDayPromptSheet.svelte';
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
  import PhotoViewer from '$lib/components/PhotoViewer.svelte';
  import VoicePlayer from '$lib/components/VoicePlayer.svelte';
  import VideoNotePlayer from '$lib/components/VideoNotePlayer.svelte';
  import Sheet from '$lib/components/Sheet.svelte';
  import DatePicker from '$lib/components/DatePicker.svelte';
  import Skeleton from '$lib/components/Skeleton.svelte';
  import SaveBar from '$lib/components/SaveBar.svelte';
  import { collapse, disclose } from '$lib/motion/reveal';
  import { vocabulary } from '$lib/data/vocabulary/vocabulary';
  import { effectCategoryName } from '$lib/data/vocabulary/labels';

  let {
    epochDay,
    entryId,
    seedMood,
    debriefForAppointment
  }: {
    epochDay?: number;
    entryId?: number;
    seedMood?: number | null;
    /** The appointment this new entry debriefs, by id (phase 6 ticket 08,
        rekeyed from a date by ticket 58), arriving as a query param the
        same way `seedMood` does. Applies the hidden `appointment_debrief`
        template once on mount and links the saved entry back to the
        appointment in the same transaction - never on an edit
        of an existing entry, the same "creation aid, not an editing one"
        rule the prompt and the template sheet already follow. */
    debriefForAppointment?: string;
  } = $props();

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
     case - this only ever restores after a real process death.

     What is written there is ciphertext under the open journal's data key
     (sec-audit 02), which makes both halves async. */
  const draftStore = localStorageEntryDraft(journalDataKey);

  /* Nothing is mirrored until the first read has been attempted: the write
     effect below would otherwise fire on mount and put the empty draft over
     the very snapshot this is about to restore. */
  let mirrorRead = $state(false);

  async function restoreIfPersisted(target: EntryDraft) {
    try {
      const persisted = await draftStore.read();
      if (!persisted) return;
      if (draftMatchesRoute(persisted, entryId, target.epochDay)) applyPersistedDraft(target, persisted);
      else draftStore.clear(); // a different editor's leftovers - not this one's to resume
    } finally {
      mirrorRead = true;
    }
  }

  // svelte-ignore state_referenced_locally
  const persistedRestore = restoreIfPersisted(entryDraft);

  onFirstResult(loaded, async (entry) => {
    if (!entry) return;
    const fresh = createEntryDraft(entry.epochDay, entry);
    await restoreIfPersisted(fresh);
    entryDraft = fresh;
    starred = entry.starred;
  });

  /* Curation metadata (CONTEXT: "Starred"), read once like the rest of
     `existing` and kept in its own local state rather than `entryDraft`:
     starring an existing entry is its own mutation (setEntryStarred), and
     `loaded`'s deliberately empty table list (see
     above) means it will not refresh itself from elsewhere either.

     A new entry has no id to write `setEntryStarred` against yet, so
     toggling one before the first save only flips this local flag - ticket
     18's "starred before it is saved". The journal includes that flag in
     the creation transaction. An existing entry keeps writing
     immediately, the same as it always has. */
  let starred = $state(false);

  async function toggleStarred() {
    const next = !starred;
    starred = next;
    if (!existing) return;
    await journal.entries.setEntryStarred(existing.id, next);
  }

  /* A day chosen to see this entry again (phase 8 features ticket 08,
     ADR-0045). Its own live query rather than folded into `loaded`: a
     revisit is a separate record, and reading it only while the sheet is
     open would show a stale "not set" state the moment somebody reopens it
     after setting one on another device. */
  let revisitOpen = $state(false);
  let revisitQuery = liveQuery((j) =>
    entryId != null ? j.revisits.getRevisitForEntry(entryId) : Promise.resolve(null)
  );
  let revisit = $derived(revisitQuery.value);
  let revisitDateInput = $state('');

  const revisitPresetDay = (preset: 'week' | 'month' | 'threeMonths' | 'year'): number => {
    const today = todayEpochDay();
    switch (preset) {
      case 'week':
        return today + 7;
      /* epochDayMonthsAgo's own clamping (31 Oct minus a month lands on 30
         Sep, not a 1 Nov rollover) is exactly what a revisit's own presets
         need going forward too, and negating `months` gives it that
         direction: the function subtracts `months` from the total month
         count, so a negative count adds. Every other caller only ever
         passes a positive count looking backward - this is the one call
         site that runs it the other way on purpose. */
      case 'month':
        return epochDayMonthsAgo(today, -1);
      case 'threeMonths':
        return epochDayMonthsAgo(today, -3);
      case 'year':
        return epochDayMonthsAgo(today, -12);
    }
  };

  async function setRevisit(targetEpochDay: number) {
    if (entryId == null) return;
    await journal.revisits.setRevisit({ entryId, createdEpochDay: todayEpochDay(), targetEpochDay });
    revisitDateInput = '';
    revisitOpen = false;
  }

  async function setRevisitFromInput() {
    const targetEpochDay = epochDayFromDateInputValue(revisitDateInput);
    if (targetEpochDay == null) return;
    await setRevisit(targetEpochDay);
  }

  async function cancelRevisit() {
    if (!revisit) return;
    await journal.revisits.deleteRevisit(revisit.id);
    revisitOpen = false;
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
    if (entryDraft.savedId !== undefined) return;
    const snapshot = serializeDraft(entryDraft);
    if (!mirrorRead) return;
    void draftStore.write(snapshot);
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
     fresh prompt, never a stale one left over from a previous mount. A
     prompt is a template whose only content is a note scaffold (ticket 07);
     `randomPrompt()` can now come back null once every one has been
     hidden. */
  // svelte-ignore state_referenced_locally
  let prompt = $state<EntryTemplate | null>(
    entryId == null && prefs.guidedPromptsEnabled ? vocabulary.randomPrompt() : null
  );

  /* A template only ever pre-fills what this install currently shows -
     a hidden dimension, tag or presentation stays out of the draft even if
     the template names it, because the picker that would let someone edit
     it back off is exactly what `hidden` took out of the editor (CONTEXT:
     "Hidden"). Applying the same template twice cannot double up:
     applyTemplate() unions the tags and overwrites the dims by key. */
  function applyTemplate(tpl: EntryTemplate) {
    const visibleTagIds = new Set(vocabulary.visibleTagGroups.flatMap((g) => g.tags.map((t) => t.id)));
    const visibleDimKeys = new Set(vocabulary.visibleDimensions.map((d) => d.key));
    const visiblePresentationIds = new Set(vocabulary.visiblePresentations.map((p) => p.id));
    entryDraft.applyTemplate({
      ...tpl,
      tags: tpl.tags.filter((id) => visibleTagIds.has(id)),
      dims: Object.fromEntries(Object.entries(tpl.dims).filter(([key]) => visibleDimKeys.has(key))),
      presentationId: tpl.presentationId && visiblePresentationIds.has(tpl.presentationId) ? tpl.presentationId : null
    });
    templateSheetOpen = false;
  }

  /* The debrief offer's deep link (phase 6 ticket 08): applied once, the
     same "read once at mount" rule `prompt` above follows, and only for a
     new entry - taking the offer never reaches an existing one. Looked up
     against the full list rather than `visibleEntryTemplates`, because the
     template seeds hidden by design (builtins.ts) and the offer is the one
     path that reaches it regardless. Silently does nothing if the built-in
     has gone missing somehow (deleted from the archive by hand, say) -
     the entry still opens as a blank one rather than failing to load. */
  // svelte-ignore state_referenced_locally
  if (entryId == null && debriefForAppointment != null) {
    const debriefTemplate = vocabulary.entryTemplates.find((t) => t.id === 'appointment_debrief');
    if (debriefTemplate) applyTemplate(debriefTemplate);
    void fillDebriefPrefill(debriefForAppointment);
  }

  /* What the debrief opens pre-filled with, under its "How did it go?"
     scaffold: what the person jotted in the room, then the descriptive list
     of labs and side effects since the visit.

     THE ROOM'S ANSWERS FIRST (phase 8 features ticket 60), because they are
     the person's own words and the list under them is context. Each one is
     printed under the question it was typed against - that pairing is the
     whole reason the room asks per question rather than offering one free
     note (answeredQuestions, debriefNote.ts). They arrive from module state
     (stores/inTheRoom.ts) rather than from the journal, since ticket 60
     adds no record: read here, non-destructively, so discarding this entry
     and taking the offer again pre-fills the same words a second time.

     THE LIST (ticket 19, What to Build #2): the same range and the same two
     reads the appointment prep screen's own "since last time" cards already
     use (readLabResultsInRange, sideEffects's own getSideEffectsInRange) -
     not a new read, the range that ticket added asked of the pair that
     already answers it. debriefListItems merges and sorts them Node-tier,
     free of paraglide; the date on each line and the join are here, the
     same split every other wording split in this app follows (ADR-0016).

     Both sections go on in one write, past one guard: the note is appended
     to only while it still reads exactly as applyTemplate left it. A
     restored process-death draft, or the person having already started
     typing, both mean there is something here that is not this function's
     to overwrite - the offer "does not write" (ticket 19's own line), read
     as "does not clobber" too. With nothing on either side there is nothing
     to append; a blank line under a one-line prompt is not a list.

     Takes the appointment's id (ticket 58) and resolves its own day first,
     since the range the list wants starts there, not at some day the caller
     already knew. An id the journal no longer holds costs the list, not the
     answers: the room's own words are held against that id and are still
     the person's, which is the "offer a blank entry rather than a broken
     one" rule read the generous way round. */
  async function fillDebriefPrefill(appointmentId: string) {
    // Awaited first, deterministically: a restored process-death draft is
    // the person's own unsaved work and always wins the race against this
    // function's own two reads, rather than whichever happens to resolve
    // last.
    await persistedRestore;
    const { readLabResultsInRange } = await import('$lib/data/journal/clinicianSummary');
    const appointment = await journal.appointments.getAppointment(appointmentId);
    const [labs, sideEffects] = appointment
      ? await Promise.all([
          readLabResultsInRange(journal.labs, appointment.epochDay, todayEpochDay()),
          journal.sideEffects.getSideEffectsInRange(appointment.epochDay, todayEpochDay())
        ])
      : [[], []];
    const items = debriefListItems(labs, sideEffects);
    const answers = roomAnswersFor(appointmentId);
    if (!items.length && !answers.length) return;
    if (entryDraft.note !== m.prompt_appointment_debrief()) return;

    const sections: string[] = [];
    if (answers.length) {
      const pairs = answers.map((pair) => `${pair.question}\n${pair.answer}`);
      sections.push(`${m.debrief_room_heading()}\n${pairs.join('\n\n')}`);
    }
    if (items.length) {
      const lines = items.map(
        (item) => `${fmtDay(item.epochDay, { day: 'numeric', month: 'short', year: 'numeric' })}: ${item.text}`
      );
      sections.push(`${m.debrief_since_heading()}\n${lines.join('\n')}`);
    }
    entryDraft.setNote([entryDraft.note, ...sections].join('\n\n'));
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

  /* The chip row and the section it opens (phase 11 ticket 19). The note
     is the focus target on a new entry: the screen opens on the page, with
     the keyboard up, the way the two references do (Mobbin: Journal, Liven).
     `preventScroll` because the screen is arriving through the container
     transform and a focus scroll during it would fight the frame. An
     existing entry is read before it is written, so it opens unfocused. */
  let noteEl = $state<HTMLTextAreaElement | undefined>();
  let chipRowEl = $state<HTMLElement | undefined>();
  let moodsEl = $state<HTMLElement | undefined>();

  $effect(() => {
    if (entryId == null && noteEl) noteEl.focus({ preventScroll: true });
  });

  function sectionName(section: EntrySection): string {
    switch (section) {
      case 'tags':
        return m.tags_label();
      case 'body':
        return m.body_map_label();
      case 'photos':
        return m.photos_label();
      case 'voice':
        return m.entry_chip_voice();
      case 'video':
        return m.entry_chip_video();
    }
  }

  /* A second tap on the open chip closes it; a tap on another chip swaps
     the section. The open chip is draft state (entryDraft.ts), so the
     process-death mirror carries it. */
  async function toggleSection(section: EntrySection) {
    const opening = entryDraft.openSection !== section;
    entryDraft.setOpenSection(opening ? section : null);
    if (!opening) return;
    await tick();
    revealSection(section);
  }

  /* Brings the opened section into view on the same clock it discloses
     on: the scroll region moves by however much of the section's settled
     height would land under the foot, and never so far that the chip row
     itself leaves the top of the window - the row is what the person just
     tapped, and a section that scrolled its own chip away would be a
     section with no visible way to close it. `scrollHeight` is the
     section's content height even while `disclose` still clips its box,
     which is what makes the settled height readable on the first frame. */
  function revealSection(section: EntrySection) {
    const sectionEl = chipRowEl?.parentElement?.querySelector<HTMLElement>(`[data-editor-section="${section}"]`);
    const region = chipRowEl?.closest<HTMLElement>('[data-app-scroll-region]');
    if (!sectionEl || !region || !chipRowEl) return;
    const regionBox = region.getBoundingClientRect();
    const settledBottom = sectionEl.getBoundingClientRect().top + sectionEl.scrollHeight;
    const overflow = settledBottom + 20 - regionBox.bottom;
    if (overflow <= 0) return;
    const rowRoom = chipRowEl.getBoundingClientRect().top - regionBox.top - 8;
    const travel = Math.min(overflow, rowRoom);
    if (travel <= 0) return;
    region.scrollBy({ top: travel, behavior: isReducedMotion() ? 'auto' : 'smooth' });
  }

  /* Contextual Inline Cards (ticket 04, ADR-0044) */
  let tryoutsQuery = liveQuery((j) => j.tryouts.getTryouts());
  let activeTryout = $derived(
    (tryoutsQuery.value ?? []).find((t) => t.endEpochDay == null && (t.kind === 'name' || t.kind === 'pronouns'))
  );

  let episodesQuery = liveQuery((j) => j.regimen.getEpisodes());
  let activeEpisodes = $derived(
    episodesQuery.value ? activeEpisodesAt(episodesQuery.value, startOfDayTimestamp(day)) : []
  );

  let todayDosesQuery = liveQuery((j) => j.doses.getDoses(day, day));
  let loggedDoseDrugs = $derived(
    new Set((todayDosesQuery.value ?? []).map((d) => d.drug?.toLowerCase().trim()).filter(Boolean))
  );

  let dueScheduledDoses = $derived.by(() => {
    if (!activeEpisodes) return [];
    return activeEpisodes
      .filter((ep) => ep.dose != null && ep.dose > 0 && !loggedDoseDrugs.has(ep.drug.toLowerCase().trim()))
      .map((ep) => ({
        episodeId: ep.id,
        dose: ep.dose!,
        doseUnit: ep.doseUnit,
        drug: ep.drug,
        route: matchDoseRoute(ep.route ?? '', []) ?? undefined
      }));
  });

  let scheduleDose = $derived(dueScheduledDoses[0] ?? null);

  /** Stock as of this entry's own day (phase 5 deepening ticket 06), not
      today's - an entry backdated to a day before a re-count would otherwise
      state a remaining figure the count hadn't reached yet. Read here only
      to say what a quick-logged dose leaves; nothing writes to it
      (ADR-0046). */
  let stockQuery = liveQuery((j) => j.stock.getProjections(day));
  let stockRows = $derived(stockQuery.value ?? []);
  /** Exact trimmed match, the same rule drugsMatch (stockProjection.ts) uses. */
  const stockFor = (drug: string) => stockRows.find((row) => row.entry.drug.trim() === drug.trim()) ?? null;

  let proceduresQuery = liveQuery((j) => j.procedures.getProcedures());
  let recoveringProcedure = $derived.by(() => {
    if (!proceduresQuery.value) return null;
    for (const proc of proceduresQuery.value) {
      if (proc.surgeryEpochDay != null) {
        const postOpDays = day - proc.surgeryEpochDay;
        if (postOpDays >= 1 && postOpDays <= 90) return { proc, postOpDays };
      }
    }
    return null;
  });

  let isHrtActive = $derived(activeEpisodes.length > 0);

  /* ADR-0043's gate, asked rather than re-derived (phase 8 features ticket
     04). This screen read `prefs.cycleTrackingEnabled` directly, which is the
     one surface of three that did - so somebody on a testosterone regimen who
     never flipped the switch got the More row and the side-effects section
     and not this, which is the reader the automatic half of the rule exists
     for.

     `Date.now()` and not this entry's own day, which is what the other two
     surfaces pass: the question is whether cycle tracking is surfaced for
     this person, not whether it was surfaced on a day they are backdating
     to. A regimen that has since ended does not take the chips off an entry
     written last spring. */
  let cycleTrackingActive = $derived(
    cycleTrackingVisible(episodesQuery.value ?? [], Date.now(), prefs.cycleTrackingEnabled)
  );

  /* The cascade (phase 8 features ticket 04, ADR-0052). The effects chip is
     the one prompt on this screen that belongs to a finishable area, so it is
     the one that goes quiet when that area does. Read against today rather
     than against `day`: an area somebody is done with is done with now, and a
     backdated entry is not a way back into a prompt they switched off.

     `areaQuiet` by hand rather than `unpromptedQuiet`, which is the seam the
     tiles and the notifications go through. This screen's four contextual
     cards are not in `unprompted/registry.ts` at all - they are their own
     `entry*Enabled` preferences, and a registry whose two views draw live
     tiles and notifications has no row shape for a chip inside the editor.
     So the gate is named here, and `EntryEditor.gates.test.ts` pins that this
     is the only card on this screen belonging to an area that can be
     finished, which is what keeps the hand-wiring honest. Folding the
     editor's cards into that registry would give the next one the cascade for
     free and is worth its own ticket. */
  let areaStatesQuery = liveQuery((j) => j.areaStates.getAreaStates());
  let effectsQuiet = $derived(areaQuiet('personalEffects', areaStatesQuery.value ?? {}, todayEpochDay()));

  let tryoutReflection = $state('');
  let procRecoveryNote = $state('');
  let procRecoveryPhoto = $state<NormalizedPhoto | null>(null);
  let effectSheetOpen = $state(false);

  $effect(() => {
    if (entryDraft.tryoutFeltSense?.note !== undefined && entryDraft.tryoutFeltSense?.note !== null) {
      tryoutReflection = entryDraft.tryoutFeltSense.note;
    }
    if (entryDraft.procedureRecovery?.notes !== undefined && entryDraft.procedureRecovery?.notes !== null) {
      procRecoveryNote = entryDraft.procedureRecovery.notes;
    }
    if (entryDraft.procedureRecovery?.photo) {
      procRecoveryPhoto = entryDraft.procedureRecovery.photo;
    }
  });


  function updateProcedureRecovery() {
    if (!recoveringProcedure) return;
    const notes = procRecoveryNote.trim() || entryDraft.procedureRecovery?.notes;
    if (!notes && !procRecoveryPhoto) {
      entryDraft.setProcedureRecovery(null);
    } else {
      entryDraft.setProcedureRecovery({
        procedureId: recoveringProcedure.proc.id,
        notes: notes || undefined,
        photo: procRecoveryPhoto ?? undefined
      });
    }
  }

  /* The day-prompt queue (ticket 47, ADR-0008/0015): every picked or
     captured photo is normalized before it reaches the draft, and
     normalizing always strips whatever date the file carried, so each one
     gets asked for a day before it lands. A queue rather than a single
     pending photo because pickPhotos() can bring back several at once
     (photoPicking.ts) - each is asked in turn, oldest first, so none is
     silently dropped by the next one overwriting `dayPromptQueue[0]`
     before it resolves. */
  let dayPromptQueue = $state<NormalizedPhoto[]>([]);
  let dayPromptValue = $state('');

  function queueForDayPrompt(photos: NormalizedPhoto[]) {
    const wasEmpty = dayPromptQueue.length === 0;
    dayPromptQueue = [...dayPromptQueue, ...photos];
    if (wasEmpty && dayPromptQueue.length) dayPromptValue = dateInputValueFromEpochDay(entryDraft.epochDay);
  }

  // Skipping (day === null) leaves the override unset, exactly as before
  // this ticket: the photo inherits this entry's day, same as always.
  function resolveDayPrompt(day: string | null) {
    const [photo, ...rest] = dayPromptQueue;
    if (!photo) return;
    entryDraft.addPhoto({ ...photo, epochDayOverride: day ? epochDayFromDateInputValue(day) : null });
    dayPromptQueue = rest;
    if (rest.length) dayPromptValue = dateInputValueFromEpochDay(entryDraft.epochDay);
  }

  // An entry holds several photos, so one trip through the picker can bring
  // back several (photoPicking.ts).
  async function addPhoto() {
    queueForDayPrompt(await pickPhotos());
  }

  // The context is this entry: the last photo already in its own draft,
  // stored or just picked, not the journal's last photo overall.
  function lastDraftPhotoReference(): ReferencePhoto | null {
    const last = entryDraft.photos[entryDraft.photos.length - 1];
    if (!last) return null;
    if (last.kind === 'picked') return { bytes: last.photo.full };
    return last.photo.fileName ? { fileName: last.photo.fileName } : null;
  }

  const entryPhotoReview = photoReview(lastDraftPhotoReference, (photo) => queueForDayPrompt([photo]));

  // The photo tapped to open the viewer (ticket CARPET-06); null keeps it
  // closed.
  let viewedPhoto = $state<{ fileName: string | null; bytes?: Uint8Array } | null>(null);

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
  let savedDestination = $state('/');
  let navigationFailed = $state(false);

  async function leaveSavedEntry() {
    try {
      const returnTo = sourceReturnTo(page.url);
      if (returnTo) smartBack(returnTo);
      else await goto(savedDestination);
      return true;
    } catch (error) {
      console.error('could not navigate after saving the entry', error);
      navigationFailed = true;
      await tick();
      document.querySelector<HTMLAnchorElement>('[data-entry-saved] a')?.focus();
      return false;
    }
  }

  async function saveEntry() {
    if (entryDraft.savedId !== undefined) {
      await leaveSavedEntry();
      return;
    }
    /* The requirement is on the button's own label while it is unmet
       ("Pick a mood to save"), so a tap here fires no toast: it hands the
       focus to the faces, which are on the same bar, and that is the whole
       answer. The toast's own string (entry_needs_mood) had no caller left
       and is gone from both catalogues. */
    if (moodMissing) {
      moodsEl?.querySelector<HTMLElement>('[data-mood]')?.focus();
      return;
    }
    if (saving) return; // a second tap while the worker is writing
    saving = true;
    const moodOnly = entryDraft.hasMoodOnlyContent;
    const offerDims = seedMood != null && moodOnly && vocabulary.activeDimensions.length > 0;
    let id: number;
    try {
      id = await entryDraft.save(journal.entries, { starred, debriefForAppointment });
    } catch (error) {
      console.error('could not save the entry', error);
      toast(m.entry_save_failed());
      return;
    } finally {
      saving = false;
    }
    draftStore.clear();
    savedDestination = sourceReturnTo(page.url) ?? (offerDims ? `/?quickLogDims=${id}` : '/');
    if (!await leaveSavedEntry()) return;
    if (!offerDims && prefs.entryNudges && moodOnly) {
      toast(m.saved(), { actionLabel: m.add_details(), onAction: () => goto(`/entry/${id}`), kind: 'saved' });
    } else {
      toast(m.saved(), { kind: 'saved' });
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
       as the href the header falls back to on a deep link or a reload
       (NAV-005, CARPET-05). -->
  <ScreenHeader
    title={entryId != null ? m.entry() : m.new_entry()}
    screen="entry"
    back={existing ? `/day/${day}` : '/'}
  >
    {#snippet actions()}
      {#if existing && entryDraft.savedId === undefined}
        <!-- The star left this header for the save bar (ticket 18): a new
             entry can be starred before it exists, which this header
             cannot offer since it is only drawn `{#if existing}`. -->
        <button
          class="icon-btn press"
          aria-label={m.revisit_open_aria()}
          aria-pressed={!!revisit}
          data-revisit-open
          onclick={() => (revisitOpen = true)}
        >
          <!-- Recoloured rather than filled: components.css's `is-starred`
               fills the whole shape, which reads fine for a star's single
               closed path but turns a clock's circle-plus-hand into an
               unreadable solid disc, the hand's stroke lost against its
               own fill. `.revisit-set` below is `.photo-star.is-starred`'s
               own recolour-not-fill answer to the same problem, applied to
               this icon instead of a wrapping button. -->
          <Icon name="clock" size={20} cls={revisit ? 'revisit-set' : ''} />
        </button>
        <button class="icon-btn press" aria-label={m.delete_entry()} onclick={() => (deleteOpen = true)}>
          <Icon name="trash" size={20} />
        </button>
      {/if}
    {/snippet}
  </ScreenHeader>
  <SourceRecordHandoff id={entryId == null ? null : String(entryId)} ready={!loaded.loading && !loaded.failed} found={!!existing} />

  <p class="editor-date">
    {isToday ? `${m.today()} · ` : ''}{fmtDay(day, { weekday: 'long', day: 'numeric', month: 'long' })}{existing ? ` · ${fmtTime(existing.timestamp)}` : ''}
  </p>

  {#if entryDraft.savedId !== undefined}
    <Notice
      key="entry-saved"
      data-entry-saved
      {role}
      title={m.saved()}
      text={navigationFailed ? m.entry_saved_navigation_failed() : undefined}
      action={{ label: m.entry_saved_continue(), href: savedDestination, primary: true }}
      aria-live="polite"
    />
  {:else}
  {#if prompt && !promptDismissed}
    <Notice
      icon="sparkle"
      key="entry-prompt"
      {role}
      text={prompt.noteScaffold}
      dismiss={{ label: m.dismiss(), onclick: () => (promptDismissed = true) }}
      aria-live="polite"
    />
  {/if}

  {#if entryId == null}
    <button class="btn btn-ghost" data-use-template onclick={() => (templateSheetOpen = true)}>
      <Icon name="sparkle" size={18} /><span>{m.use_template()}</span>
    </button>
  {/if}

  <!-- Wait for the existing entry before showing its draft. -->
  {#if loaded.failed}
    <Notice key="entry-read" title={m.read_failed()} action={{ label: m.read_retry(), onclick: () => loaded.retry() }} />
  {/if}
  {#if loaded.loading}
    <Skeleton variant="block" count={3} />
  {:else if entryId == null || existing}
  <!-- The page first (phase 11 ticket 19). The note used to sit under mood,
       mode, two sliders and thirty tag chips - about 1900px down on the
       audit's render - and the save was gated on the mood picker three
       viewports above the Save button. What a journal is for comes first
       now, grown to its text; every structured question is one tap away
       in the chip row under it; mood is asked where the saving happens.
       Nothing about what an entry records changed (CONTEXT: "Entry"). -->
  <textarea
    class="input editor-note"
    id="ed-note"
    name="note"
    rows="4"
    placeholder={m.note_placeholder()}
    bind:this={noteEl}
    bind:value={entryDraft.note}
  ></textarea>

  <!-- Mode and Gender stay open on the page (Alicja, on the spike,
       17 September 2026: "some of the sections should be always-on, for
       example gender and mode"). They keep the headings and the "manage"
       and "change" links redesign ticket 51 gave them. -->
  {#if vocabulary.visiblePresentations.length > 0}
    <SectionHeading text={m.presentation_label()}>
      {#snippet action()}
        <!-- In place (audit item 6): raises the same sheet Settings' own
             Tracking row opens, rather than navigating there and back. -->
        <button
          type="button"
          class="kit-heading-action"
          data-manage-presentations
          onclick={() => (ui.raisedManager = 'modes')}
        >
          {m.presentations_manage()}
        </button>
      {/snippet}
    </SectionHeading>
    <div class="contextual-chips" role="radiogroup" use:rovingRadio aria-label={m.presentation_label()}>
      {#each vocabulary.visiblePresentations as p (p.id)}
        {@const role = roleAt(activeFlag.roles, p.roleIndex)}
        <button
          type="button"
          class="contextual-chip presentation-chip press"
          class:is-active={entryDraft.presentationId === p.id}
          {...roleAttrs(role)}
          role="radio"
          aria-checked={entryDraft.presentationId === p.id}
          onclick={() => entryDraft.setPresentation(entryDraft.presentationId === p.id ? null : p.id)}
        >
          {p.name}
        </button>
      {/each}
    </div>
  {/if}

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

  <!-- One chip per folded section, each a key (DIRECTION.md rule 13): its
       name, and under it what the section holds once it holds something -
       so a saved entry reads as a summary line under its note. A chip opens
       its section directly under the row and closes it on a second tap; one
       section at a time. -->
  <div class="editor-chips" data-editor-chips role="group" bind:this={chipRowEl}>
    {#each ENTRY_SECTIONS as section (section)}
      {@const state = sectionState(section, entryDraft)}
      {@const open = entryDraft.openSection === section}
      <button
        type="button"
        class="editor-chip press"
        class:is-open={open}
        data-section-chip={section}
        aria-expanded={open}
        aria-controls={open ? `editor-section-${section}` : undefined}
        onclick={() => toggleSection(section)}
      >
        <span class="editor-chip-name">{sectionName(section)}</span>
        {#if state != null}
          <span class="editor-chip-state">{state}</span>
        {/if}
      </button>
    {/each}
  </div>

  <!-- ADR-0078 holds: a section discloses by moving under the note, and a
       switch from one chip to another is the old section closing while the
       new one opens - two heights travelling, never a cut. A transition is
       local and does not play on first render, so a draft restored with a
       chip open draws it without a movement the person did not make. -->
  {#if entryDraft.openSection === 'tags'}
    <div class="editor-section" id="editor-section-tags" data-editor-section="tags" transition:disclose>
      <TagPicker
        groups={vocabulary.visibleTagGroups}
        selected={entryDraft.tags}
        onToggle={(id) => entryDraft.toggleTag(id)}
      />
    </div>
  {/if}

  {#if entryDraft.openSection === 'body'}
    <div class="editor-section" id="editor-section-body" data-editor-section="body" transition:disclose>
      <p class="editor-hint">{m.body_map_hint()}</p>
      <BodyRegionPicker
        regions={vocabulary.visibleBodyRegions}
        values={entryDraft.bodyRegions}
        onToggle={(key) => entryDraft.toggleBodyRegion(key)}
        onFeeling={(key, feeling) => entryDraft.setBodyRegionFeeling(key, feeling)}
      />
    </div>
  {/if}

  <!-- Attachments, split by kind (ticket 19): a person adding a photo does
       not want the recorder. Each kind keeps its own two controls, pick and
       make, since "Record" on two buttons side by side did not say which one
       was which (phase 5 ticket 22) and the chip now says it instead. -->
  {#if entryDraft.openSection === 'photos'}
    <div class="editor-section" id="editor-section-photos" data-editor-section="photos" data-editor-media transition:disclose>
      <div class="photo-row">
        {#each entryDraft.photos as p, i (p)}
          <div class="photo-wrap">
            {#if p.kind === 'stored'}
              <button class="photo-view" aria-label={m.photo_view_label()} onclick={() => (viewedPhoto = { fileName: p.photo.fileName })}>
                <PhotoThumb photo={p.photo} size={72} />
              </button>
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
              <button class="photo-view" aria-label={m.photo_view_label()} onclick={() => (viewedPhoto = { fileName: null, bytes: p.photo.full })}>
                <PhotoThumb photo={{ fileName: null }} bytes={p.photo.thumb} size={72} />
              </button>
            {/if}
            <button class="photo-remove" aria-label={m.photo_remove()} onclick={() => entryDraft.removePhoto(i)}>
              <Icon name="x" size={14} />
            </button>
          </div>
        {/each}
        <button class="photo-add press" data-add-photo aria-label={m.add_photo()} onclick={addPhoto}>
          <Icon name="image" size={22} /><span>{m.add_photo()}</span>
        </button>
        <button class="photo-add press" aria-label={m.add_photo_camera()} onclick={entryPhotoReview.capture}>
          <Icon name="camera" size={22} /><span>{m.add_photo_camera()}</span>
        </button>
      </div>
    </div>
  {/if}

  {#if entryDraft.openSection === 'voice'}
    <div class="editor-section" id="editor-section-voice" data-editor-section="voice" transition:disclose>
      {#if entryDraft.recordings.length > 0}
        <div class="recording-list">
          {#each entryDraft.recordings as r, i (r)}
            <!-- A row arrives and leaves by collapsing (DIRECTION rule 10),
                 so adding or removing one moves the rows under it rather
                 than jumping them. -->
            <div class="recording-row" transition:collapse|global>
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
    </div>
  {/if}

  {#if entryDraft.openSection === 'video'}
    <div class="editor-section" id="editor-section-video" data-editor-section="video" transition:disclose>
      {#if entryDraft.videos.length > 0}
        <div class="recording-list">
          {#each entryDraft.videos as v, i (v)}
            <div class="video-row" transition:collapse|global>
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
    </div>
  {/if}

  <!-- Contextual Inline Cards (ticket 04, ADR-0044). Offers rather than
       questions, so they stay where they were - after what the person
       chose to open, before the foot - and take no chip. -->
  {#if prefs.entryTryoutPromptEnabled && activeTryout}
    <!-- All three contextual cards open their own height rather than
         appearing at full size in one frame (ticket 99 item 18, "tryout
         felt sense comes out without an animation"). None of them is on
         screen when the editor mounts - each waits on a read the journal
         has not answered yet - so they arrive into a screen the person is
         already looking at, which is what tier 3 is for. A Svelte
         transition is local and does not play on first render, so this
         stays out of the way of the screen's own arrival. -->
    <div class="contextual-panel" data-contextual="tryout-felt-sense" transition:disclose>
      <div class="contextual-header">
        <span class="contextual-title">{m.entry_tryout_felt_sense_title({ name: activeTryout.label })}</span>
      </div>
      <div class="contextual-chips" role="radiogroup" use:rovingRadio aria-label={m.entry_tryout_felt_sense_title({ name: activeTryout.label })}>
        {#each [
          { step: 5, label: m.entry_tryout_sentiment_euphoric() },
          { step: 4, label: m.entry_tryout_sentiment_affirming() },
          { step: 3, label: m.entry_tryout_sentiment_neutral() },
          { step: 2, label: m.entry_tryout_sentiment_uncomfortable() },
          { step: 1, label: m.entry_tryout_sentiment_dysphoric() }
        ] as opt (opt.step)}
          <button
            type="button"
            class="contextual-chip press"
            class:is-active={entryDraft.tryoutFeltSense?.tryoutId === activeTryout.id && entryDraft.tryoutFeltSense?.mood === opt.step}
            role="radio"
            aria-checked={entryDraft.tryoutFeltSense?.tryoutId === activeTryout.id && entryDraft.tryoutFeltSense?.mood === opt.step}
            onclick={() => {
              if (entryDraft.tryoutFeltSense?.mood === opt.step) {
                entryDraft.setTryoutFeltSense(null);
              } else {
                entryDraft.setTryoutFeltSense({
                  tryoutId: activeTryout.id,
                  mood: opt.step,
                  note: tryoutReflection.trim() || null,
                  epochDay: day
                });
              }
            }}
          >
            {opt.label}
          </button>
        {/each}
      </div>
      {#if entryDraft.tryoutFeltSense?.tryoutId === activeTryout.id}
        <input
          type="text"
          class="input contextual-input"
          placeholder={m.entry_tryout_reflection_placeholder()}
          bind:value={tryoutReflection}
          oninput={() => {
            if (entryDraft.tryoutFeltSense) {
              entryDraft.setTryoutFeltSense({
                ...entryDraft.tryoutFeltSense,
                note: tryoutReflection.trim() || null
              });
            }
          }}
        />
      {/if}
    </div>
  {/if}

  {#if prefs.entryDoseQuickLogEnabled && scheduleDose}
    <div class="contextual-row" data-contextual="dose-quick-log">
      {#each dueScheduledDoses as doseItem (doseItem.episodeId)}
        {@const stockRow = stockFor(doseItem.drug)}
        <button
          type="button"
          class="contextual-chip dose-chip press"
          class:is-active={entryDraft.doseLog?.drug === doseItem.drug}
          aria-pressed={entryDraft.doseLog?.drug === doseItem.drug}
          onclick={() => {
            if (entryDraft.doseLog?.drug === doseItem.drug) {
              entryDraft.setDoseLog(null);
            } else {
              entryDraft.setDoseLog({
                dose: doseItem.dose,
                doseUnit: doseItem.doseUnit,
                drug: doseItem.drug,
                route: doseItem.route
              });
            }
          }}
        >
          <Icon name={entryDraft.doseLog?.drug === doseItem.drug ? 'check' : 'plus'} size={16} />
          <!-- Two lines rather than one run-on sentence: a fully-rounded
               pill's ends stop reading as a pill once its text wraps, so a
               chip carrying a second fact gets a plainer rounded rect
               instead (phase 5 deepening ticket 06). -->
          <span class="dose-chip-text">
            <span class="dose-chip-main">
              {m.entry_dose_quick_log({ dose: doseItem.dose, unit: doseItem.doseUnit, drug: doseItem.drug })}
            </span>
            {#if stockRow}
              <span class="dose-chip-sub">
                {stockRemainingLabel(stockRow.projection.remaining - 1, stockRow.entry.unit)}
              </span>
            {/if}
          </span>
        </button>
      {/each}
    </div>
  {/if}

  {#if prefs.entryProcedureRecoveryEnabled && recoveringProcedure}
    <div class="contextual-panel" data-contextual="procedure-recovery" transition:disclose>
      <div class="contextual-header">
        <span class="contextual-title">
          {m.entry_procedure_recovery_title({ day: recoveringProcedure.postOpDays, name: recoveringProcedure.proc.name })}
        </span>
      </div>
      <textarea
        class="input contextual-textarea"
        rows="2"
        placeholder={m.entry_procedure_recovery_notes_placeholder()}
        bind:value={procRecoveryNote}
        oninput={updateProcedureRecovery}
      ></textarea>
      <div class="procedure-photo-row">
        {#if procRecoveryPhoto}
          <div class="photo-wrap">
            <button class="photo-view" aria-label={m.photo_view_label()} onclick={() => (viewedPhoto = { fileName: null, bytes: procRecoveryPhoto!.full })}>
              <PhotoThumb photo={{ fileName: null }} bytes={procRecoveryPhoto.thumb} size={64} />
            </button>
            <button
              type="button"
              class="photo-remove"
              aria-label={m.entry_procedure_recovery_remove_photo()}
              onclick={() => {
                procRecoveryPhoto = null;
                updateProcedureRecovery();
              }}
            >
              <Icon name="x" size={14} />
            </button>
          </div>
        {:else}
          <button
            type="button"
            class="btn btn-ghost photo-add-btn"
            onclick={async () => {
              const picked = await pickPhotos();
              if (picked.length > 0) {
                procRecoveryPhoto = picked[0];
                updateProcedureRecovery();
              }
            }}
          >
            <Icon name="camera" size={18} />
            <span>{m.entry_procedure_recovery_add_photo()}</span>
          </button>
        {/if}
      </div>
    </div>
  {/if}

  {#if prefs.entryHrtEffectsEnabled && isHrtActive && !effectsQuiet}
    <div class="contextual-row" data-contextual="hrt-effects">
      {#if entryDraft.effectMarker}
        <div class="contextual-chip effect-chip is-active">
          <span>{m.entry_hrt_effects_title()}: {vocabulary.personalEffectTypeName(entryDraft.effectMarker.effect)}</span>
          <button
            type="button"
            class="icon-btn-inline"
            aria-label={m.dismiss()}
            onclick={() => entryDraft.setEffectMarker(null)}
          >
            <Icon name="x" size={14} />
          </button>
        </div>
      {:else}
        <button
          type="button"
          class="contextual-chip press"
          onclick={() => (effectSheetOpen = true)}
        >
          <Icon name="plus" size={16} />
          <span>{m.entry_hrt_effects_chip()}</span>
        </button>
      {/if}
    </div>
  {/if}

  {#if cycleTrackingActive}
    <div class="contextual-panel" data-contextual="cycle-event" transition:disclose>
      <div class="contextual-header">
        <span class="contextual-title">{m.entry_cycle_event_title()}</span>
      </div>
      <div class="contextual-chips">
        {#each [
          { kind: 'period_occurred' as const, label: m.entry_cycle_event_chip_period() },
          { kind: 'spotting' as const, label: m.entry_cycle_event_chip_spotting() },
          { kind: 'nothing_this_month' as const, label: m.entry_cycle_event_chip_clear() }
        ] as item (item.kind)}
          <button
            type="button"
            class="contextual-chip press"
            class:is-active={entryDraft.cycleEvent?.kind === item.kind}
            aria-pressed={entryDraft.cycleEvent?.kind === item.kind}
            onclick={() => {
              if (entryDraft.cycleEvent?.kind === item.kind) {
                entryDraft.setCycleEvent(null);
              } else {
                entryDraft.setCycleEvent({ kind: item.kind, epochDay: day });
              }
            }}
          >
            {item.label}
          </button>
        {/each}
      </div>
    </div>
  {/if}

  <SaveBar>
    <!-- Mood stays beside saving, with its own row of full-size targets. -->
    <div class="editor-save-row">
      <div class="editor-save-moods" data-save-moods bind:this={moodsEl}>
        <MoodPicker bar value={entryDraft.mood} onPick={(v) => entryDraft.setMood(v)} />
      </div>
      <button
        class="icon-btn press"
        aria-label={starred ? m.unstar_entry() : m.star_entry()}
        aria-pressed={starred}
        data-save-star
        disabled={saving || entryDraft.savedId !== undefined}
        onclick={toggleStarred}
      >
        <Icon name="star" size={20} cls={starred ? 'is-starred' : ''} />
      </button>
      <button
        class="btn press"
        class:btn-primary={!moodMissing}
        class:btn-soft={moodMissing}
        data-save
        data-save-unmet={moodMissing ? 'mood' : undefined}
        disabled={saving || entryDraft.savedId !== undefined}
        onclick={saveEntry}
      >
        <span>{moodMissing ? m.entry_pick_mood_to_save() : m.save_entry()}</span>
      </button>
    </div>
  </SaveBar>
  {/if}
  {/if}

  <Sheet bind:open={templateSheetOpen} title={m.use_template()}>
    <SectionHeading text={m.use_template()}>
      {#snippet action()}
        <!-- In place (audit item 6): closes this picker and raises the
             manager sheet directly, rather than navigating there and back. -->
        <button
          type="button"
          class="kit-heading-action"
          data-manage-entry-templates
          onclick={() => {
            templateSheetOpen = false;
            ui.raisedManager = 'templates';
          }}
        >
          {m.entry_templates_manage()}
        </button>
      {/snippet}
    </SectionHeading>
    <ListCard {role}>
      {#each vocabulary.visibleEntryTemplates as tpl (tpl.id)}
        <ListRow key={tpl.id} title={tpl.name} chevron={false} onclick={() => applyTemplate(tpl)} />
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

  <Sheet bind:open={revisitOpen} title={m.revisit_sheet_title()}>
    <SectionHeading text={m.revisit_sheet_title()} />
    {#if revisit}
      <p class="editor-hint">
        {m.revisit_current_label({ date: fmtDay(revisit.targetEpochDay, { day: 'numeric', month: 'long', year: 'numeric' }) })}
      </p>
      <SectionHeading text={m.revisit_change()} />
    {:else}
      <p class="editor-hint">{m.revisit_sheet_hint()}</p>
    {/if}
    <ListCard {role}>
      <ListRow key="week" title={m.revisit_preset_week()} chevron={false} onclick={() => setRevisit(revisitPresetDay('week'))} />
      <ListRow key="month" title={m.revisit_preset_month()} chevron={false} onclick={() => setRevisit(revisitPresetDay('month'))} />
      <ListRow
        key="three-months"
        title={m.revisit_preset_3_months()}
        chevron={false}
        onclick={() => setRevisit(revisitPresetDay('threeMonths'))}
      />
      <ListRow key="year" title={m.revisit_preset_year()} chevron={false} onclick={() => setRevisit(revisitPresetDay('year'))} />
    </ListCard>
    <p class="revisit-or-label">{m.revisit_pick_date_label()}</p>
    <div class="revisit-date-row">
      <DatePicker
        id="revisit-date"
        name="revisit-date"
        min={dateInputValueFromEpochDay(todayEpochDay() + 1)}
        ariaLabel={m.revisit_pick_date_label()}
        bind:value={revisitDateInput}
        data-revisit-date
      />
      <button class="btn btn-soft" disabled={!revisitDateInput} data-revisit-set onclick={setRevisitFromInput}>
        <span>{m.revisit_set_confirm()}</span>
      </button>
    </div>
    {#if revisit}
      <button class="btn btn-ghost" data-revisit-cancel onclick={cancelRevisit}><span>{m.revisit_cancel()}</span></button>
    {/if}
  </Sheet>

  <Sheet bind:open={effectSheetOpen} title={m.entry_hrt_effects_sheet_title()}>
    <SectionHeading text={m.entry_hrt_effects_sheet_title()} />
    <ListCard {role}>
      <!-- `vocabulary`, not a read of the effect table this screen ran for
           itself (ticket 99 item 19, "they are called with technical names,
           such as taste_perception_change_feminizing"). A built-in effect
           row carries no name of its own - the words live in the message
           catalogue and `vocabulary` is the layer that puts the two
           together, which is why every other screen showing an effect gets
           real words. The raw read also skipped the hidden/category filter
           `visiblePersonalEffectTypes` applies, so this picker offered
           effects the person had already turned off. -->
      {#each vocabulary.visiblePersonalEffectTypes as effectType (effectType.key)}
        <ListRow
          key={effectType.key}
          title={effectType.name}
          subtitle={effectType.categoryKey ? effectCategoryName(effectType.categoryKey) : undefined}
          chevron={false}
          onclick={() => {
            entryDraft.setEffectMarker({ effect: effectType.key, firstNoticedEpochDay: day });
            effectSheetOpen = false;
          }}
        />
      {/each}
    </ListCard>
  </Sheet>

  <PhotoDayPromptSheet
    open={dayPromptQueue.length > 0}
    bind:day={dayPromptValue}
    fieldId="entry-photo-day-prompt"
    onSave={() => resolveDayPrompt(dayPromptValue)}
    onSkip={() => resolveDayPrompt(null)}
  />

  <PhotoAlignmentReview
    photo={entryPhotoReview.photo}
    reference={entryPhotoReview.reference}
    onAccept={entryPhotoReview.accept}
    onRetake={entryPhotoReview.capture}
    onCancel={entryPhotoReview.cancel}
  />

  <PhotoViewer photo={viewedPhoto} onClose={() => (viewedPhoto = null)} />
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
    position: absolute;
    inset: 0;
    z-index: -1;
    background: var(--bg);
  }
  .editor-date { color: var(--text-2); font-size: var(--text-sm); margin: calc(-1 * var(--space-2)) 0 var(--space-4); }

  .editor-save-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2);
  }
  .editor-save-moods { flex: 1 0 100%; min-width: 0; }
  .editor-save-row .icon-btn { flex: none; }
  .editor-save-row .btn { flex: 1; min-width: 0; padding-inline: var(--space-2); }

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

  /* The free-choice date, under the presets rather than a fifth row among
     them - "sensible offered options and a free choice behind them", the
     ticket's own phrase. */
  .revisit-or-label {
    color: var(--text-2);
    font-size: var(--text-sm);
    margin: var(--space-3) 0 var(--space-2);
  }
  .revisit-date-row { display: flex; align-items: center; gap: var(--space-2); margin-bottom: var(--space-3); }
  .revisit-date-row :global(input) { flex: 1; }
  :global(.icon.revisit-set) { color: var(--accent); }

  /* Grown to the height of its text (ticket 19): the browser owns the
     measurement (`field-sizing`), and where it does not yet, `rows` holds
     the four-line floor it always had. No drag handle: a field that sizes
     itself has nothing for one to do, and the corner grip was the one
     piece of chrome on the page. */
  .editor-note {
    width: 100%;
    resize: none;
    field-sizing: content;
    min-height: calc(4lh + 2 * var(--space-3));
    font-family: var(--font-body);
  }

  /* The chip row: one key per folded section (DIRECTION.md rule 13).
     Blocks with a 1px outline edge and the app's one corner, wrapping at
     390px rather than scrolling - a row you have to scroll hides the
     question you came for, and "one tap away" has to mean visible. The
     open chip takes the chosen block's 3px `--text` edge, drawn as an
     inset outline so no chip moves when one opens. */
  .editor-chips {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
    margin: var(--space-5) 0 0;
  }
  .editor-chip {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    justify-content: center;
    gap: 1px;
    min-height: var(--touch-target);
    padding: var(--space-2) var(--space-3);
    border-radius: var(--r-block);
    border: 1px solid var(--outline);
    background: var(--surface);
    color: var(--text);
    font: inherit;
    text-align: left;
    cursor: pointer;
    transition: outline-color var(--dur-fast) var(--ease-out), background var(--dur-fast) var(--ease-out);
    outline: 3px solid transparent;
    outline-offset: -3px;
  }
  .editor-chip:hover { background: var(--surface-2); }
  .editor-chip.is-open { outline-color: var(--text); }
  .editor-chip:focus-visible { outline-color: var(--focus-ring); outline-offset: 2px; }
  .editor-chip-name {
    font-size: var(--text-sm);
    font-weight: var(--weight-bold);
    line-height: 1.25;
  }
  .editor-chip-state {
    font-size: var(--text-xs);
    font-weight: var(--weight-medium);
    color: var(--text-2);
    font-variant-numeric: tabular-nums;
    line-height: 1.25;
  }

  /* The section a chip opens sits on the page under the row, 20 below it
     (rule 1's gap between blocks) and 20 above whatever follows. The chip
     is its heading. */
  .editor-section {
    margin: var(--space-5) 0;
  }

  /* Contextual Inline Cards (ticket 04, ADR-0044) */
  .contextual-panel {
    background: var(--surface);
    border: 1px solid var(--outline);
    border-radius: var(--r-block);
    padding: var(--space-3) var(--space-4);
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    margin: var(--space-3) 0;
  }
  .contextual-row {
    margin: var(--space-3) 0;
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: var(--space-2);
  }
  .contextual-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .contextual-title {
    font-size: var(--text-xs);
    font-weight: var(--weight-bold);
    letter-spacing: 0.04em;
    color: var(--text-2);
    text-transform: uppercase;
  }
  .contextual-chips {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
  }
  .contextual-chip {
    position: relative;
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-3);
    min-height: 36px;
    box-sizing: border-box;
    border-radius: var(--r-block);
    border: 1.5px solid var(--outline);
    background: var(--surface);
    color: var(--text);
    font: inherit;
    font-size: var(--text-sm);
    font-weight: var(--weight-medium);
    cursor: pointer;
    transition: background var(--dur-fast) var(--ease-out), border-color var(--dur-fast) var(--ease-out), color var(--dur-fast) var(--ease-out);
  }
  /* Only where the chip is itself the control (ticket 99 item 19, "when i
     select an effect, i cannot deselect it even though i am clicking on the
     'x'"). This box exists to grow a 36px pill's hit area to the touch
     target, which is worth doing on a chip that is a <button> and is worth
     nothing on the one chip that is a <div> wrapping its own dismiss
     button - there it was an overlay with no handler, painted after its
     sibling button because a positioned pseudo-element with auto z-index
     paints in tree order, so it swallowed every press on the x. */
  button.contextual-chip::after {
    content: '';
    position: absolute;
    inset: -6px 0;
  }
  .contextual-chip:hover {
    border-color: var(--accent-border, var(--outline));
  }
  .contextual-chip.is-active {
    background: var(--accent-soft, var(--accent));
    color: var(--on-accent-soft, var(--accent-fg));
    border-color: var(--accent);
  }

  /* The dose chip earns two lines when a stock entry adds what it leaves,
     so it drops the pill radius for a rounded rect (--r-block, the one
     corner the app has) - a true pill's fully-rounded ends stop reading as
     a pill the moment its content wraps past one line. */
  .dose-chip {
    border-radius: var(--r-block);
    text-align: left;
  }
  .dose-chip-text {
    display: flex;
    flex-direction: column;
    gap: 1px;
  }
  .dose-chip-sub {
    font-size: var(--text-xs);
    font-weight: var(--weight-regular);
    /* Inherits the chip's own colour (plain, or on-accent-soft when
       active) rather than --text-2, which is wrong the moment the chip
       is active - opacity keeps it secondary either way. */
    opacity: 0.75;
  }
  .contextual-input {
    width: 100%;
    font-size: var(--text-sm);
  }
  .contextual-textarea {
    width: 100%;
    resize: vertical;
    font-family: var(--font-body);
    font-size: var(--text-sm);
  }
  .photo-add-btn {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    font-size: var(--text-sm);
    min-height: var(--touch-target);
    padding: var(--space-2) var(--space-3);
  }
  .icon-btn-inline {
    position: relative;
    border: none;
    background: none;
    cursor: pointer;
    color: inherit;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 24px;
    min-height: 24px;
    padding: 0;
    margin-left: var(--space-1);
  }
  .icon-btn-inline::after {
    content: '';
    position: absolute;
    inset: -12px;
  }
  .procedure-photo-row {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  /* Wraps the thumb only, not the star/remove badges beside it (ticket
     CARPET-06) - a plain block the same size as the tile it holds, so it
     adds a tap target without shifting either badge's absolute position. */
  .photo-view {
    display: block; border: none; background: none; padding: 0; cursor: pointer;
    border-radius: var(--r-block);
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

  /* A player is a row of its own rather than photo-row/photo-wrap's fixed
     72px square (screens.css): it is a transport across the width, not a
     tile. Both media are laid out here since ticket 46 gave them one
     transport - a recording is that row, a video note is a frame with the
     same row under it. */
  .recording-list { display: flex; flex-direction: column; gap: var(--space-2); margin-bottom: var(--space-3); }
  .recording-row { display: flex; align-items: center; gap: var(--space-2); }
  .recording-remove {
    flex-shrink: 0;
    width: var(--touch-target); height: var(--touch-target);
    border: none; cursor: pointer;
    background: none; color: var(--text-2);
    display: flex; align-items: center; justify-content: center;
  }

  /* A video note is its picture plus the transport under it, so it is taller
     than a recording's row and its remove button sits at the top rather than
     centred against the player (ticket 22, remeasured on ticket 46 - the
     "36px strip" that comment named was the native <audio> element's box and
     is gone). The list wrapper is .recording-list either way - the gap and
     the column are the same, and a second class with the same rules would
     only drift. */
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
    padding: 2px 8px; border-radius: var(--r-block);
    background: rgb(0 0 0 / 0.6); color: #fff;
    font-size: 0.8rem; font-variant-numeric: tabular-nums;
  }
</style>
