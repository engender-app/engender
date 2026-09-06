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

/** A standardized voice take (phase 5 deepening ticket 15, CONTEXT: "Voice
    benchmark"). Not a VoiceRecording: that is a memo on one entry, this
    belongs to a day and carries the acoustic figures the engine
    (lib/audio/) measured from it under fixed conditions.

    Every figure is descriptive (PRODUCT.md:109) - a frequency, a span, a
    spread, a rate, two resonances. None of them is a score and none of them
    has a good end.

    The vowel half is nullable as a group: a session that skipped the
    sustained vowel, or whose vowel never cleared the gate, is a benchmark
    with a passage and no resonance. `note` is the person's own words about
    the take, not the musical note of the median, which follows from
    `f0MedianHz` (ADR-0010). */
export interface VoiceBenchmark {
  id: string;
  epochDay: number;
  timestamp: number;
  passageKey: string;
  passageFileName: string;
  vowelFileName: string | null;
  f0MedianHz: number;
  f0P10Hz: number;
  f0P90Hz: number;
  semitoneSd: number;
  wordsPerMinute: number;
  f1Hz: number | null;
  f2Hz: number | null;
  snrDb: number | null;
  note: string | null;
  /** The passage's pitch over time, downsampled and encoded by
      audio/track.ts (phase 8 features ticket 09). Null on every benchmark
      taken before schema v58, which kept only the figures - a screen with
      one of those in hand draws no take rather than an empty chart. */
  pitchTrack: string | null;
  /** What recorded it (audio/captureChain.ts, ADR-0061), null on a
      benchmark taken before schema v65. */
  captureChain: string | null;
  /** The corner-vowel scaling factor (audio/vowelScale.ts, phase 8 features
      ticket 30), null on a benchmark taken before schema v66 and on one that
      held fewer than two of the three vowels. */
  resonanceScale: number | null;
}

/** A practice take: how a session went with nothing to compare it against
    (phase 8 features ticket 10). `minHz`/`maxHz` are true extremes, not the
    percentile span VoiceBenchmark reports - see audio/practiceTake.ts for
    why that is the honest figure here and not there. `feltSense` is the
    app's own five-level mood scale (moodFace.ts) and is optional. No
    `sealedUntilEpochDay`: the day a take's figures become visible is always
    `epochDay + 1`, so ADR-0010 asks for that computed at the point of
    reading (sealedUntil.ts) rather than stored a second time. */
export interface VoicePracticeTake {
  id: string;
  epochDay: number;
  minHz: number;
  maxHz: number;
  medianHz: number;
  feltSense: number | null;
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
  /** The presentation this entry was logged under (phase 5 deepening
      ticket 17, ADR-0048, CONTEXT: "Presentation") - a domain id (uuid) or
      null. An entry holds at most one, and null is a resting state rather
      than a gap: most entries carry none, and the fluidity engine's chip
      never pre-fills the last one used. */
  presentationId: string | null;
}

/** A dated note an entry's owner added afterwards, on rereading (phase 8
    features ticket 07, CONTEXT: "Margin note"). Owned by exactly one entry,
    which never travels here (`FeltSenseEntry`'s own reasoning: the caller
    already knows which entry it asked for). Never the entry's own `note` -
    the two are stored, read and rendered apart on purpose, so that adding,
    editing or removing one can never touch the other. */
export interface MarginNote {
  id: string;
  /** The day the note itself was written, not the entry's day - a fact
      about when the person looked back (ADR-0010), fixed at creation. */
  epochDay: number;
  text: string;
}

/** A named way of showing up that a person moves between repeatedly - "mode"
    on screen, after the vernacular (phase 5 deepening ticket 17, ADR-0048,
    CONTEXT: "Presentation"). Owns a name and a colour and nothing else: no
    scales, no body regions, no tags - `prefs.activeScales` keeps sole
    ownership of which scales the editor offers. Nothing ships built in
    (ADR-0048: the app assumes nothing about direction), so unlike Tag or
    GenderDimension there is no `builtIn` flag. */
export interface Presentation {
  id: string;
  name: string;
  /** An index into the active flag's roles (theme/roles.ts's `roleAt`),
      never a hex - resolved at render time so a palette switch recolours
      every presentation for free. `roleAt` resolves any stored value by
      modulo, so no stored index can dangle. */
  roleIndex: number;
  /** Hides rather than deletes (CONTEXT: "Hidden") - a hidden presentation
      drops out of the entry editor's chip while every entry that already
      carries it keeps it. */
  hidden: boolean;
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
  /** What happened, in the person's own words (ticket 15). Empty rather
      than null - every read treats an unwritten description the same as
      the milestones that predate this field. */
  description: string;
  templateKey: string | null;
  roadmapGoalKey?: string | null;
  /** Linked surgical procedure uuid (phase 5 ticket 12, ADR-0045). */
  procedureId?: string | null;
  /** Linked tryout uuid, set on adoption (phase 5 deepening ticket 22,
      ADR-0045). Nulled out the same way procedureId is when the tryout it
      names is deleted. */
  tryoutId?: string | null;
  photo: Photo | null;
  /** Resolved alongside the row for the provenance line (phase 5 deepening
      ticket 22): a linked procedure's or tryout's own name, and a custom
      roadmap goal's own text where roadmapGoalKey names one. Never stored
      and never archived - a built-in goal's title is a compiled string
      resolved by key in code instead (provenance.ts), and everything here
      re-resolves fresh from whichever journal the row is read out of. */
  procedureName?: string | null;
  tryoutLabel?: string | null;
  customRoadmapGoalText?: string | null;
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

/** One line of the person's own comfort list (phase 6 ticket 14, CONTEXT:
    "Comfort list"): who to text, which walk, which playlist - entirely
    their own words, with nothing shipped by the app behind it, the same
    distinction ChecklistItem's own doc comment draws. */
export interface ComfortItem {
  id: string;
  text: string;
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

/* An episode's end is a stored, explicit day, set only by the "end this
   episode" action (phase 5 ticket 38) - not inferred from another episode
   starting. Before ticket 38 the end was never stored (ADR-0010): the day
   before the next episode's start, or "ongoing" for the latest one. That
   derivation stops holding once two episodes for different drugs can
   overlap on purpose - there is no longer a single "next" episode to read
   an end off, so the person's own act of ending one is the only source
   left for that fact. Null while an episode is still going. */
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
  endEpochDay: number | null;
  /** Why the episode ended, set only alongside `endEpochDay` by the "end
      this episode" action (ticket 43) - never editable on its own, and
      never assignable while `endEpochDay` is null, the same way the day
      itself cannot be. Null on every episode ended before this ticket, and
      cleared again if the end day is ever reopened, because a reason with
      no end day is meaningless. */
  endReason: EpisodeEndReason | null;
}

/** Three ways a course can stop, drafted in the ticket rather than guessed
    at later (CONTEXT: "Regimen episode", ticket 43) - switching to a
    different drug or route, a pause with no plan yet to resume it, or a
    deliberate stop. None is preferred over another, mirroring `PauseReason`'s
    own rule below. */
export type EpisodeEndReason = 'switchedDrugOrRoute' | 'pausedForNow' | 'decidedToStop';

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
  /** Which drug this dose was, in the dose's own words - optional, and null
      on almost every dose (phase 5 ticket 38). Attribution still resolves
      from the episode history first (regimenEpisode.ts's attributeDose);
      this only breaks a tie when more than one episode is active at the
      dose's timestamp and names a different drug, which cannot happen
      while at most one episode is ever active at once. A dose with no
      drug of its own and no single active episode to fall back on is
      attributed to nothing, not guessed at. */
  drug: string | null;
}

/* A dose event is its own record type, not an Entry: it carries no mood, no
   dimension values, no tags and no note, and CONTEXT.md's Entry is closed
   over exactly those five fields.

   It stores no regimen episode of its own, and usually no drug either.
   Attribution is attributeDose(episodes, dose) at read time
   (regimenEpisode.ts), so backdating a dose - or inserting a corrective
   episode underneath it - changes the answer with no stored link to
   rewrite (ADR-0010) for the common case of one episode active at a time.
   `drug` exists only to break the tie once concurrent episodes for
   different drugs make that resolution ambiguous (ticket 38).

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

/** A dated break from journaling (phase 5 ticket 21, CONTEXT: "Journaling
    pause"). No episode reference: unlike DosePause above, this has nothing
    to do with a regimen. Null end day means the pause is still running, the
    same reasoning DosePause.endEpochDay gives. Whether a day falls inside
    one is `journalingPause.ts`'s `pauseCoversDay`. */
export interface JournalingPause {
  id: string;
  startEpochDay: number;
  endEpochDay: number | null;
}

/** A search somebody kept a name for (phase 8 features ticket 06, CONTEXT:
    "Saved question"). The same shape `EntrySearchFilters` already has, plus
    the free-text `queryText` and the name it opens under - so building the
    filters back out of a saved row is a direct read, never a second
    computation of what a search of it means (see savedQuestionQuery.ts). */
export interface SavedQuestion {
  id: string;
  name: string;
  queryText: string;
  tagIds: string[];
  moods: number[];
  startEpochDay: number | null;
  endEpochDay: number | null;
  hasNote: boolean;
  hasPhoto: boolean;
}

/** A named stretch of the person's own timeline (phase 6 ticket 01,
    ADR-0049, CONTEXT: "Era") - "before I knew", "first year", "after I
    moved". Owns a name and two bounds and nothing else: no colour, no mute
    rule, no photo policy, for the reason Presentation owns none. Anything
    hung on it becomes a second place to configure the app, and the second
    such thing makes this the only place two rules can be read together.

    Both bounds are nullable, and the two invariants that make an era-filtered
    read a partition rather than a double-count are in `eras.ts`: at most one
    era with no start, at most one with no end, and no two overlapping. */
export interface Era {
  id: string;
  name: string;
  /** Absent means the era reaches back before the journal does. */
  startEpochDay: number | null;
  /** Absent means it is still running, the same reasoning
      JournalingPause.endEpochDay gives. */
  endEpochDay: number | null;
}

/* No episode reference (CONTEXT: "Side effect"): this record stands alone
   and has to work before a regimen episode exists. */
export interface SideEffect {
  id: string;
  name: string;
  /** 1 (barely noticeable) to 5 (severe), or null: the sheet asks for a
      grade and does not require one (phase 8 features ticket 23). */
  severity: number | null;
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
/* Which practice the session was (phase 8 features ticket 50, ADR-0064).
   Closed to three and staying closed: each one carries its own wording and
   its own safety facts, so a fourth value would be a set of strings nobody
   wrote rather than a row the app could still draw. */
export type WearKind = 'binder' | 'tucking' | 'compression';

export interface WearSession {
  id: string;
  /** Set at creation, never blank (schema v71): every user-facing string
      about this session, and whether it can carry a duration cue at all,
      is picked by it. */
  kind: WearKind;
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

/** Which of a preset's two directional dimensions a roadmap goal, milestone
    template, or regimen template speaks to most (phase 5 ticket 43, CONTEXT:
    "Lean") - `femme`, `masc`, or `neutral` when it speaks to neither.
    Authored by hand per item, since none of the three has dimensions of its
    own to derive one from. Never used to hide, filter, or gate: it only
    orders a picker so whichever matches the active preset sorts first. */
export type Lean = 'femme' | 'masc' | 'neutral';

export interface MilestoneTemplate {
  key: string;
  name: string;
  lean: Lean;
}

/** A person's own suggestion for an entry (phase 4 features ticket 17,
    folded into a stored row by phase 6 ticket 07, ADR-0002): picking one
    pre-fills `tags`, `dims`, `noteScaffold` and `presentationId` on the
    entry being created. What the user saves from it is an ordinary Entry,
    and every pre-filled value stays editable up to save - a template only
    ever seeds the draft, never gates it.

    `id` is the row's travelling identity, the seeded key for a built-in or
    the minted uuid for one the person authored (ADR-0002) - `builtIn` is
    exactly `id` having come from a key. A former guided prompt is a
    template whose only content is `noteScaffold`: empty `tags`, empty
    `dims`, no `presentationId`, the same shape any newly authored
    scaffold-only template has, which is what lets the entry-creation
    banner keep drawing from this one list rather than a second concept. */
export interface EntryTemplate {
  id: string;
  name: string;
  tags: string[];
  dims: Record<string, number>;
  noteScaffold: string;
  presentationId: string | null;
  builtIn: boolean;
  hidden: boolean;
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
  lean: Lean;
}

/** A stable key into `personal_effect_type` (migrations.ts v39) - an open
    vocabulary now, not a closed union. Phase 4 ticket 07 closed this list
    at four feminizing markers; phase 5 ticket 02 reopened it once to
    reach trans-masc parity and closed it again at eight, calling that
    closure final. Phase 5 ticket 41 is the third revisit and stops
    closing it: roughly forty feminizing and thirty masculinizing
    built-ins, plus whatever a person adds of their own, the same
    `key: string` a `MeasurementType` or `BodyRegion` uses rather than a
    string-literal union `labels.ts` would otherwise have to cover
    exhaustively. "Masculinizing fat redistribution" stays a distinct key
    from "fat redistribution" - the two describe different, not opposite,
    changes - and every existing key from the eight is unchanged. */
export type PersonalEffectType = string;

/** Which of the source material's two time-course tables a built-in
    effect's window is a claim about, and so which hormone it names
    (phase 4 ticket 07, widened phase 5 ticket 41). A property of the
    effect, not a field ever stored on a marker or asked of a person - the
    app has no gender or direction field and this does not become the
    first one. Null only for a custom effect: a person's own addition
    carries no direction pushed onto it by this app, and renders in
    neither the feminizing nor masculinizing group of the timeline. */
export type EffectDirection = 'feminizing' | 'masculinizing';

/** A named, toggleable collection over the effect catalogue (phase 5
    ticket 41, CONTEXT: "Effect category"), the same semantics as `TagGroup`
    - turning one off hides its effects from the timeline and the "mark a
    change" picker without touching any marker already recorded against
    them. Built-in only: five or six categories taken from the source
    material's own grouping, no custom-category creation asked for, so
    unlike `TagGroup` there is no `builtIn` flag or per-row add. */
export interface EffectCategory {
  key: string;
  name: string;
  enabled: boolean;
}

/** One row of the effect catalogue itself - what `personal_effect.effect`
    is allowed to name, now that migrations.ts v39 has dropped the CHECK
    that used to enumerate it. Built-in rows are seeded by key and
    localized at display time (`labels.ts`), the same split `BodyRegion`
    and `MeasurementType` use; a custom row's `name` is stored verbatim,
    never translated and never reseeded, and its `key` is the uuid minted
    for it (ADR-0002). `categoryKey` is nullable because a custom effect
    may be added uncategorised, and `direction` is nullable for the reason
    `EffectDirection` gives - only a built-in's direction is a claim from
    the literature or the community catalogue it comes from. */
export interface PersonalEffectCatalogEntry {
  key: string;
  name: string;
  builtIn: boolean;
  hidden: boolean;
  categoryKey: string | null;
  direction: EffectDirection | null;
}

/* One row per effect (migrations.ts v12, widened v37), matched exactly
   like MedicationStock's drug: a person is always answering "when did I
   first notice this", never logging a series of sightings. No episode
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

/* A day chosen to see one entry again (phase 8 features ticket 08, ADR-0045:
   "the arrival offers and never mints"). `entryId` is the entry's ordinary
   numeric id - the way every other screen already addresses an entry - not
   its uuid; the row's own portable identity lives only in the schema
   (revisits.ts), the same split milestone.procedureId's plain-text FK
   already draws between an app-facing id and a storage-level one. One row
   per entry: choosing a new day replaces the old one rather than piling up
   a second offer for the same entry (ticket's own "keyed by entry and
   day"). */
export interface Revisit {
  id: string;
  entryId: number;
  entryEpochDay: number;
  createdEpochDay: number;
  targetEpochDay: number;
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
  /** When this container was opened (ticket 13, "What is open, and until
      when"). Null until a person types one. */
  openedEpochDay: number | null;
  /** As typed, or null when an end date was typed instead - never derived
      from `inUseEndEpochDay` (inUseWindow.ts). */
  inUseWindowDays: number | null;
  /** As typed, or null when a window in days was typed instead - never
      derived from `inUseWindowDays`. */
  inUseEndEpochDay: number | null;
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

/** One consult on the way to a procedure, as the procedure's own screen
    reads it (phase 5 ticket 07): a date, and the minted id that lets one
    mistyped date be dropped on its own (ADR-0002).

    Since phase 8 features ticket 57 this is a projection of `Appointment`
    rather than a record of its own - the same rows, narrowed to what the
    surgery journey shows about them. The word survives because a procedure
    still shows its consults (ADR-0066); the second table did not. */
export interface ProcedureConsult {
  id: string;
  epochDay: number;
}

/** One appointment (phase 8 features ticket 57, ADR-0066, CONTEXT:
    "Appointment"): the day, a kind the person names, where it was, a note,
    and an optional link to the procedure it belongs to.

    A consult is this record with `procedureId` filled in - not a different
    kind of thing - which is why there is one table and one type rather than
    a sibling for each. Everything but the day is optional, because an
    appointment is usually written down before there is anything to say
    about it.

    `kind` is free text with nothing shipped in either language (ADR-0066):
    a built-in list of endocrinologist, psychologist, surgeon would be a
    picture of a medical path, and the app has no opinion about whether a
    court hearing is an appointment. Its suggestions come off this journal's
    own previous kinds (`getKinds`). */
export interface Appointment {
  id: string;
  epochDay: number;
  /** The procedure this belongs to, or null for an appointment that stands
      on its own - which is most of them. */
  procedureId: string | null;
  kind: string | null;
  place: string | null;
  note: string | null;
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

/** One stretch of a dilation taper (phase 8 features ticket 12, CONTEXT:
    "Taper"): a session every `everyNDays` days, for `days` days, before the
    next stage takes over. Typed in from the person's own surgeon's plan,
    never a default this app ships (out of scope, ticket 12). */
export interface TaperStage {
  everyNDays: number;
  days: number;
}

/** The dilation schedule the person has typed in (ticket 12). One per
    journal: `startEpochDay` is when the stage sequence begins, which is
    usually a few days after `surgeryEpochDay` rather than the same day -
    the two are kept apart because the chart's axis (day since surgery) and
    the schedule's own clock (day since the taper started) answer different
    questions. Editable in place, because a surgeon changes the plan; the
    expansion to expected sessions is pure arithmetic over this and today
    (taperSchedule.ts) and is never itself stored (ADR-0010). */
export interface Taper {
  id: string;
  surgeryEpochDay: number;
  startEpochDay: number;
  stages: TaperStage[];
}

/** One dilation session actually done (ticket 12). Nothing required beyond
    the day it took place - this is a logging surface, not an adherence
    tool, and a session with nothing to add still counts. */
export interface TaperSession {
  id: string;
  epochDay: number;
  note: string;
}

/** The four kinds of thing a document can link to (phase 8 features ticket
    56, ADR-0065). Closed rather than `ChecklistOwner`'s open `kind: string`:
    the ticket refuses a fifth kind, so the type refuses one too. */
export type DocumentTargetKind = 'goal' | 'milestone' | 'procedure' | 'episode';

/** A document's own link (ticket 56): at most one, to a roadmap goal, a
    milestone, a procedure or a regimen episode. `id` is that thing's own
    uuid for three of the four kinds, and for 'goal' is either a pack-and-key
    string or a custom goal's uuid - the same duality
    `Milestone.roadmapGoalKey` already stores in one column. */
export interface DocumentTarget {
  kind: DocumentTargetKind;
  id: string;
}

/** One piece of paper the person keeps (phase 8 features ticket 52,
    ADR-0065, CONTEXT: "Document"): an opinion, a diagnosis, a court ruling,
    a referral. The app never reads it - no OCR, no text extraction, no
    search over what it says - so the fields beside the file are the whole
    record, and `title` is the person's own summary and the only handle
    search has on it.

    `JournalDocument` rather than `Document`, which is the DOM's own global:
    a screen importing this type would shadow it, and a type that means one
    thing in `data/` and another everywhere else is not worth the shorter
    name.

    `epochDay` is the day the paper is *from*, not the day it was scanned in,
    which is what makes a shoebox of prints from 1994 importable.

    `fileName` is the same opaque `<uuid>.jpg` a photo carries
    (photos/names.ts) - an image document goes through the existing
    normalisation, so it has a derived thumbnail beside it like any other
    photo.

    `targetKind`/`targetId` are the checklist owner pair (`ChecklistOwner`)
    over the fixed `DocumentTargetKind` set instead of that type's open
    string, kept as two flat fields rather than one nested `DocumentTarget`
    because `flatArea` (this area's own writer, documents.ts) maps one
    domain field to one column and has no join to offer; `documentTarget()`
    (documents.ts) is the combined read a caller wants instead. Both null
    until the person files this under something (ticket 56), both set
    together (schema CHECK). Deleting a milestone, a procedure or a custom
    roadmap goal nulls them (documents.ts); a regimen episode has no delete
    to null them from (regimen.ts) and a built-in goal has no row to delete
    (roadmap.ts), so a link to either cannot dangle in practice today. */
export interface JournalDocument {
  id: string;
  epochDay: number;
  title: string;
  fileName: string;
  targetKind: DocumentTargetKind | null;
  targetId: string | null;
}
