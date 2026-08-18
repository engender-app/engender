# Gender Diary

A local-first journal for tracking gender transition day by day. There is no
Gender Diary account or application backend. Journal data stays on the device
unless the person deliberately creates or delivers an archive.

## Language

### Journaling

**Journal**:
Everything this device holds about the user's transition: entries, photos,
milestones, vocabulary, lab results and reminders. Reached through one handle bound
to a database driver, which mints identity and owns every invariant; nothing else
touches storage. Portable preferences travel alongside it in an archive but are not
part of it.
_Avoid_: Store (the demo store was a different thing), database (the journal is what
is held, not where)

**Reference data**:
The part of the journal that is bounded at tens of rows and never paginated: gender
dimensions, presets, tag groups and tags, milestones, and preferences. Held in
memory and read synchronously, in contrast to entry data - entries, search, stats,
tag insights, recap - which is unbounded and read a query at a time. The split
decides which screens have a loading state.
_Avoid_: Metadata, lookup data, config

**Entry**:
One logged moment, carrying a mood, gender dimension values, tags, a note,
photos, voice recordings, and body-region intensities. A day can hold
several. Always holds at least one of those seven; an entry with none of
them does not exist.
_Avoid_: Log, record, check-in (a check-in is a daily prompt, not an entry)

**Photo**:
An image belonging to exactly one entry or exactly one milestone, held in
app-private storage and never in the device gallery.

**Voice recording**:
An in-app audio recording belonging to exactly one entry, held in the same
app-private storage a Photo is and covered by the same per-file encryption
(ADR-0020). Entry-only, unlike Photo: it has no milestone owner. Recorded
without leaving the app, and played back directly from the entry view with
no separate screen.

**Epoch day**:
Days since 1970-01-01 in the device's **local** timezone. The day an entry is
*for*, and the unit of calendar cells, milestones, lab results, and stats ranges.
Not a UTC day.
_Avoid_: Date, day index, day number

**Timestamp**:
Epoch milliseconds. The moment within a day, used only to order several entries on
the same epoch day. Never the source of which day an entry belongs to.

**Quick log**:
A mood-only entry saved from Home in one action, for right now.

**Milestone template**:
A built-in suggestion for a milestone, offered by key at creation time. What the
user creates from it is an ordinary milestone.

**Analyte**:
The substance a lab result measures. Carried with a free-text unit and never
interpreted or compared to a reference range. Never converted either, except
for a small built-in allowlist with a fixed physical conversion factor (e.g.
estradiol pg/mL and pmol/L), which may show a secondary converted value
alongside the native one - see ADR 0026. The native value stays primary and
the exception never applies to a free-text or unrecognized unit.

**Lab series**:
One line on a lab chart: the results of one analyte that share a unit. The unit
is the key, trimmed of surrounding whitespace and otherwise left alone, so two
spellings are two series and nothing is ever joined or converted. Results with
no unit form their own series. A key, not a judgement about what a unit means.
_Avoid_: Trend line, chart line, unit group

**Lab draw context**:
Where a lab draw fell relative to dosing, recorded on the result: hours since the
last dose for oral, sublingual, patch and gel, or **day of interval** for an
injection. Derived once, when the result is saved, from the dose log as it stood
then, and not recomputed afterwards - a dose corrected months later must not
rewrite the context on a result someone has already discussed at an appointment.
The one figure in this schema that is stored rather than derived on read, argued
where the columns are defined. Descriptive: it says where a draw fell and never
that one draw time is better than another.
_Avoid_: Trough level, peak level, optimal timing (all judgements this does not
make), draw window

**Day of interval**:
Which day of the current injection interval a draw fell on, counting the
injection day as day 1. Measured from the dose log alone, never from a **regimen
episode**'s free-text interval or from a **dose schedule** - a schedule is
optional, and a figure that needed one would go missing for anyone who logs
injections without setting it. Used instead of an hours figure for IM and SC,
where hours say nothing about a depot with a days-to-weeks half-life.

**Lab provider**:
Which lab drew a result. Free text, exactly as free as an **Analyte**'s unit: no
fixed list, no normalization, and no matching between two spellings of one lab.
_Avoid_: Laboratory name as an identifier, provider id

**Comparability flag**:
A note on a lab chart saying its **Lab series** holds points that were not drawn
under the same conditions - different positions in the dosing interval, different
routes, or different providers. It says so without splitting the series or
refusing to draw it, because the series-folding rule considers only the unit.
Points where a figure is simply absent are not a disagreement.
_Avoid_: Warning, invalid series, unreliable

**Mood**:
One of five discrete levels. Distinct from a gender dimension: it has no endpoint
labels and no configurable range.

### Gender tracking

**Gender dimension**:
One named thing an entry logs a number against, between two labelled ends, within
a range. Built-in or user-defined. Screens say **scale** to the person using the
app; everything the project says to itself says gender dimension.
_Avoid_: Axis, metric (metric means something else here), scale outside
user-facing wording

**Dimension value**:
One entry's number on one gender dimension. Belongs to the entry, not to the
preset that happened to be active when it was logged.

**Gender preset**:
A named set of gender dimensions.

**Active preset**:
The preset whose dimensions the entry editor offers by default. It governs what is
offered, never what an entry already holds.

### Dysphoria and euphoria

**Dysphoria type**:
One of seven named categories (physical, biochemical, social, societal, sexual,
presentational, existential) an entry can be tagged with, naming what kind of hard
day it was rather than just that it was hard.

**Euphoria capture**:
A one-tap tag for what felt right today, the positive counterpart to a dysphoria
type on the same entry.

**Tally event**:
One tap of the misgendering or correct-gendering counter, carrying only its kind
and an optional free-text context. Its own record type, not a variant of Entry
or quick log: no mood, dimension values, tags or note. The quantitative
counterpart to a social or societal dysphoria tag - a trend of how often, not
just that it happened on a given day.

### HRT and medication

**Regimen episode**:
A drug, ester, dose, route and interval combination as a dated range, in effect
until superseded by the next episode. Every entry, photo, measurement and lab
result is attributable to whichever regimen episode was in effect when it was
logged. Not a preference, portable or device-local: it is attributed data
every other record resolves against by timestamp, not a setting. Not a
Reminder either: a Reminder is a prompt to do something, while a regimen
episode is a record of what has been true since a given day.
_Avoid_: Regimen alone (ambiguous - always a specific, dated episode), prescription

**Dose event**:
One dose taken, skipped or changed, at a real time of day. Its own record type,
not an **Entry**: it carries no mood, dimension values, tags or note. What
fields it has depends on its route - an injection also records a site and a
vehicle, a patch or gel records an application site, and an oral or sublingual
dose records neither. It stores no regimen episode; the one it belongs to is
resolved from its timestamp, so backdating a dose moves it.
_Avoid_: Dose alone (that is the amount, a field on this), injection (only one
of six routes), medication log

**Dose event timestamp**:
The one timestamp in the app that is load-bearing data. An **Entry**'s
Timestamp only orders same-day entries and never decides which day an entry
belongs to; a dose event's says when the dose was actually taken, because
hours-since-last-dose is derived from it and sublingual estradiol peaks in one
to two hours.

**Dose schedule**:
How often one regimen episode expects a dose: every so many days, so many doses
per day. Structured, unlike the episode's own free-text interval, because slots
are generated from it. Counted from the episode's start day, so editing a
schedule does not shift the slots already generated. One per episode.
_Avoid_: Reminder (that is a prompt to act; this expects nothing of the user),
regimen interval

**Dose slot**:
One dose a **dose schedule** expected, on a given day and in a given position
within that day. Nothing stores a slot; they are computed from the schedule for
whatever range is being looked at. A slot is compared against what was logged,
and the comparison is presented without a target rate, a streak or a pass/fail
reading.
_Avoid_: Missed dose (a judgement; a slot with nothing logged is just that)

**Dose pause**:
A dated range on one regimen episode during which no dose is expected, marked
planned or accidental. Its end day may be empty, meaning the pause is still
running. Slots inside a pause are left out of the comparison, so a break does
not read as a run of missed doses. Neither reason is treated as better than the
other.
_Avoid_: Pause alone (ambiguous - always a pause in dosing), break, gap (a gap
is what a dose pause explains), stopping HRT

**Hormone curve**:
An estradiol curve over the dose log, drawn one of two ways depending on the
route. Injectable doses on one of the four **injectable esters** get a fitted
band; oral, sublingual, patch and gel doses get a **qualitative curve** instead,
because no published fit like the injectable one exists for these routes.
Nothing about either is stored - both are recomputed from the dose log and the
regimen episode history on every read. Descriptive, like everything else in
this track: no point on either is a target, an expected level or a normal one.
_Avoid_: Predicted level, estimated level, simulation (all claim more than
either curve does), hormone graph

**Injectable ester**:
Which ester a **regimen episode** is on, out of the four this app draws:
benzoate, valerate, cypionate and enanthate. Read from the episode's free-text
drug and ester fields against a built-in list of names in both catalogue
languages - the same fail-closed rule ADR-0026 applies to an analyte. Anything
else gets no curve rather than a guessed one: an unrecognized ester, a drug that
is not estradiol, and the two esters left out on purpose - polyestradiol
phosphate, which has no parameters this app can use, and estradiol undecylate,
whose published fit is too loose to be worth drawing (its plausible average
level spans more than tenfold, against about a third for these four). The bar
is the quality of the fit, not the ester's popularity.
_Avoid_: Ester alone (that is the free-text field on a regimen episode; this is
the closed vocabulary read out of it), unsupported ester (nothing is missing -
the published data is not good enough)

**Qualitative curve**:
A rise/plateau/fall shape over the dose log, for oral, sublingual, patch or gel
estradiol, with no compartment model or uncertainty math behind it - the
published fit the **injectable ester** curve rests on does not exist in that
form for these routes. Always a single line, the opposite of the injectable
curve's band: it carries no width to claim, because there is no posterior to
draw one from. Its height means nothing in pg/mL until an optional per-user
scale factor calibrates it against the reader's own lab results; unfitted, it
is drawn with no unit at all rather than a number this app cannot back up. On
screen it is labelled and shaped so it cannot be mistaken for the injectable
curve's band at a glance - its own heading, a permanent notice on every card, a
dashed line instead of a filled shape.
_Avoid_: Predicted level, estimated level, band, hormone graph (the injectable
curve's words), hypothetical curve (a different, removed idea - ticket 10's
undecylate curve was a real fit judged too loose to draw; this has no fit at
all to judge)

**Side effect**:
A symptom record - free-text name/type, a severity on a 1-5 ordered scale, and
an epoch day - structurally independent of the regimen episode: it carries no
episode reference and works whether or not one exists. Not an entry: no mood,
dimension values, tags or note. Purely descriptive - no severity level maps to
a recommendation, warning or escalation.
_Avoid_: Symptom (this app's own term is side effect), adverse event (implies
clinical reporting this is not)

### Reflection and retrospection

**Wrapped**:
A retrospective screen for a completed week, month or year, built on the same
`recap(fromEpochDay, toEpochDay)` seam as other reporting. Like a recap, nothing
about a wrapped is stored; opening one always recomputes from that range's
entries, milestones and photos.
_Avoid_: Report, summary

**On-this-day**:
A daily retrospective offering what was logged a month, six months or a year
before today. Only ever resurfaces a **good day** (below) - never a bad one.

**Good day**:
The bar a day must clear for on-this-day to resurface it: a day average mood at
or above the mood scale's midpoint, a euphoria capture logged that day, or
either. The rule, not just a definition: on-this-day must never show a day that
doesn't clear this bar.

**Doubt entry**:
A free-write record for a "not trans enough" spiral, timestamped and its own
record type - no mood, dimension values, tags or note (CONTEXT: "Entry").
Writing one surfaces the user's own past **euphoria capture**-tagged entries as
counterevidence, reached from a persistent Home affordance rather than the
normal new-entry flow.

**Counterevidence snapshot**:
A one-tap, saved copy of the counterevidence a doubt entry's composer was
showing at the moment of the tap, kept for rereading later rather than
re-derived on read - a euphoria-tagged entry edited, untagged or deleted
afterwards must not change what a past snapshot showed.

**Tryout**:
A name or pronoun set someone is trying, with a start date and an optional
end date once it is closed out. Several can exist at once, overlapping or
entirely in the past - nothing treats exactly one as "the current one".
Which entries fall inside a tryout's dates is read by date overlap alone,
never a stored link.

**Felt-sense entry**:
One point in a tryout's running record of how it has felt, on the app's
one **mood** scale. A tryout holds as many of these as someone adds over
its life, not a single rating fixed when it was created.

**Time-capsule letter**:
A free-write note to the person's future self, sealed until a chosen
unlock day. Whether it reads as sealed or unlocked follows from that day
and today, the same rule that decides a **milestone**'s countdown or
anniversary; nothing stores a sealed flag. The seal is enforced at the
UI layer only - the row carries no encryption beyond the journal's own
(ADR-0020) - and once the unlock day passes it stays readable for good.
_Avoid_: Time capsule (the letter is the record; there is no separate
container object)

### Vocabulary and retention

**Tag**:
A selectable label on an entry, belonging to exactly one tag group.
_Avoid_: Activity (Daylio's word, used only when describing Daylio import), label

**Tag group**:
A named, toggleable collection of tags. Turning a group off hides its tags from the
entry editor without touching entries that already carry them.

**Built-in**:
Seeded on first run and identified by a stable key, so the same concept is the same
thing on any device. Its display name is localized.

**Custom**:
Created by the user. Never translated, never reseeded.

**Hidden**:
Removed from every place a user picks things, while every past reference to it
survives. The default meaning of removing a tag or a gender dimension.
_Avoid_: Archived, disabled, deleted, soft-deleted

### Reading the journal back

**Metric**:
The single quantity that colours the Home strip and the calendar heat-map: either
mood or one chosen gender dimension.
_Avoid_: Colour metric, measure, dimension

**Day average**:
A day's metric, averaged across that day's entries, in native units. What a
calendar cell and a stats point stand for on a multi-entry day.

**Range**:
The lowest and highest value a metric can take: mood 1 to 5, a gender dimension
whatever it was defined with. Not the stretch of days a stats chart covers, which
the screens also call a range.
_Avoid_: Scale, bounds

**Native units**:
A value as it was logged, within its metric's own range. What every number shown
to a person is in, including charts, averages and tag insights.

**Normalized value**:
A value rescaled to 0 to 1, used only to drive colour intensity so that metrics
with different ranges shade comparably. Never displayed as a number.

**Streak**:
The run of consecutive epoch days, ending today or yesterday, on which at least
one entry exists. Backdating an entry into a gap repairs it.

**Best streak**:
The longest such run inside a stated range, wherever in the range it falls. What a
recap reports, and a different question from the streak, which always ends at
today. The two were confused once already: the recap showed the current streak
capped at 28.

**Milestone**:
A dated significant day, past or future, kept separately from entries. Whether it
reads as a countdown or an anniversary follows from its date and today; it is not
a stored property of the milestone.
_Avoid_: Event, occasion

**Countdown**:
How a milestone dated in the future presents.

**Anniversary**:
How a milestone dated in the past presents, recurring yearly.

### Care and reminders

**Reminder**:
A recurring or one-off prompt for a medication, injection or appointment, stored as
a rule (wall-clock time plus recurrence) rather than as a next-fire instant.
Android only, though it travels in an archive.

**Launch route**:
The in-app path a tapped notification or widget deep-links to, sanitized
against an allowlisted shape before it is followed. Checked twice, in two
languages that cannot import one another - once in Java before the WebView
exists, once in TypeScript once the route reaches the layout - and the two
checks are pinned against the same shared fixture rather than kept in sync by
hand (ADR-0028).

**Check-in**:
The daily prompt to log an entry, skipped on days that already have one. A
preference rather than a reminder: it has no name, no type and no recurrence
choice, and cannot be deleted.

**Affirmation**:
The optional affirming line the check-in carries beside its question, picked
per day from a pool written per language rather than translated between
languages. Part of the check-in's presentation, never its own prompt: it
cannot appear without a check-in, turning it off changes nothing else about
the check-in, and hiding notification titles hides it too.
_Avoid_: Quote, motivational message, daily quote

**Resource directory**:
The bundled list of trans organisations, helplines and reading, shipped with the
app rather than fetched. Trans-specific only: no general emergency or crisis
number, since a person already knows those and listing them buries the entries
they opened the screen for. Every entry carries a name, one line on what it
offers, and a number or an address; the screen carries the date a person last
checked all of them against what each organisation publishes, because hours go
stale long before numbers do. Opening it and touching anything on it makes no
network request, which is the point: a helpline has to be readable with no
signal. A tap hands the number to the phone or the address to the browser,
which leaves the app.
_Avoid_: Contact book (that is the excluded my-providers idea, and it would be
the person's own contacts rather than a bundled list), directory of providers
### The transition roadmap

**Country pack**:
A bundled set of **roadmap goals** describing one country's transition
procedure, compiled into the app rather than stored in the journal or fetched
over the network. Carries the date its legal and procedural content was last
checked against its sources, and shows it: Polish gender-recognition procedure
changes with legislation, so a reader needs to know how old what they are
reading is. Only the Polish pack ships, and the structure holds another
country's content with no schema change behind it.
_Avoid_: Locale (a pack is a country's procedure, not a language), checklist
(the pack is the content; the checklist is what a screen makes of it)

**Roadmap track**:
One of four groupings a roadmap goal belongs to: social, legal, presentational,
medical. A goal sits in exactly one. Nothing orders the tracks against each
other, and no track has to be finished before another can start.

**Roadmap goal**:
One step of a country pack's procedure, ticked off or not. Independently
checkable, which is the rule and not just a description: a goal never blocks or
unblocks another, and the order within a track is how the procedure usually runs
rather than something enforced. The tick is the only part that is the user's -
named by its pack and goal keys rather than a uuid, since both mean the same
thing on every device. Says what the procedure involves and never what someone
should do about their own situation.
_Avoid_: Milestone (a milestone is a dated thing that happened; a goal is a step
that may never be taken), task, to-do

### Privacy and access

**Data key**:
The random key the journal's contents are encrypted under. Never derived from an
access secret: the journal passphrase can wrap it as a portable secret, and a
device-bound mode can wrap it with storage tied to one browser profile or device.
Changing the access mode rewraps the key rather than re-encrypting the journal.
_Avoid_: Master key, database key (it covers photos and side files too)

**Journal passphrase**:
The portable secret that unlocks the encrypted journal after the previous
session has ended, on any installation using passphrase mode. Gender Diary cannot
recover it; it is distinct from both the app-lock PIN and an archive password.
_Avoid_: Master password, account password, PIN

**Device-bound mode**:
The local-only unlock mode with no typed journal passphrase on a cold start. The
key material stays tied to one browser profile or one device, so losing that
profile, that device or the local key can make that local journal copy
unrecoverable.
_Avoid_: Passwordless account, recovery mode, sync

**App lock**:
The PIN or biometric gate that limits casual access through the app. It can provide
shorter access during an unlocked session, but it is not the journal passphrase and
does not provide data-preserving recovery.
_Avoid_: Database password, encryption password

**Decoy home screen**:
The fake "Notes" home screen quick exit shows instead of a blank page while the
app is disguised, so what covers the tab matches the notes app the disguised name
and icon already claim. One static screen with nothing behind it: the notes on it
are fixed copy, nothing on it names the journal, and tapping anywhere returns to
whatever quick exit covered - with a PIN set, the lock screen.
_Avoid_: Fake app, mini-app, decoy mode

**Conversion**:
Turning a journal written before encryption existed into an encrypted one, on the
device that holds it. A one-time move of a whole journal, not a schema migration and
not an import: it carries every setting the archive format deliberately leaves
behind. It can be interrupted and resumed, and it never destroys the plaintext
journal until the encrypted one has been reopened and verified.
_Avoid_: Migration (that is a schema change), upgrade, import

**Conversion marker**:
The small file recording how far a conversion has got, so a boot after an
interruption knows which of the two journals on the device is the real one. Its
existence is what makes an unfinished conversion tellable from a finished one.
_Avoid_: Lock file, flag, checkpoint

### Getting data out

**Archive**:
The versioned, encrypted file produced by export and consumed by import. Holds
journal data and portable preferences only.
_Avoid_: Backup (backup names the habit, not the file), dump, export file

**Archive section**:
One area's rows as they travel in an archive, named by its key on the wire.
An area travels because it registers a section, which declares how its rows
are read out, how they are written back, and what has to be written before
them. An area with no section does not travel.
_Avoid_: Table (a section and a table do not correspond one to one - one
section can carry a row and its children)

**Backup**:
The habit and result of keeping an archive outside the current installation so the
journal can be restored after loss. A backup is an immutable snapshot, not a live
or bidirectional copy.
_Avoid_: Sync, replica

**Backup destination**:
The folder or document provider chosen to receive scheduled archives on Android.
It belongs to this installation and never travels in an archive.
_Avoid_: Cloud account, backup server

**Portable preference**:
A setting that describes the journal and travels in an archive: display name,
active preset, metric, palette, theme, language, and the check-in's time.

**Device-local preference**:
A setting that describes this installation and never leaves it: PIN hash, app-lock
and disguise flags, auto-export configuration, last-backup time. New preferences
are device-local unless deliberately added to the portable list.

**Merge**:
An import that adds what this device does not already have, leaving existing rows
alone.

**Replace**:
An import that discards this device's journal data and installs the archive's.
Built-in rows are reconciled by key rather than deleted, and device-local
preferences survive it.

**Folded text**:
Text reduced to its searchable form: lowercased and stripped of Polish letterforms,
including ł, which Unicode decomposition alone does not handle. Both the search
index and the query pass through the same folding.
