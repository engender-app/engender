/* Domain types (ticket 07): the shape the journal speaks, not the demo
   store's and not the schema's. Storage details stay behind the journal
   seam - uuid columns, updated_at, the join tables. Built-ins are
   addressed by their seeded key and user rows by a minted uuid
   (ADR-0002), arriving here as the string `id`/`key` - except entries,
   which keep their integer rowid as the id: they are addressed locally
   only, and ADR-0002 keeps the FTS link and the join-heavy queries on
   integer rowids. An entry's uuid travels in archives, not here. */

export interface Photo {
  id: string;
  /** The opaque `<uuid>.jpg` the file store holds, resolved against a root
      the platform picks (photos/names.ts). Null means no stored file: the
      demo persona's placeholders, which render as the gradient PhotoThumb
      otherwise uses while loading. A photo row always has one. */
  fileName: string | null;
  /** Chosen counterevidence (phase 5 ticket 14, CONTEXT: "Starred").
      Curation metadata, not content - a photo's owner never changes
      because of it. */
  starred: boolean;
}

/** A photo the editor drafted but nothing has saved yet: identity is
    minted on write, by the repository, never in a screen. */
export type DraftPhoto = Omit<Photo, 'id'>;

/** An in-app audio recording belonging to exactly one entry (phase 4 ticket
    24, CONTEXT: "Voice recording"). Entry-only, unlike Photo: no milestone
    owner. One file per row, unlike Photo: nothing normalizes or thumbnails
    a recording (out of scope by the ticket - no client-side audio
    effects), so `fileName` names the one file the entry's playback reads. */
export interface VoiceRecording {
  id: string;
  fileName: string;
}

/** A short in-app video recording belonging to exactly one entry (phase 5
    ticket 22, CONTEXT: "Video note"). VoiceRecording's shape, and its own
    interface rather than a shared one for the reason journal/videoNotes.ts
    gives: a rename on one must not silently change the other. One file, no
    thumbnail - a poster frame would be derived state (ADR-0010). */
export interface VideoNote {
  id: string;
  fileName: string;
}

/** What one entry says about one body region (phase 5 ticket 31, CONTEXT:
    "Entry" - amended). Two independent optional intensities on the shared
    0-100 scale (bodyMap.ts): how much the region hurt, and how good it
    felt. Independent because both can be true of the same part on the same
    day, and optional because saying nothing about one axis is not the same
    as scoring it 0 - a region someone is at peace with carries a euphoria
    and no dysphoria, which a single unsigned intensity could not express.

    Never combined. There is no net, balance or score across the two, here
    or anywhere downstream: that would be derived state (ADR-0010) and it
    would rank one axis against the other, which is the judgment
    docs/ui-copy.md forbids. */
export interface BodyRegionFeeling {
  dysphoria: number | null;
  euphoria: number | null;
}

/** Which of a body region's two intensities something is asking for.
    Neither is the default and neither is derived from the other; there is
    deliberately no third value meaning "both combined", because a net
    figure across the two would rank one axis against the other. */
export type BodyRegionAxis = keyof BodyRegionFeeling;

export interface Entry {
  id: number;
  epochDay: number;
  timestamp: number;
  mood: number | null;
  note: string;
  dims: Record<string, number>;
  tags: string[];
  photos: Photo[];
  recordings: VoiceRecording[];
  videos: VideoNote[];
  /** By body-region domain id (journal/bodyRegions.ts), independent of
      dims and tags - ticket 09 does not require ticket 02's "physical"
      dysphoria tag to be present to log a region. A region is present here
      only when it has something to say: a feeling with both axes null is
      dropped on save rather than stored blank. */
  bodyRegions: Record<string, BodyRegionFeeling>;
  /** Chosen counterevidence (phase 5 ticket 14, CONTEXT: "Starred"). Sits
      outside the seven-field content closure above - the same category
      the uuid/day/timestamp identity fields already are - so it never
      enters entryIsEmpty()'s count and starring an entry can never be
      what keeps it from being empty. Joins 'g-euphoria'-tagged entries in
      the doubt journal's counterevidence pool (entries.ts,
      counterevidencePool). */
  starred: boolean;
}

export interface GenderDimension {
  key: string;
  name: string;
  low: string;
  high: string;
  min: number;
  max: number;
  builtIn: boolean;
  /** Hidden dimensions leave presets, the editor and the charts; their
      logged values survive (CONTEXT: "Hidden"). Dimensions hide, never
      delete - a delete would take every value ever logged on it. */
  hidden: boolean;
}

export interface GenderPreset {
  id: string;
  name: string;
  builtIn: boolean;
  dims: string[];
}

export interface Tag {
  id: string;
  label: string;
  builtIn: boolean;
  hidden: boolean;
  /** Built-in only: what this category means, for tags whose name alone
      does not say (CONTEXT: Dysphoria type). Surfaced via an info
      affordance rather than shown inline. */
  description?: string;
}

export interface TagGroup {
  key: string;
  name: string;
  enabled: boolean;
  builtIn: boolean;
  tags: Tag[];
}

/* No `kind`: whether a milestone reads as a countdown or an anniversary
   follows from its date and today (ADR-0010), so milestoneStatus()
   computes it and nothing stores it. */
export interface Milestone {
  id: string;
  name: string;
  epochDay: number;
  templateKey: string | null;
  photo: Photo | null;
}

/* Carries the rule from reminderRule.ts, never a next-fire instant
   (ADR-0010). The old demo vocabulary ('EVERY_3_DAYS', onceInDays) does
   not survive contact with the schema's recurrence CHECK. */
export interface Reminder {
  id: string;
  title: string;
  type: 'med' | 'injection' | 'appointment' | 'other';
  time: string;
  recurrence: 'DAILY' | 'WEEKLY' | 'EVERY_N_DAYS' | null;
  /** EVERY_N_DAYS only. */
  interval: number | null;
  /** EVERY_N_DAYS only: a day the reminder fires on, fixing the progression. */
  anchorEpochDay: number | null;
  /** One-off only (recurrence null): the concrete day. */
  epochDay: number | null;
  enabled: boolean;
  /** Which feature manages this reminder on this person's behalf, e.g.
      `stock:estradiol valerate` (phase 4 ticket 04, stockReminder.ts).
      Null for every reminder a person created themselves. The general
      reminders editor never sets this, so saving a reminder through it -
      even one that started out managed - clears it: that is the handoff
      this field exists to record. */
  autoSource: string | null;
}

/* Where a draw fell relative to dosing (phase 4 ticket 03, CONTEXT: "Lab
   draw context"). Two figures rather than one, because "how long since
   dosing" means different things by pharmacokinetics: hours for oral,
   sublingual, patch and gel; day-of-interval for IM and SC, where a
   single-digit-hour figure says nothing about a depot with a
   days-to-weeks half-life.

   A union on route the way DoseEvent is, for the same reason: which figure
   a context carries is decided by its route and nothing else, so no screen
   should have to remember which of two numbers is the null one.

   This is stored, not derived on read, and it is the one place in this
   schema that stores a figure computable from other rows - which is what
   ADR-0010 exists to prevent. The exception is deliberate and argued at
   the column definitions (migrations.ts, v6). In short: ADR-0010's case is
   about columns that drift out of agreement with their inputs, and this
   one cannot, because its input is the dose log as it stood at the moment
   of the draw and that is not recoverable later. It is a recorded
   observation, like the value beside it, not a cache of a live
   computation. Recomputing it would let a dose corrected months later
   silently rewrite the context on a result someone already reviewed. */
export type LabTiming =
  | { route: 'oral' | 'sublingual' | 'patch' | 'gel'; hoursSinceDose: number }
  | { route: 'im' | 'sc'; dayOfInterval: number };

export interface LabResult {
  id: string;
  epochDay: number;
  analyte: string;
  value: number;
  unit: string;
  note: string;
  /** Local wall-clock 'HH:MM', or null when the draw time was not
      recorded. Optional because a lab slip often does not carry one, and
      day-of-interval does not need it; without it there is no hours
      figure, which is the honest answer rather than a zero. Unlike an
      Entry's Timestamp this never decides which day the result belongs to
      - `epochDay` does, and this refines the moment within it. */
  drawTime: string | null;
  /** Which lab drew it. Free text, exactly as free as `unit`: no fixed
      list, no normalization, and no matching between two spellings of one
      lab (CONTEXT: "Lab provider"). Blank when not recorded. */
  provider: string;
  /** Null when no dose preceded the draw, or when an hours figure would
      have needed a draw time nobody recorded. */
  timing: LabTiming | null;
}

/* No episode reference (ticket 08 scope): a measurement stands alone and
   has to work whether or not a regimen episode exists. `type` names a
   MeasurementType by key - a built-in's stable key or a custom's minted
   uuid (phase 5 ticket 29) - rather than a closed union: the CHECK that
   once enforced the closed set lives in application code now, the same
   free-text-but-matched-by-key treatment tag.label's group reference
   never needed either, because nothing here resolves it to a rowid. */
export interface Measurement {
  id: string;
  type: string;
  epochDay: number;
  value: number;
  unit: string;
}

/* A measurement type (phase 5 ticket 29): user-supplied name, created from
   the measurements screen, minted with a uuid that doubles as its key -
   exactly addCustomDimension's pattern (dimensions.ts). Hides rather than
   deletes, like a gender dimension or a tag (CONTEXT: "Hidden"): every
   measurement logged against it survives a hide. `name` is '' for a
   built-in - its wording is looked up at display time (vocabulary.ts),
   the same split GenderDimension's name gets. */
export interface MeasurementType {
  key: string;
  name: string;
  builtIn: boolean;
  hidden: boolean;
}

/* No episode reference either, the same reason Measurement has none: what
   was bought and how it fit stands alone (phase 5 ticket 23). `category` is
   loosened to string here the way HairRemovalSession['area'] is - the
   closed vocabulary lives in garmentCategories.ts and its CHECK, not in
   this type. */
export interface SizeRecord {
  id: string;
  epochDay: number;
  category: string;
  size: string;
  brand: string;
  fitNote: string;
}

/** The two counters ticket 10 tracks. Fixed rather than user-defined, so it
    is a plain union rather than a keyed reference-data row. */
export type TallyKind = 'misgendered' | 'correctly_gendered';

export interface TallyEvent {
  id: string;
  epochDay: number;
  kind: TallyKind;
  context: string;
}

/* Free-write reflection for a "not trans enough" spiral (phase 4 ticket
   11, CONTEXT: "Doubt entry"). Its own record type, the same reasoning
   TallyEvent above is not a variant of Entry: no mood, dimension values,
   tags or note - just the one free-write field. */
export interface DoubtEntry {
  id: string;
  epochDay: number;
  timestamp: number;
  text: string;
}

/** One of the user's own euphoria-tagged entries, copied into a
    CounterevidenceSnapshot rather than referenced by id - see the
    ADR-0010 exception argued at migrations.ts v14. Deliberately thinner
    than Entry: a snapshot exists to be reread, not re-edited, so it
    carries only what makes the counterevidence legible - the day and what
    was written - not its tags or photos. */
export interface CounterevidenceEntry {
  epochDay: number;
  mood: number | null;
  note: string;
}

/** A one-tap capture of the counterevidence a doubt entry's composer was
    showing at the moment it was saved (CONTEXT: "Counterevidence
    snapshot"), so rereading it later shows exactly what convinced someone
    then rather than whatever their history looks like now. */
export interface CounterevidenceSnapshot {
  id: string;
  epochDay: number;
  timestamp: number;
  items: CounterevidenceEntry[];
}

/** What someone is trying out (phase 4 ticket 16, widened past name/pronoun
    by phase 5 ticket 13, CONTEXT: "Tryout"): a name or pronoun set, a
    style, a garment, makeup, or a presentation step - one record type
    covering whatever is being tried, rather than a second type forked
    alongside this one for everything that is not a name or pronoun set. */
export type TryoutKind = 'name' | 'pronouns' | 'style' | 'garment' | 'makeup' | 'presentation_step';

/** Trying something out (phase 4 ticket 16, widened by phase 5 ticket 13,
    CONTEXT: "Tryout"). `endEpochDay` is null while the tryout is still
    going - the same "still running" shape DosePause uses for a break with
    no end date yet - so a tryout in progress needs no placeholder end
    invented for it, and several tryouts can overlap or sit entirely in the
    past with no rule that exactly one of them is current.

    `description` is free text alongside `label`, for a kind whose label
    does not carry enough on its own - a style or garment tryout usually
    needs more said about it than a name or pronoun set does. Null for any
    kind that has no use for it.

    Which entries fall inside a tryout's range is never stored (ADR-0010):
    TryoutsArea owns only this row, its felt-sense history and its photos,
    and a screen reads the entries themselves through
    entries.searchEntries('', [], { startEpochDay, endEpochDay }), the
    plain date-range filter the search screen already offers. */
export interface Tryout {
  id: string;
  kind: TryoutKind;
  label: string;
  description: string | null;
  startEpochDay: number;
  endEpochDay: number | null;
}

/** One dated tryout photo (phase 5 ticket 13). Its own shape rather than
    ProcedurePhoto's, though the same reasoning: it is the only other photo
    in the app that carries both an owner and a date, because when during
    the tryout it was taken is the whole point of it, the same argument
    ProcedurePhoto's own doc comment makes for recovery photos. */
export interface TryoutPhoto {
  id: string;
  tryoutId: string;
  epochDay: number;
  fileName: string;
}

/** One point in a tryout's running felt-sense history (CONTEXT:
    "Felt-sense entry"). Watching that feeling change over the tryout's
    lifespan is the point of tracking it, so this is its own addressable
    row rather than a single rating fixed on the tryout at creation - the
    same reasoning that gives DosePause its own uuid where
    doubt_snapshot_entry, a frozen detail row nobody addresses alone, has
    none. `mood` reuses the app's one five-level mood scale (CONTEXT:
    "Mood") rather than inventing a second one for the same kind of
    judgement. */
/** Belongs to exactly one Tryout or Milestone (CONTEXT: "Felt-sense
    entry"); which owner never travels here, the same reasoning `Photo`
    carries no `entryId`/`milestoneId` of its own - the caller already
    knows which owner it asked for. */
export interface FeltSenseEntry {
  id: string;
  epochDay: number;
  mood: number;
  note: string | null;
}

/* No stored end: an episode runs until the next one starts, or is ongoing
   if it is the latest (ADR-0010, regimenEpisode.ts computes it). Not a
   preference (ADR-0003) and not a Reminder: it is attributed data every
   other record resolves against by timestamp, not a device setting and
   not a prompt to log something. */
export interface RegimenEpisode {
  id: string;
  drug: string;
  /** Nullable: antiandrogens and some routes have none. */
  ester: string | null;
  dose: number;
  doseUnit: string;
  route: string;
  interval: string;
  startEpochDay: number;
  /** Hidden episodes leave the picker downstream tickets offer for new
      records; records already attributed to one keep resolving to it
      (CONTEXT: "Hidden"). */
  hidden: boolean;
}

/* The routes a dose can be taken by (phase 4 ticket 02). A closed set,
   unlike a regimen episode's free-text `route`: what fields a dose carries
   depends on which route it was, so the app has to know the answer rather
   than carry whatever was typed. */
export type DoseRoute = 'oral' | 'sublingual' | 'im' | 'sc' | 'patch' | 'gel';

/** Oil suspends an ester for slow release; an aqueous suspension does not.
    Injections only - nothing else has a vehicle to record. */
export type InjectionVehicle = 'oil' | 'aqueous';

/** Taken is the default. Skipped means the slot was expected and nothing
    was taken - the dose is still logged, so an adherence view can show the
    gap rather than infer it from an absence. Changed means it was taken,
    but not as scheduled. */
export type DoseStatus = 'taken' | 'skipped' | 'changed';

/** What a `changed` dose was supposed to be, kept beside what it actually
    was. Null on every other status: there is nothing to compare against
    when the dose went as planned. */
export interface ScheduledDose {
  dose: number;
  route: DoseRoute;
  timestamp: number;
}

interface DoseEventFields {
  id: string;
  /** Epoch milliseconds, and load-bearing - unlike an Entry's Timestamp,
      which only orders same-day entries (CONTEXT: "Timestamp"). Ticket 03
      derives hours-since-last-dose from this, and sublingual estradiol
      peaks in one to two hours, so a day would not be precise enough to
      derive anything from. */
  timestamp: number;
  dose: number;
  doseUnit: string;
  status: DoseStatus;
  scheduled: ScheduledDose | null;
}

/* A dose event is its own record type, not an Entry: it carries no mood, no
   dimension values, no tags and no note, and CONTEXT.md's Entry is closed
   over exactly those five fields.

   Nor does it store which regimen episode it belongs to. Attribution is
   resolveEpisodeAt(episodes, dose.timestamp) at read time (regimenEpisode.ts),
   so backdating a dose - or inserting a corrective episode underneath it -
   changes the answer with no stored link to rewrite (ADR-0010).

   A union rather than one interface with nullable fields, because which
   fields a dose has is decided by its route and nothing else: an oral dose
   has no site to be null, and no screen should have to remember that. */
export type DoseEvent =
  | (DoseEventFields & { route: 'oral' | 'sublingual' })
  | (DoseEventFields & {
      route: 'im' | 'sc';
      /** Normally a key from INJECTION_SITES (doseSchedule.ts): the rotation
          body map's regions, a different vocabulary from where a patch goes.
          Nullable on the way out, not on the way in - a write must name a
          site the map knows (DoseEventInput), but an archive from another
          build could hold a row that does not, and reading it back as a made-
          up site would be worse than reading it back as unknown. */
      injectionSite: string | null;
      vehicle: InjectionVehicle | null;
    })
  | (DoseEventFields & {
      route: 'patch' | 'gel';
      /** A key from APPLICATION_SITES (doseSchedule.ts), nullable on read for
          the same reason. A patch or gel site is not rotated on an injection
          site's schedule, so the two are not one field. */
      applicationSite: string | null;
    });

/** One or the other, never both: a fixed step from the episode's start day,
    or a set of calendar weekdays that needs no anchor to stay in phase.
    `weekdays` is Monday-first (0 = Monday … 6 = Sunday, epochDay.ts'
    `weekdayOfEpochDay`), matching the calendar heat-map's own week. */
export type DoseScheduleRecurrence =
  | { kind: 'everyNDays'; everyNDays: number }
  | { kind: 'weekdays'; weekdays: number[] };

/** One amount in a schedule's `doseAmounts` cycle. */
export interface DoseScheduleAmount {
  dose: number;
  doseUnit: string;
}

/** How often an episode expects a dose, structured enough to generate
    slots from - which the episode's own free-text `interval` is not. An
    every-N-days recurrence is anchored to the episode's start day, so the
    progression is fixed by the episode rather than by when the schedule was
    written; editing it does not shift the slots already generated, and a
    weekday recurrence needs no such anchor to hold that same guarantee.
    One per episode.

    `doseAmounts`, when set, cycles across every slot the schedule generates,
    in order - the 2mg/1mg alternation this exists for. Null means the
    schedule tracks no target amount at all, which is every schedule from
    before this field existed. */
export interface DoseSchedule {
  id: string;
  /** A RegimenEpisode id. */
  episodeId: string;
  recurrence: DoseScheduleRecurrence;
  /** Twice-daily oral is 2. */
  dosesPerDay: number;
  doseAmounts: DoseScheduleAmount[] | null;
}

/** Planned is a break someone chose or a clinician directed; accidental is
    a gap that happened and is being recorded honestly. Both suppress
    expected slots - neither is judged. */
export type PauseReason = 'planned' | 'accidental';

/** A dated range on one episode during which no dose is expected, so a gap
    that was a break does not read as a missed dose - in the adherence view
    or in ticket 04's consumption-rate projection. */
export interface DosePause {
  id: string;
  /** A RegimenEpisode id. */
  episodeId: string;
  startEpochDay: number;
  /** Null while the pause is still running: a break you are in the middle
      of has no end day yet, and waiting for one would mean the adherence
      view counts missed doses through it. */
  endEpochDay: number | null;
  reason: PauseReason;
}

/** A dated break from journaling (phase 5 ticket 21, CONTEXT: "Streak" -
    amended). No episode reference: unlike DosePause above, this has nothing
    to do with a regimen. Null end day means the pause is still running, the
    same reasoning DosePause.endEpochDay gives. `Streak`'s own computation
    treats a day inside a pause range as neither a gap nor a logged day; see
    `journalingPause.ts`'s `pauseCoversDay`. */
export interface JournalingPause {
  id: string;
  startEpochDay: number;
  endEpochDay: number | null;
}

/* No episode reference (CONTEXT: "Side effect"): this record stands alone
   and has to work before a regimen episode exists. */
export interface SideEffect {
  id: string;
  name: string;
  /** 1 (barely noticeable) to 5 (severe). */
  severity: number;
  epochDay: number;
}

/** The three states phase 5 ticket 03 logs. Fixed rather than user-defined,
    the same reasoning TallyKind gives - 'nothing_this_month' is a real,
    loggable state here, not the absence of a row. */
export type CycleEventKind = 'period_occurred' | 'spotting' | 'nothing_this_month';

/* No episode reference (CONTEXT: "Cycle event"): this record stands alone
   and has to work whether or not a regimen episode exists, the same
   reasoning SideEffect above gives. Not an Entry: no mood, dimension
   values, tags or note. Purely descriptive - no prediction, forecast or
   fertility framing of any kind. */
export interface CycleEvent {
  id: string;
  kind: CycleEventKind;
  epochDay: number;
}

/* Its own record type, not an Entry (CONTEXT: "Wear session"), and not a
   Reminder either: the record is what happened, and its optional Reminder
   is a separate row this area manages by an auto_source marker
   (wearSessions.ts), the same handoff medication_stock's run-out prompt
   uses. */
export interface WearSession {
  id: string;
  /** The one load-bearing timestamp, the same rule DoseEvent's carries
      (CONTEXT: "Dose event timestamp"): when the session actually started. */
  startTimestamp: number;
  /** Null while the session is still running - a live timer started and
      not yet stopped. Never null for a backfilled session: its day and
      duration are both known at save time. */
  durationMs: number | null;
  note: string | null;
}

/* Preferences are not here: they live in SQLite's `pref` table and are
   described by prefs/catalogue.ts (ticket 06). Neither is a whole-journal
   type: the `DB` object the demo store held went with it in ticket 08, and
   what an archive carries is the archive module's own shape. */

export interface MilestoneTemplate {
  key: string;
  name: string;
}

/** A built-in suggestion for an entry (phase 4 features ticket 17): picking
    one pre-fills `tags` and `dims` on the entry being created, exactly as
    `MilestoneTemplate` pre-fills a milestone's name. What the user saves
    from it is an ordinary Entry, and every pre-filled value stays editable
    up to save - a template only ever seeds the draft, never gates it. */
export interface EntryTemplate {
  key: string;
  name: string;
  tags: string[];
  dims: Record<string, number>;
}

/** A rotating reflection cue offered beside the entry-creation form (phase 4
    features ticket 17), never written into the note field itself - the
    entry it sits beside is free-write, and the prompt is only ever a
    suggestion. Dismissed per-occurrence, in memory, not stored. */
export interface EntryPrompt {
  key: string;
  text: string;
}

/** A built-in suggestion for a `RegimenEpisode` (phase 5 ticket 42, CONTEXT:
    "Regimen template"): picking one pre-fills `drug`, `ester` and `route`
    only, the same shape `MilestoneTemplate` gives a milestone's name. `name`
    labels the picker row and is never itself written into the episode.
    Carries no dose or interval on purpose - those are where a suggestion
    starts reading as a recommendation, which this app's HRT tracking
    otherwise never does. What the user saves from one is an ordinary
    RegimenEpisode, with no stored link back to the template it came from. */
export interface RegimenTemplate {
  key: string;
  name: string;
  drug: string;
  ester: string | null;
  route: string;
}

/** The eight fixed markers a personal effects timeline tracks: four
    feminizing (phase 4 ticket 07) and four masculinizing (phase 5 ticket
    02), sharing one closed table rather than two parallel ones - one
    timeline anchored to the earliest regimen episode overall is the right
    shape regardless of hormone direction. Ticket 07 called this list
    closed and not open-ended or user-extensible; ticket 02 deliberately
    reverses that rule once, to reach trans-masc parity, and closes the
    list again at eight - not a precedent for a ninth. "Masculinizing fat
    redistribution" is a distinct effect from "fat redistribution" above,
    not the same marker read two ways: the two describe different, not
    opposite, changes, and collapsing them into one bidirectional marker
    would need a sign or direction field this table has no room for.
    "Hair changes" and "facial/body hair" are each a single first-noticed
    date like the rest - ticket 09's Norwood-Hamilton staging and photo
    scheduling is a separate, deeper module every one of them coexists
    alongside untouched. */
export type PersonalEffectType =
  | 'breast_development'
  | 'fat_redistribution'
  | 'skin_softening'
  | 'hair_changes'
  | 'voice_drop'
  | 'facial_body_hair'
  | 'masculinizing_fat_redistribution'
  | 'cycle_cessation';

/* One row per effect (migrations.ts v12), matched exactly like
   MedicationStock's drug: a person is always answering "when did I first
   notice this", never logging a series of sightings. No episode
   reference: what this marker is read against - the earliest regimen
   episode's start day - is resolved above the journal seam
   (regimenEpisode.ts), not stored here. */
export interface PersonalEffect {
  id: string;
  effect: PersonalEffectType;
  firstNoticedEpochDay: number;
}

/* A dated series like Measurement (ticket 08), not a single replaced value
   like PersonalEffect: a person re-stages over time to track progression,
   never answering "what is it now" in place of what it was before. No
   episode or anchor reference: what this is read against is resolved above
   this seam (hairAnchor.ts), the same reason Measurement and PersonalEffect
   carry none either.

   `scale` and `stage` are plain strings rather than literal unions here,
   the same treatment HairRemovalSession.area gets: the pair is validated
   against hairStageScales.ts's closed vocabularies above the schema seam
   (journal/hairProgress.ts), and the schema's own CHECK refuses a
   mismatched pair on a write or a restore alike (migrations.ts v37). The
   two are never separated - '1' through '5' are grade codes on both
   published scales and mean different things on each, so a stage without
   its scale says nothing (phase 5 ticket 33). */
export interface HairStage {
  id: string;
  epochDay: number;
  /** Which published scale `stage` is a grade of, or 'other' for a pattern
      neither describes. */
  scale: string;
  /** The grade, empty exactly when `scale` is 'other' - that one publishes
      no grades. */
  stage: string;
  /** What the person wrote about a pattern neither scale describes. Empty
      unless `scale` is 'other', and it may be empty then too: "neither of
      these", with nothing more said, is a record. */
  description: string;
}

/** A hair-removal session's method (phase 5 ticket 08): a small closed set
    rather than free text, so `hairRemovalMethodName` can give it a
    translated label the way a hair-staging grade does - 'other' is the
    escape hatch for anything the two named methods do not cover. */
export const HAIR_REMOVAL_METHODS = ['laser', 'electrolysis', 'other'] as const;
export type HairRemovalMethod = (typeof HAIR_REMOVAL_METHODS)[number];

/** One electrolysis/laser session (phase 5 ticket 08, CONTEXT: pending). A
    dated series like Measurement and HairStage above, not a single replaced
    value: a person logs many sessions over time. `area` is a plain string
    rather than a literal union here, the same treatment DoseEvent's
    `injectionSite` gets: it is validated against hairRemovalAreas.ts's own
    closed vocabulary above the schema seam (journal/hairRemoval.ts), which
    is never the body-region vocabulary (BodyRegion above) - see
    hairRemovalAreas.ts's header for why the two stay separate. `painRating`
    is the same 1-5 scale
    SideEffect.severity uses. `cost` and `provider` are both free text,
    matching LabResult.provider's own no-list, no-normalization treatment -
    there is no ledger here, only a per-session note of what was paid and to
    whom. */
export interface HairRemovalSession {
  id: string;
  epochDay: number;
  area: string;
  method: HairRemovalMethod;
  painRating: number;
  cost: string;
  provider: string;
}

/** What a person last reported having of one drug (phase 4 ticket 04,
    CONTEXT: pending). One per drug, matched exactly (`RegimenEpisode.drug`'s
    own convention) rather than per episode - see migrations.ts v7. Neither
    `quantity` nor `recordedEpochDay` is a running total: saving a fresh
    count replaces the old one outright, the way `DoseSchedule` replaces per
    episode, because a person reporting stock is always answering "how much
    do I have today", never "how much did I have last time plus what I
    have now". Remaining and its run-out day are never stored (ADR-0010) -
    stockProjection.ts derives both from this and the dose log on every
    read. */
/* A free-write note to the person's future self, sealed until
   `unlockEpochDay` (phase 4 ticket 19, CONTEXT: "Milestone", "Countdown",
   "Anniversary"). No `sealed` flag: whether it is readable follows from
   comparing `unlockEpochDay` against today, computed above the seam by
   letterStatus.ts rather than stored (ADR-0010), the same reasoning that
   keeps `kind` off Milestone. The seal is a UI-level gate only - no
   second cryptographic layer sits under this row beyond the journal's
   existing whole-database encryption (ADR-0020). */
export interface Letter {
  id: string;
  epochDay: number;
  text: string;
  unlockEpochDay: number;
}

export interface MedicationStock {
  id: string;
  drug: string;
  quantity: number;
  unit: string;
  recordedEpochDay: number;
  /** Whether box 4's run-out prompt has ever been created for this drug -
      stockReminder.ts's signal that a Reminder now missing was a person's
      own edit or delete, not one that was never made. */
  reminderEverCreated: boolean;
  /** Set once a person's own edit or delete took that prompt over; a fresh
      `upsertEntry` (stock.ts) is the only thing that clears it. */
  reminderDismissed: boolean;
}

/** A checklist's owner reference (phase 5 ticket 05): `kind` names what kind
    of record owns it and `id` is that record's own travelling identity
    (ADR-0002). Not a closed union like PhotoOwner (photos.ts) - no owner
    table ships with this ticket, so the pair is what lets a future owner
    kind reuse this table with no schema change of its own. */
export interface ChecklistOwner {
  kind: string;
  id: string;
}

/** One line of a checklist (phase 5 ticket 05, CONTEXT: "Checklist"): free
    text the user wrote, checked or not, and whether it is still open past
    whatever event closed its checklist's usual window - a visit, a
    procedure's recovery close-out. Never bundled content: unlike a
    **Roadmap goal**, there is nothing behind an item but what the user
    typed, the distinction CONTEXT already draws between Custom and
    Built-in. */
export interface ChecklistItem {
  id: string;
  content: string;
  checked: boolean;
  carriedForward: boolean;
}

/** An ordered list of checklist items, standalone or scoped to one owner
    record (phase 5 ticket 05). Ticket 07's recovery checklist and ticket
    11's appointment prep list are both this same shape - the owner is what
    differs between the two call sites, not the item. */
export interface Checklist {
  id: string;
  owner: ChecklistOwner | null;
  items: ChecklistItem[];
}

/** The tri-state a roadmap goal's tick can hold (phase 5 ticket 20,
    CONTEXT: "Roadmap goal"): 'unchecked' is untaken, 'checked' is done,
    and 'not-my-path' says the step is not part of this person's own path
    rather than left undone. Stored the same way for a bundled goal (named
    by its pack and goal key) and a custom one (named by its uuid) - the
    two differ only in whether the row that carries it exists because of
    the tick or regardless of it. */
export type RoadmapGoalStatus = 'unchecked' | 'checked' | 'not-my-path';

/** A user-authored roadmap goal (phase 5 ticket 20, CONTEXT: "Roadmap
    goal", "Custom"): free text someone added to a track themselves,
    uuid-identified rather than named by a pack and a key the way a
    bundled goal is, and never translated or reseeded - the split CONTEXT
    already draws between Custom and Built-in. Appended to the end of its
    track's order; the roadmap already refuses ordering between goals
    (roadmap.ts), so creation order is all there is to keep. */
export interface CustomRoadmapGoal {
  id: string;
  track: string;
  text: string;
  status: RoadmapGoalStatus;
}

/** One procedure someone is going through (phase 5 ticket 07, CONTEXT:
    "Procedure"): a free-text name, the consults leading up to it, a surgery
    date once there is one, and the recovery log's own notes. Several can
    coexist - top surgery and facial feminization surgery tracked
    independently - so nothing about this shape is a singleton.

    Holds nothing derived: how far along recovery is comes from the surgery
    date and today (recoveryDay.ts, ADR-0010), and the recovery checklist is
    an ordinary **Checklist** owned by this procedure rather than a field
    here. */
export interface Procedure {
  id: string;
  name: string;
  /** Null until a date is set, which is usually well after the record
      exists. */
  surgeryEpochDay: number | null;
  consults: ProcedureConsult[];
  notes: string;
}

/** One consult on the way to a procedure (phase 5 ticket 07): a date, and
    the minted id that lets one mistyped date be dropped on its own
    (ADR-0002). Carries nothing else - what was said at a consult goes in
    an ordinary Entry or the procedure's notes. */
export interface ProcedureConsult {
  id: string;
  epochDay: number;
}

/** One line in the pool the check-in draws its affirming line from (phase 5
    ticket 15, CONTEXT: "Affirmation"). A built-in carries a stable key and
    empty text - its wording lives in the message catalogue and applies
    whatever language is active - the same split BUILT_IN_TAG_GROUPS gives
    Tag (ADR-0002, CONTEXT: "Built-in"). A custom line carries a minted uuid,
    the text the person actually wrote, and the one language it was written
    in: it is never translated to the other (CONTEXT: "Custom"). Hiding a
    built-in takes it out of the pool without touching a check-in already
    sent with it (CONTEXT: "Hidden"); a custom line has no bundled
    counterpart to preserve, so it deletes outright instead - the same
    asymmetry Tag draws between the two. */
export interface Affirmation {
  id: string;
  /** Null for a built-in; 'en' or 'pl' for a custom. */
  language: 'en' | 'pl' | null;
  /** '' for a built-in - the message catalogue holds its wording, looked up
      by id - the written line for a custom. */
  text: string;
  builtIn: boolean;
  hidden: boolean;
}

/** One row of the body-region reference-data area (phase 5 ticket 30,
    CONTEXT: "Reference data" - amended). Flat, like Affirmation: a
    built-in's `name` is '' and its wording comes from the message
    catalogue by `id`; a custom region carries the name the person typed
    and is never translated. No location on the body-map illustration -
    a custom region is a named row with an intensity, listed rather than
    positioned. Hides rather than deletes, the same as a Tag or a
    GenderDimension, so a region's logged intensities keep resolving and
    charting after it is hidden (CONTEXT: "Hidden"). */
export interface BodyRegion {
  id: string;
  name: string;
  builtIn: boolean;
  hidden: boolean;
}
