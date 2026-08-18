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
}

/** A photo the editor drafted but nothing has saved yet: identity is
    minted on write, by the repository, never in a screen. */
export type DraftPhoto = Omit<Photo, 'id'>;

export interface Entry {
  id: number;
  epochDay: number;
  timestamp: number;
  mood: number | null;
  note: string;
  dims: Record<string, number>;
  tags: string[];
  photos: Photo[];
  /** By body-region key (bodyMap.ts), independent of dims and tags -
      ticket 09 does not require ticket 02's "physical" dysphoria tag to be
      present to log a region. */
  bodyRegions: Record<string, number>;
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
   has to work whether or not a regimen episode exists. */
export interface Measurement {
  id: string;
  type: 'waist' | 'hips' | 'chest' | 'underbust';
  epochDay: number;
  value: number;
  unit: string;
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

export type TryoutKind = 'name' | 'pronouns';

/** Trying out a name or a pronoun set (phase 4 ticket 16, CONTEXT:
    "Tryout"). `endEpochDay` is null while the tryout is still going - the
    same "still running" shape DosePause uses for a break with no end date
    yet - so a tryout in progress needs no placeholder end invented for it,
    and several tryouts can overlap or sit entirely in the past with no
    rule that exactly one of them is current.

    Which entries fall inside a tryout's range is never stored (ADR-0010):
    TryoutsArea owns only this row and its felt-sense history, and a
    screen reads the entries themselves through
    entries.searchEntries('', [], { startEpochDay, endEpochDay }), the
    plain date-range filter the search screen already offers. */
export interface Tryout {
  id: string;
  kind: TryoutKind;
  label: string;
  startEpochDay: number;
  endEpochDay: number | null;
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
export interface FeltSenseEntry {
  id: string;
  tryoutId: string;
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

/** How often an episode expects a dose, structured enough to generate
    slots from - which the episode's own free-text `interval` is not.
    Anchored to the episode's start day, so the progression is fixed by the
    episode rather than by when the schedule was written. One per episode. */
export interface DoseSchedule {
  id: string;
  /** A RegimenEpisode id. */
  episodeId: string;
  everyNDays: number;
  /** Twice-daily oral is 2. */
  dosesPerDay: number;
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

/* No episode reference (CONTEXT: "Side effect"): this record stands alone
   and has to work before a regimen episode exists. */
export interface SideEffect {
  id: string;
  name: string;
  /** 1 (barely noticeable) to 5 (severe). */
  severity: number;
  epochDay: number;
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

/** The four fixed markers a personal effects timeline tracks (phase 4
    ticket 07). Closed, like TallyKind: not an open-ended, user-extensible
    list of effects. "Hair changes" here is a single first-noticed date
    like the other three - ticket 09's Norwood-Hamilton staging and photo
    scheduling is a separate, deeper module the two coexist alongside. */
export type PersonalEffectType = 'breast_development' | 'fat_redistribution' | 'skin_softening' | 'hair_changes';

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

/** The published Norwood-Hamilton scale (phase 4 ticket 09), as the twelve
    stage labels the classification uses - including the "vertex" and "a"
    (anterior) variants at stages 3 and beyond. Closed, the way
    Measurement['type'] is: there is no sixth or "in-between" stage to add,
    the scale itself is the fixed vocabulary. */
export type NorwoodHamiltonStage = '1' | '2' | '2a' | '3' | '3v' | '3a' | '4' | '4a' | '5' | '5a' | '6' | '7';

/* A dated series like Measurement (ticket 08), not a single replaced value
   like PersonalEffect: a person re-stages over time to track progression,
   never answering "what is it now" in place of what it was before. No
   episode or anchor reference: what this is read against - the earliest
   finasteride/dutasteride/minoxidil dose - is resolved above this seam
   (hairTreatmentAnchor.ts), the same reason Measurement and PersonalEffect
   carry none either. */
export interface HairStage {
  id: string;
  epochDay: number;
  stage: NorwoodHamiltonStage;
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
