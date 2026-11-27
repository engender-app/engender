/* Domain types: the shape the journal speaks, not the demo
   store's and not the schema's. Storage details stay behind the journal
   seam - uuid columns, updated_at, the join tables. Built-ins are
   addressed by their seeded key and user rows by a minted uuid
   (ADR-0002), arriving here as the string `id`/`key` - except entries,
   which keep their integer rowid as the id: they are addressed locally
   only, and ADR-0002 keeps the FTS link and the join-heavy queries on
   integer rowids. An entry's uuid travels in archives, not here. */

import type { Cost } from './cost';
import {
  CYCLE_EVENT_KINDS,
  EFFECT_DIRECTIONS_STORED,
  HAIR_REMOVAL_METHODS,
  TRYOUT_KINDS
} from './rowValues';

export interface Photo {
  id: string;
  /** The opaque `<uuid>.jpg` the file store holds, resolved against a root
      the platform picks (photos/names.ts). Null means no stored file: the
      demo persona's placeholders, which render as the gradient PhotoThumb
      otherwise uses while loading. A photo row always has one. */
  fileName: string | null;
  /** Chosen counterevidence. Curation metadata, not content - a photo's owner never changes
      because of it. */
  starred: boolean;
}

/** A photo the editor drafted but nothing has saved yet: identity is
    minted on write, by the repository, never in a screen. */
type DraftPhoto = Omit<Photo, 'id'>;

/** An in-app audio recording belonging to exactly one entry. Entry-only, unlike Photo: no
    milestone owner. One file per row, unlike Photo: nothing normalizes or thumbnails a
    recording (out of scope by the ticket - no client-side audio effects), so `fileName`
    names the one file the entry's playback reads. */
export interface VoiceRecording {
  id: string;
  fileName: string;
}

/** A voice benchmark belongs to a day and holds acoustic measurements from
    a standard sample. Vowel measurements are nullable as a group when the
    sample has no usable vowel. note holds the person's words.
    Derive the pitch name from f0MedianHz (ADR-0010). */
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
      audio/track.ts. Null on every benchmark
      taken before schema v58, which kept only the figures - a screen with
      one of those in hand draws no take rather than an empty chart. */
  pitchTrack: string | null;
  /** What recorded it (audio/captureChain.ts, ADR-0061), null on a
      benchmark taken before schema v65. */
  captureChain: string | null;
  /** The corner-vowel scaling factor (audio/vowelScale.ts), null on a benchmark taken
      before schema v66 and on one that held fewer than two of the three vowels. */
  resonanceScale: number | null;
}

/** A practice take: how a session went with nothing to compare it against.
    `minHz`/`maxHz` are true extremes, not the
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

/** A short in-app video recording belonging to exactly one entry. VoiceRecording's shape,
    and its own interface rather than a shared one for the reason journal/videoNotes.ts
    gives: a rename on one must not silently change the other. One file, no thumbnail - a
    poster frame would be derived state (ADR-0010). */
export interface VideoNote {
  id: string;
  fileName: string;
}

/** Which side of a body region's shared 0-100 scale (bodyMap.ts) something
    is asking for - dysphoria below the midpoint, euphoria above it. Reads
    stay split by side rather than netting the two into one
    signed number: that would rank one side against the other, which is the
    signed number: that would rank one side against the other. */
export type BodyRegionAxis = 'dysphoria' | 'euphoria';

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
  /** By body-region domain id (journal/bodyRegions.ts), independent of dims and tags - does
      not require "physical" dysphoria tag to be present to log a region. A region's value
      is one position on the shared 0-100 scale (bodyMap.ts), dysphoria below the midpoint
      and euphoria above it; a region is present here only when it has something to say, so
      one left at the midpoint is dropped on save rather than stored blank. */
  bodyRegions: Record<string, number>;
  /** Chosen counterevidence. Sits outside the seven-field content closure above - the same
      category the uuid/day/timestamp identity fields already are - so it never enters
      entryIsEmpty()'s count and starring an entry can never be what keeps it from being
      empty. Joins 'g-euphoria'-tagged entries in the doubt journal's counterevidence pool
      (entries.ts, counterevidencePool). */
  starred: boolean;
  /** The presentation this entry was logged under (ADR-0048) - a domain id (uuid) or null.
      An entry holds at most one, and null is a resting state rather than a gap: most
      entries carry none, and the fluidity engine's chip never pre-fills the last one used. */
  presentationId: string | null;
}

/** A dated note an entry's owner added afterwards, on rereading. Owned by exactly one
    entry, which never travels here (`FeltSenseEntry`'s own reasoning: the caller already
    knows which entry it asked for). Never the entry's own `note` - the two are stored, read
    and rendered apart on purpose, so that adding, editing or removing one can never touch
    the other. */
export interface MarginNote {
  id: string;
  /** The day the note itself was written, not the entry's day - a fact
      about when the person looked back (ADR-0010), fixed at creation. */
  epochDay: number;
  text: string;
}

/** A named way of showing up that a person moves between repeatedly - "mode" on screen,
    after the vernacular (ADR-0048). Owns a name and a colour and nothing else: no scales,
    no body regions, no tags - `prefs.activeScales` keeps sole ownership of which scales the
    editor offers. Nothing ships built in (ADR-0048: the app assumes nothing about
    direction), so unlike Tag or GenderDimension there is no `builtIn` flag. */
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
  /** Own tags only: the name of the icon a person picked from tagIcons.ts,
      absent for none. A built-in's icon is looked up by its id instead. */
  icon?: string;
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
  /** What happened, in the person's own words. Empty rather
      than null - every read treats an unwritten description the same as
      the milestones that predate this field. */
  description: string;
  templateKey: string | null;
  roadmapGoalKey?: string | null;
  /** Linked surgical procedure uuid (ADR-0045). */
  procedureId?: string | null;
  /** Linked tryout uuid, set on adoption (ADR-0045). Nulled out the same way procedureId is when the tryout it
      names is deleted. */
  tryoutId?: string | null;
  /** False when the person asked for no celebration on Home, on the day
      and on every anniversary. Absent reads as
      true, the resting state of every milestone. */
  celebrate?: boolean;
  photo: Photo | null;
  /** Resolved alongside the row for the provenance line: a linked procedure's or tryout's own name, and a custom
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
  time: string;
  recurrence: 'DAILY' | 'EVERY_N_DAYS' | null;
  /** EVERY_N_DAYS only. */
  interval: number | null;
  /** EVERY_N_DAYS only: a day the reminder fires on, fixing the progression. */
  anchorEpochDay: number | null;
  /** One-off only (recurrence null): the concrete day. */
  epochDay: number | null;
  enabled: boolean;
  /** Which feature manages this reminder on this person's behalf, e.g. `stock:estradiol
      valerate` (stockReminder.ts). Null for every reminder a person created themselves. The
      general reminders editor never sets this, so saving a reminder through it - even one
      that started out managed - clears it: that is the handoff this field exists to record. */
  autoSource: string | null;
  /** The drug a medication reminder is for, in the regimen's own words,
      or null for any other reminder. Its
      notification opens that drug's dose log and offers Taken and Skip. */
  drug: string | null;
}

/* Record lab draw timing by route. Oral, sublingual, patch and gel
   use hours. IM and SC use day of interval. A discriminated union
   selects the value for each route.

   The stored context is an ADR-0010 exception. It preserves the dose
   log as known at the draw. Later dose corrections must not change
   a reviewed result's context. See schema.ts. */
export type LabTiming =
  | { route: 'oral' | 'sublingual' | 'rectal' | 'patch' | 'gel'; hoursSinceDose: number }
  | { route: 'im' | 'sc' | 'implant'; dayOfInterval: number };

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
  /** What the test cost (cost.ts). */
  cost: Cost;
}

/** One line of the person's own comfort list: who to text, which walk, which playlist -
    entirely their own words, with nothing shipped by the app behind it, the same
    distinction ChecklistItem's own doc comment draws. */
export interface ComfortItem {
  id: string;
  text: string;
}

/** What someone is trying out: a name or pronoun set, a style or makeup - one record type
    covering whatever is being tried, rather than a second type forked alongside this one
    for everything that is not a name or pronoun set. */
export type TryoutKind = (typeof TRYOUT_KINDS)[number];

/** A tryout can overlap other tryouts. A null endEpochDay marks one still running.
    Use description for detail beyond the label. The area owns the record,
    felt-sense history and photos. Read matching entries by date (ADR-0010). */
export interface Tryout {
  id: string;
  kind: TryoutKind;
  label: string;
  description: string | null;
  startEpochDay: number;
  endEpochDay: number | null;
}

/** One dated tryout photo. Its own shape rather than
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
    same reasoning that gives DosePause its own uuid. `mood` reuses the app's one five-level mood scale (CONTEXT:
    "Mood") rather than inventing a second one for the same kind of
    judgement.

    Belongs to one Tryout (CONTEXT: "Felt-sense entry"), which never
    travels here, the same reasoning `Photo` carries no owner id of its
    own - the caller already knows which tryout it asked for. */
export interface FeltSenseEntry {
  id: string;
  epochDay: number;
  mood: number;
  note: string | null;
}

/* An episode's end is a stored, explicit day, set only by the "end this episode" action -
   not inferred from another episode starting. the end was never stored (ADR-0010): the day
   before the next episode's start, or "ongoing" for the latest one. That derivation stops
   holding once two episodes for different drugs can overlap on purpose - there is no longer
   a single "next" episode to read an end off, so the person's own act of ending one is the
   only source left for that fact. Null while an episode is still going. */
export interface RegimenEpisode {
  id: string;
  drug: string;
  /** HRT or another drug. Only HRT episodes anchor the effects timeline, its onset bands
      and the hair anchor. Inferred from `drug` when an episode is made (drugClass.ts) and
      the person's to change after that. */
  drugClass: DrugClass;
  /** Nullable: antiandrogens and some routes have none. */
  ester: string | null;
  dose: number;
  doseUnit: string;
  route: string;
  interval: string;
  startEpochDay: number;
  endEpochDay: number | null;
  /** Why the episode ended, set only alongside `endEpochDay` by the "end
      this episode" action - never editable on its own, and
      never assignable while `endEpochDay` is null, the same way the day
      itself cannot be. Null on every episode ended before this ticket, and
      cleared again if the end day is ever reopened, because a reason with
      no end day is meaningless. */
  endReason: EpisodeEndReason | null;
}

/** Three ways a course can stop, drafted in the ticket rather than guessed at later -
    switching to a different drug or route, a pause with no plan yet to resume it, or a
    deliberate stop. None is preferred over another, mirroring `PauseReason`'s own rule
    below. */
/** Whether an episode is part of gender-affirming hormone therapy. Two
    values on purpose: the one question anything asks of it is "does this
    count as HRT starting". */
export type DrugClass = 'hrt' | 'other';

export type EpisodeEndReason = 'switchedDrugOrRoute' | 'pausedForNow' | 'decidedToStop';

/* The routes a dose can be taken by. A closed set,
   unlike a regimen episode's free-text `route`: what fields a dose carries
   depends on which route it was, so the app has to know the answer rather
   than carry whatever was typed. */
export type DoseRoute = 'oral' | 'sublingual' | 'rectal' | 'im' | 'sc' | 'implant' | 'patch' | 'gel';

/** Oil suspends an ester for slow release; an aqueous suspension does not.
    Injections only - nothing else has a vehicle to record. */
export type InjectionVehicle = 'oil' | 'aqueous';

/** Taken is the default. Skipped means the slot was expected and nothing
    was taken - the dose is still logged, so an adherence view can show the
    gap rather than infer it from an absence. Changed means it was taken,
    but not as scheduled. */
export type DoseStatus = 'taken' | 'skipped' | 'changed';

/** Who wrote the row. `person` is every dose logged by hand and every dose that existed
    before auto-logging did; `schedule` is one a schedule the person switched on wrote on
    their behalf.

    A field of its own rather than a fourth `DoseStatus`, because it answers a different
    question: status is what happened to the dose, source is who said so. A schedule-written
    dose can be `taken` or, once the person corrects it, `skipped`, and it keeps saying
    where it came from either way.

    The same job `autoSource` does for a Reminder (autoSource.ts), with none of its shape: a
    reminder names which feature and which row made it because the feature has to find its
    own row again, and nothing here ever needs to go back and edit a dose it wrote. */
export type DoseSource = 'person' | 'schedule';

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
  /** Epoch milliseconds, and load-bearing - unlike an Entry's Timestamp, which only orders
      same-day entries. derives hours-since-last-dose from this, and sublingual estradiol
      peaks in one to two hours, so a day would not be precise enough to derive anything
      from. */
  timestamp: number;
  dose: number;
  doseUnit: string;
  status: DoseStatus;
  source: DoseSource;
  scheduled: ScheduledDose | null;
  /** Provenance of a newly auto-logged row. The logged timestamp still
      records its time; this identity keeps its schedule slot through travel. */
  autoLogSlot?: { episodeId: string; epochDay: number; indexInDay: number };
  /** Which drug this dose was, in the dose's own words - optional, and null
      on almost every dose. Attribution still resolves
      from the episode history first (regimenEpisode.ts's attributeDose);
      this only breaks a tie when more than one episode is active at the
      dose's timestamp and names a different drug, which cannot happen
      while at most one episode is ever active at once. A dose with no
      drug of its own and no single active episode to fall back on is
      attributed to nothing, not guessed at. */
  drug: string | null;
}

/* attributeDose assigns the episode at read time (ADR-0010). Store a drug
   only to disambiguate concurrent episodes. The route determines which
   fields the dose can carry. */
export type DoseEvent =
  | (DoseEventFields & { route: 'oral' | 'sublingual' | 'rectal' | 'implant' })
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
  /** The day the person switched auto-logging on for this schedule, or null for off - the
      standing instruction "assume I took it unless I say otherwise".

      One nullable day rather than a boolean beside a day, because the pair has a state that
      means nothing: switched on with no day to start from. The day is what the walk needs
      anyway - nothing is ever written before it, so turning the switch on does not reach
      back over a gap the person never asked about, and turning it off and on again months
      later starts from the second day rather than filling in the months between. */
  autoLogFromEpochDay: number | null;
}

/** Planned is a break someone chose or a clinician directed; accidental is
    a gap that happened and is being recorded honestly. Both suppress
    expected slots - neither is judged. */
export type PauseReason = 'planned' | 'accidental';

/** A dated range on one episode during which no dose is expected, so a gap that was a break
    does not read as a missed dose - in the adherence view or in consumption-rate
    projection. */
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

/** A named stretch of the person's own timeline (ADR-0049) - "before I knew", "first year",
    "after I moved". Owns a name and two bounds and nothing else: no colour, no mute rule,
    no photo policy, for the reason Presentation owns none. Anything hung on it becomes a
    second place to configure the app, and the second such thing makes this the only place
    two rules can be read together.

    Both bounds are nullable, and the two invariants that make an era-filtered read a
    partition rather than a double-count are in `eras.ts`: at most one era with no start, at
    most one with no end, and no two overlapping. */
export interface Era {
  id: string;
  name: string;
  /** Absent means the era reaches back before the journal does. */
  startEpochDay: number | null;
  /** Absent means it is still running, the same reasoning
      DosePause.endEpochDay gives. */
  endEpochDay: number | null;
}

/* No episode reference (CONTEXT: "Side effect"): this record stands alone
   and has to work before a regimen episode exists. */
export interface SideEffect {
  id: string;
  name: string;
  /** 1 (barely noticeable) to 5 (severe), or null: the sheet asks for a
      grade and does not require one. */
  severity: number | null;
  epochDay: number;
  /** The day it resolved, or null while it is ongoing. Never before `epochDay`. */
  resolvedEpochDay: number | null;
}

/** The three states logs. Fixed rather than user-defined; 'nothing_this_month' is a real,
    loggable state here, not the absence of a row. */
export type CycleEventKind = (typeof CYCLE_EVENT_KINDS)[number];

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
/* Which practice the session was.
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

/* Preferences are not here: they live in SQLite's `pref` table and are described by
   prefs/catalogue.ts. Neither is a whole-journal type: the `DB` object the demo store held
   went with it, and what an archive carries is the archive module's own shape. */

/** Which of a preset's two directional dimensions a roadmap goal, milestone template, or
    regimen template speaks to most - `femme`, `masc`, or `neutral` when it speaks to
    neither. Authored by hand per item, since none of the three has dimensions of its own to
    derive one from. Never used to hide, filter, or gate: it only orders a picker so
    whichever matches the active preset sorts first. */
export type Lean = 'femme' | 'masc' | 'neutral';

/** A milestone the app suggests by name. No lean: every milestone template names a kind of event rather than a
    direction, so all eight were neutral and ranking them did nothing. */
export interface MilestoneTemplate {
  key: string;
  name: string;
}

/** A built-in suggestion for a `RegimenEpisode`: picking one pre-fills `drug`, `ester` and
    `route` only, the same shape `MilestoneTemplate` gives a milestone's name. `name` labels
    the picker row and is never itself written into the episode. Carries no dose or interval
    on purpose - those are where a suggestion starts reading as a recommendation, which this
    app's HRT tracking otherwise never does. What the user saves from one is an ordinary
    RegimenEpisode, with no stored link back to the template it came from. */
export interface RegimenTemplate {
  key: string;
  name: string;
  drug: string;
  ester: string | null;
  route: string;
  lean: Lean;
}

/** A stable key into `personal_effect_type` (schema.ts) - an open vocabulary now, not a
    closed union. closed this list at four feminizing markers; reopened it once to reach
    trans-masc parity and closed it again at eight, calling that closure final. is the third
    revisit and stops closing it: roughly forty feminizing and thirty masculinizing
    built-ins, plus whatever a person adds of their own, the same `key: string` a
    `MeasurementType` or `BodyRegion` uses rather than a string-literal union `labels.ts`
    would otherwise have to cover exhaustively. "Masculinizing fat redistribution" stays a
    distinct key from "fat redistribution" - the two describe different, not opposite,
    changes - and every existing key from the eight is unchanged. */
export type PersonalEffectType = string;

/** Which of the source material's two time-course tables a built-in effect's window is a
    claim about, and so which hormone it names. A property of the effect, not a field ever
    stored on a marker or asked of a person - the app has no gender or direction field and
    this does not become the first one. Null only for a custom effect: a person's own
    addition carries no direction pushed onto it by this app, and renders in neither the
    feminizing nor masculinizing group of the timeline. */
export type EffectDirection = (typeof EFFECT_DIRECTIONS_STORED)[number];

/** A named, toggleable collection over the effect catalogue, the same semantics as
    `TagGroup` - turning one off hides its effects from the timeline and the "mark a change"
    picker without touching any marker already recorded against them. Built-in only: five or
    six categories taken from the source material's own grouping, no custom-category
    creation asked for, so unlike `TagGroup` there is no `builtIn` flag or per-row add. */
export interface EffectCategory {
  key: string;
  name: string;
  enabled: boolean;
}

/** One row of the effect catalogue itself - what `personal_effect.effect`
    is allowed to name, now that the schema carries no CHECK
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

/* One row per effect (schema.ts), matched exactly
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

/** A hair-removal session's method: a small closed set
    rather than free text, so `hairRemovalMethodName` can give it a
    translated label the way a hair-staging grade does - 'other' is the
    escape hatch for anything the two named methods do not cover. */
export { HAIR_REMOVAL_METHODS };
export type HairRemovalMethod = (typeof HAIR_REMOVAL_METHODS)[number];

/** One electrolysis/laser session. A dated series like Measurement above, not a single
    replaced value: a person logs many sessions over time. `area` is a plain string rather
    than a literal union here, the same treatment DoseEvent's `injectionSite` gets: it is
    validated against hairRemovalAreas.ts's own closed vocabulary above the schema seam
    (journal/hairRemoval.ts), which is never the body-region vocabulary (BodyRegion above) -
    see hairRemovalAreas.ts's header for why the two stay separate. `painRating` is the same
    1-5 scale SideEffect.severity uses. `cost` and `provider` are both free text, matching
    LabResult.provider's own no-list, no-normalization treatment - there is no ledger here,
    only a per-session note of what was paid and to whom. */
export interface HairRemovalSession {
  id: string;
  epochDay: number;
  area: string;
  method: HairRemovalMethod;
  painRating: number | null;
  /** How long the session ran, in whole minutes; null when not written down. */
  minutes: number | null;
  /** What the session cost (cost.ts). The free-text cost before it was read into this, or
      into `note` where it did not parse, by version 115. */
  cost: Cost;
  provider: string;
  /** The person's own words on the session, or null. */
  note: string | null;
}

/* A free-write note to the person's future self, sealed until `unlockEpochDay`. No `sealed`
   flag: whether it is readable follows from comparing `unlockEpochDay` against today,
   computed above the seam by letterStatus.ts rather than stored (ADR-0010), the same
   reasoning that keeps `kind` off Milestone. The seal is a UI-level gate only - no second
   cryptographic layer sits under this row beyond the journal's existing whole-database
   encryption (ADR-0020). */
export interface Letter {
  id: string;
  epochDay: number;
  text: string;
  unlockEpochDay: number;
}

/** What a person last reported having of one drug. One per drug, matched by `sameDrug`
    (`RegimenEpisode.drug`'s own convention) rather than per episode - see schema.ts.
    Neither `quantity` nor `recordedEpochDay` is a running total: saving a fresh count
    replaces the old one outright, the way `DoseSchedule` replaces per episode, because a
    person reporting stock is always answering "how much do I have today", never "how much
    did I have last time plus what I have now". Remaining and its run-out day are never
    stored (ADR-0010) - stockProjection.ts derives both from this and the dose log on every
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
  /** When this container was opened. Null until a person types one. */
  openedEpochDay: number | null;
  /** As typed, or null when an end date was typed instead - never derived
      from `inUseEndEpochDay` (inUseWindow.ts). */
  inUseWindowDays: number | null;
  /** As typed, or null when a window in days was typed instead - never
      derived from `inUseWindowDays`. */
  inUseEndEpochDay: number | null;
  /** How many days a restock takes for this drug. Null is the normal state - the app
      assumes nothing until a person types one. Feeds `reorderByEpochDay`
      (stockProjection.ts) alongside the run-out day; never folded into the run-out
      projection itself. */
  leadTimeDays: number | null;
  /** How many doses one unit holds - five to a vial, say. Null means one dose per unit (stockProjection.ts). */
  dosesPerUnit: number | null;
  /** The day the supply held now expires.
      Logged and shown, never advised on: nothing reads it to warn. Null
      until a person types one. */
  expiryEpochDay: number | null;
  /** Where the supply came from, in the person's words - a pharmacy, a
      batch. Null when empty. */
  pharmacyNote: string | null;
  /** What the supply held now cost (cost.ts). There is no purchase log: a fresh count
      replaces it like the expiry. */
  cost: Cost;
}

/** A checklist's owner reference: `kind` names what kind
    of record owns it and `id` is that record's own travelling identity
    (ADR-0002). Not a closed union like PhotoOwner (photos.ts) - no owner
    table ships with this ticket, so the pair is what lets a future owner
    kind reuse this table with no schema change of its own. */
export interface ChecklistOwner {
  kind: string;
  id: string;
}

/** One line of a checklist: free text the user wrote, checked or not, and whether it is
    still open past whatever event closed its checklist's usual window - a visit, a
    procedure's recovery close-out. Never bundled content: unlike a **Roadmap goal**, there
    is nothing behind an item but what the user typed, the distinction CONTEXT already draws
    between Custom and Built-in. */
export interface ChecklistItem {
  id: string;
  content: string;
  checked: boolean;
  carriedForward: boolean;
}

/** An ordered list of checklist items, standalone or scoped to one owner record. recovery
    checklist and appointment prep list are both this same shape - the owner is what differs
    between the two call sites, not the item. */
export interface Checklist {
  id: string;
  owner: ChecklistOwner | null;
  items: ChecklistItem[];
}

/** The tri-state a roadmap goal's tick can hold: 'unchecked' is untaken, 'checked' is done,
    and 'not-my-path' says the step is not part of this person's own path rather than left
    undone. Stored the same way for a bundled goal (named by its pack and goal key) and a
    custom one (named by its uuid) - the two differ only in whether the row that carries it
    exists because of the tick or regardless of it. */
export type RoadmapGoalStatus = 'unchecked' | 'checked' | 'not-my-path';

/** A user-authored roadmap goal: free text someone added themselves, uuid-identified rather
    than named by a pack and a key the way a bundled goal is, and never translated or
    reseeded - the split CONTEXT already draws between Custom and Built-in. `track` says
    where it sits: 'legal' for the Polish legal steps, or the uuid of one of the person's
    categories. Appended to the end of its group; the roadmap already refuses ordering
    between goals (roadmap.ts), so creation order is all there is to keep. */
export interface CustomRoadmapGoal {
  id: string;
  track: string;
  text: string;
  status: RoadmapGoalStatus;
}

/** An institution the person added to the roadmap's list of name and
    document changes, beside the built-in ones
    roadmap.ts names. */
export interface RoadmapInstitution {
  id: string;
  name: string;
}

/** One dated change at an institution:
    submitted, waiting or done on `epochDay`, with an optional line of the
    person's own ("sent on to the kuratorium"). `institution` is a built-in
    institution's key or the uuid of one the person added. `status` is a
    string rather than the three words because the column carries no CHECK
    (the audit's CHECK policy): the write path and archive import both hold
    it to rowValues.ts's INSTITUTION_STATUSES, and a stored word outside
    them still renders, as "changed". */
export interface InstitutionChange {
  id: string;
  institution: string;
  status: string;
  epochDay: number;
  note: string | null;
}

/** A category the person made on the roadmap,
    to hold goals of their own beside the Polish legal steps. `name` is
    empty only on a category migration 111 made from a cut track, whose uuid
    is that track's key (roadmap.ts, LEGACY_ROADMAP_TRACKS). */
export interface RoadmapCategory {
  id: string;
  name: string;
}

/** What kind of surgery a procedure is: a
    compiled-in set of the trans surgeries the app can name, or `custom` for
    anything else, which keeps the record's free-text `name` as its only
    identity. The set gates which sub-modules a procedure's kind unlocks -
    dilation reads it - and nothing else; it is not a second name and the
    app never guesses it from what someone typed. */
export type ProcedureKind =
  | 'vaginoplasty'
  | 'vulvoplasty'
  | 'orchiectomy'
  | 'breast_augmentation'
  | 'facial_feminization'
  | 'tracheal_shave'
  | 'voice_surgery'
  | 'chest_reconstruction'
  | 'hysterectomy'
  | 'oophorectomy'
  | 'phalloplasty'
  | 'metoidioplasty'
  | 'body_contouring'
  | 'hair_transplant'
  | 'custom';

/** A procedure owns its name, date and recovery notes. Several can coexist.
    Appointments link by procedureId. Recovery day is derived (ADR-0010) and
    its checklist is a separate record. Read dilationOptIn only for custom kinds.
    The dilation gate recognizes vaginoplasty by kind. */
export interface Procedure {
  id: string;
  name: string;
  /** Null until a date is set, which is usually well after the record
      exists. */
  surgeryEpochDay: number | null;
  consults: ProcedureConsult[];
  notes: string;
  kind: ProcedureKind;
  dilationOptIn: boolean;
  /** Chosen by the person. Age never decides whether a procedure belongs in
      their archive. */
  archived: boolean;
  /** What the procedure cost (cost.ts). */
  cost: Cost;
}

/** One consult on the way to a procedure, as the procedure's own screen reads it: a date,
    and the minted id that lets one mistyped date be dropped on its own (ADR-0002).

    This is a projection of `Appointment` rather than a record of its own - the same rows,
    narrowed to what the surgery journey shows about them. The word survives because a
    procedure still shows its consults (ADR-0066); the second table did not. */
export interface ProcedureConsult {
  id: string;
  epochDay: number;
}

/** An appointment is a dated record (ADR-0066). A consult fills procedureId.
    Kind and other details are optional. getKinds suggests previous journal kinds. */
export interface Appointment {
  id: string;
  epochDay: number;
  /** The procedure this belongs to, or null for an appointment that stands
      on its own - which is most of them. */
  procedureId: string | null;
  kind: string | null;
  place: string | null;
  note: string | null;
  /** The day somebody was referred on, where this began as a wait,
      or null. Kept once the day is given, so
      the referral stays on its own day in the day view. */
  referredEpochDay: number | null;
  /** The time of day as `HH:MM` on a 24-hour clock, or null for a day with
      no time given. Only ever on a visit with
      a day: a wait has no time to keep. */
  time: string | null;
  /** Who it is with, the person's own `Provider` record, or null. */
  providerId: string | null;
  /** What the visit cost (cost.ts). */
  cost: Cost;
}

/** How a provider was with trans care, in the person's own judgement.
    Stored as the key; a key this build does
    not know reads as not said. */
export type ProviderCompetence = 'good' | 'mixed' | 'poor';

/** Somebody the person sees - a doctor, a psychologist, a clinic - as the
    person's own notes on them: how to reach
    them, how trans-competent they were, what they made of them. Attached
    to appointments as the "who". Never shared and never rated anywhere but
    here. */
export interface Provider {
  id: string;
  name: string;
  contact: string | null;
  competence: ProviderCompetence | null;
  impressions: string | null;
}

/** An appointment still waiting for its day: a referral to a clinic, an NFZ
    queue, a surgery list. The same record as
    `Appointment`, before it has a day. */
export type WaitingAppointment = Omit<Appointment, 'epochDay'> & { epochDay: null };

/** One dated update on an appointment's wait: "letter came", "phoned, still
    on the list". Free text; nothing ships a list of what a queue says. */
export interface AppointmentStatusUpdate {
  id: string;
  appointmentId: string;
  epochDay: number;
  status: string;
}

/** One row of the body-region reference-data area. Flat: a built-in's `name` is '' and its
    wording comes from the message catalogue by `id`; a custom region carries the name the
    person typed and is never translated. No location on the body-map illustration - a
    custom region is a named row with an intensity, listed rather than positioned. Hides
    rather than deletes, the same as a Tag or a GenderDimension, so a region's logged
    intensities keep resolving and charting after it is hidden. */
export interface BodyRegion {
  id: string;
  name: string;
  builtIn: boolean;
  hidden: boolean;
}

/** One stretch of a dilation taper: a session every `everyNDays` days, for `days` days,
    before the next stage takes over. Typed in from the person's own surgeon's plan, never a
    default this app ships.

    `timesPerDay` makes it "N times a day for D days" instead, which is how
    post-vaginoplasty schedules are given. A stage carrying it is saved with `everyNDays:
    1`, so a build that does not know the field reads it as a daily stage rather than as
    nothing. Absent means one session on each expected day. */
export interface TaperStage {
  everyNDays: number;
  days: number;
  timesPerDay?: number;
}

/** One schedule per journal. startEpochDay starts the taper, and procedureId
    supplies the surgery date from its owner. Edit the schedule in place and
    derive expected sessions in taperSchedule.ts (ADR-0010). */
export interface Taper {
  id: string;
  procedureId: string;
  startEpochDay: number;
  stages: TaperStage[];
}

/** One dilation session actually done. Nothing required beyond
    the day it took place - this is a logging surface, not an adherence
    tool, and a session with nothing to add still counts. */
export interface TaperSession {
  id: string;
  epochDay: number;
  note: string;
}

/** The four kinds of thing a document can link to (ADR-0065). Closed rather than `ChecklistOwner`'s open `kind: string`:
    the ticket refuses a fifth kind, so the type refuses one too. */
export type DocumentTargetKind = 'goal' | 'milestone' | 'procedure' | 'episode';

/** A document's own link: at most one, to a roadmap goal, a
    milestone, a procedure or a regimen episode. `id` is that thing's own
    uuid for three of the four kinds, and for 'goal' is either a pack-and-key
    string or a custom goal's uuid - the same duality
    `Milestone.roadmapGoalKey` already stores in one column. */
export interface DocumentTarget {
  kind: DocumentTargetKind;
  id: string;
}

/** Journal file with a user-supplied title (ADR-0065). Search indexes the
    title. epochDay dates the document itself. JournalDocument also keeps
    this type distinct from the DOM Document.

    Store a normalized image as <uuid>.jpg or the unchanged PDF as
    <uuid>.pdf. The image thumbnail comes from normalization and the PDF
    thumbnail from its first page. documents.ts resolves file kind and names.

    targetKind and targetId are flat columns, either both set or both null.
    Call documentTarget() for the combined owner. Removing a milestone,
    procedure or custom roadmap goal clears its links. Regimen episodes and
    built-in goals have no deletable row here. */
export interface JournalDocument {
  id: string;
  epochDay: number;
  title: string;
  fileName: string;
  targetKind: DocumentTargetKind | null;
  targetId: string | null;
}
