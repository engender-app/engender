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
dimensions, presets, tag groups and tags, milestones, body regions, measurement
types, effect categories and the personal-effects catalogue, and preferences. Held
in memory and read synchronously, in contrast to entry data - entries, search,
stats, tag insights, recap - which is unbounded and read a query at a time. The
split decides which screens have a loading state. Body regions joined this list in
ticket 30: the set is open, not the closed eight-key list it started as - a
built-in hides the same way a tag or a gender dimension does, and a custom region
is added the same way a custom tag is. The personal-effects catalogue joined it in
ticket 41, the same move.
_Avoid_: Metadata, lookup data, config

**Entry**:
One logged moment, carrying a mood, gender dimension values, tags, a note,
photos, voice recordings, and body-region feelings. A day can hold
several. Always holds at least one of those seven; an entry with none of
them does not exist.
_Avoid_: Log, record, check-in (a check-in is a daily prompt, not an entry)

**Body-region feeling**:
What one entry says about one body region: a dysphoria intensity, a euphoria
intensity, or both, each 0-100 and each optional. The two are independent
readings of the same part, not two ends of one scale, because both can be
true of it on the same day. Saying nothing on an axis is not scoring it 0,
which is what lets someone record that a region felt good rather than only
that it did not hurt. Never combined: the app derives no net, balance or
score across the two, and neither axis is the better one to have.
_Avoid_: Intensity on its own (it no longer says which of the two), pain
score, body dysphoria rating

**Photo**:
An image belonging to exactly one entry or exactly one milestone, held in
app-private storage and never in the device gallery.

**Starred**:
A boolean on an Entry or a Photo marking it as chosen counterevidence,
sitting outside Entry's seven-field content closure - the same category the
uuid/day/timestamp identity fields already are - so starring or unstarring
never changes whether an entry exists. Reachable from a starred shelf off
search, and joins euphoria-tagged entries in the doubt journal's
counterevidence pool (see **Doubt entry**).

**Voice recording**:
An in-app audio recording belonging to exactly one entry, held in the same
app-private storage a Photo is and covered by the same per-file encryption
(ADR-0020). Entry-only, unlike Photo: it has no milestone owner. Recorded
without leaving the app, and played back directly from the entry view with
no separate screen.

**Video note**:
A short in-app video recording belonging to exactly one entry, in the same
app-private storage and per-file encryption a Photo and a Voice recording use
(ADR-0020). Entry-only, like a Voice recording: no milestone owner. Recorded
without leaving the app and played back directly from the entry view, with no
separate screen. Capped at 30 seconds and 1080p with no setting to change
either, and re-encoded smaller if the captured file still exceeds the size
ceiling - ADR-0008's reasoning about archive size, where a video costs an
order of magnitude more per item than a photo.
_Avoid_: video, clip, recording (a Voice recording is the audio one)

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

**Measurement type**:
What a body measurement is of. The set is open, the same way a gender dimension's
is: waist, hips, chest and underbust are built in, and a person can add their own
alongside them (phase 5 ticket 29). Weight and height are deliberately absent from
the built-in four - the two most likely to pull a BMI figure in behind them - so
anyone who wants either adds it as their own.
_Avoid_: Metric (metric means something else here)

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

**Lean**:
One of three tags - femme, masc, neutral - a **roadmap goal**, **milestone
template**, or **regimen template** carries, read only to order a picker so
whichever matches the **active preset** sorts first and everything else follows
unchanged and still reachable. Never used to hide, filter, or gate anything.
Authored explicitly per item, since a goal or template carries no dimensions of
its own to derive one from. A preset's own lean is never stored: it follows from
whether it includes the `femininity` or `masculinity` dimension and not the
other - a preset with both, with neither, or with any other combination has no
lean, and every lean-tagged list renders unranked for it.
_Avoid_: Direction, persona, preset lean, leaning (as a noun)

### Dysphoria and euphoria

**Dysphoria type**:
One of seven named categories (physical, biochemical, social, societal, sexual,
presentational, existential) an entry can be tagged with, naming what kind of hard
day it was rather than just that it was hard.

**Euphoria capture**:
A one-tap tag for what felt right today, the positive counterpart to a dysphoria
type on the same entry. Three built-in tags carry it, read as equals rather than
one general tag plus two ordinary ones that happen to mention euphoria:
`g-euphoria` (general), `g-soc-eu` (social) and `g-body-eu` (body). Someone not
pursuing body changes tags social euphoria far more than the general tag, so
anything asking "did this day carry a euphoria capture" - the doubt journal's
counterevidence pool, the good-day rule below - checks all three.

A **body-region feeling**'s own euphoria intensity also qualifies, at or above
50 on any single logged region (phase 5 ticket 44, `GOOD_DAY_REGION_EUPHORIA_FLOOR`)
- someone whose good days are entirely a body-region reading and never a tag
clears the same bar a tag would.

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

**Regimen template**:
A built-in suggestion for a **regimen episode** - drug, ester and route only -
offered by key at creation time, the same shape a **milestone template**
already has for a milestone. Carries no dose and no interval on purpose: those
are where a suggestion starts reading as a recommendation, which nothing else
in this app's HRT tracking does either (this **Regimen episode**'s **Dose
slot** and **Hormone curve** are both explicitly descriptive, never a target).
What the user creates from one is an ordinary regimen episode, editable and
completable like any other.
_Avoid_: Regimen (ambiguous - see Regimen episode), suggested dose, preset
regimen

**Dose schedule**:
How often one regimen episode expects a dose, either of two shapes: every so
many days, or on specific days of the week - never both at once - and either
way, so many doses per day. Structured, unlike the episode's own free-text
interval, because slots are generated from it. An every-N-days schedule is
counted from the episode's start day, so editing it does not shift the slots
already generated; a weekday schedule needs no such counting to hold that
same guarantee, because which days are Mondays never depends on when the
schedule was last saved. Can also carry a sequence of dose amounts that
cycles across the slots it generates, in order, for an alternating regimen -
2 mg one day, 1 mg the next - that a single amount cannot describe. One per
episode.
_Avoid_: Reminder (that is a prompt to act; this expects nothing of the user),
regimen interval

**Dose slot**:
One dose a **dose schedule** expected, on a given day and in a given position
within that day, carrying the schedule's dose amount for that position when
the schedule tracks one. Nothing stores a slot; they are computed from the
schedule for whatever range is being looked at. A slot is compared against
what was logged, and the comparison is presented without a target rate, a
streak or a pass/fail reading.
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
An estradiol or testosterone curve over the dose log, drawn one of two ways
depending on how good the published evidence for it is. Injectable estradiol
doses on one of the four **injectable esters** get a fitted band, because a
published posterior exists for them. Everything else this app draws at all gets
a **qualitative curve**: estradiol by any other route, and testosterone by every
route it is drawn for. The split is by evidence and not by route, which is why
the two sections on screen are named for it - a testosterone injection sits with
the shapes, not with the bands. One curve is of one drug: a testosterone dose
never adds height to an estradiol curve, the two are drawn in their own units,
and each is calibrated against the reader's own results for that hormone alone.
Nothing about any of it is stored - all of it is recomputed from the dose log and
the regimen episode history on every read. Descriptive, like everything else in
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

**Injectable testosterone ester**:
Which testosterone ester a **regimen episode** is on, out of the two this app
draws a shape for: cypionate and enanthate. Its own closed vocabulary, parallel
to **injectable ester** and never merged with it - the two drugs share the ester
words and share the IM and SC routes, so one list covering both would let a
testosterone dose reach estradiol's parameters. Read from the episode's
free-text drug and ester fields, the same fail-closed rule ADR-0026 applies to
an analyte.

What it selects is a **qualitative curve**, never a band, and that is the whole
point of it being a separate term. No published testosterone fit clears the bar
the four estradiol esters clear, so nothing here earns a band - and not because
the fits are loose. Cypionate (Bi et al. 2018, doi:10.1002/psp4.12287) pins the
average level to about 1.16-fold, tighter than any ester this app draws, and
undecanoate (Pastuszak et al. 2021, doi:10.1002/jcph.1939) to about 1.3-fold.
Both fail on what is published around the fit instead. Cypionate publishes only
marginal confidence intervals, so a band drawn from them would assert an
independence between parameters its source does not support, and its raw data is
not published for the posterior to be re-derived. Most of what undecanoate's
model predicts is endogenous production a transmasculine reader does not have,
with no published basis for rescaling it. Enanthate's absorption rate is not
identifiable at all - unestimable in 6 of 10 transmasculine subjects (Ichihara
et al. 2020, doi:10.1089/andro.2020.0002). `hormoneTestosteroneEster.ts` carries
the argument ester by ester.

Undecanoate, the Sustanon-type blends and propionate get no curve of any kind.
Undecanoate is a months-long depot where these two act over a week, a blend is
four esters whose published curves are composite only, and propionate has no
usable parameters at all - each needs a shape of its own that nothing here
argues, and none of them borrows this one in the meantime.
_Avoid_: Injectable ester (that is estradiol's list; these are never one
vocabulary), unsupported ester, missing testosterone curve (nothing is missing -
no published fit is good enough to draw a band, and the shape says so)

**Qualitative curve**:
A rise/plateau/fall shape over the dose log, with no compartment model or
uncertainty math behind it - the published fit the **injectable ester** curve
rests on does not exist in that form for anything drawn this way. Drawn for oral,
sublingual, patch and gel estradiol, and for testosterone by injection, patch or
gel. Always a single line, the opposite of the injectable curve's band: it
carries no width to claim, because there is no posterior to draw one from. Its
height means nothing in pg/mL or ng/dL until an optional per-user scale factor
calibrates it against the reader's own lab results for that same hormone;
unfitted, it is drawn with no unit at all rather than a number this app cannot
back up.

Which shape a dose gets is decided by whichever of route or ester actually
determines it: the route for everything topical or swallowed, and the
**injectable testosterone ester** for an injection, because cypionate and
enanthate act over a week where undecanoate acts over months. An estradiol
injection is never drawn this way - it has a real fit and gets the band. On
screen it is labelled and shaped so it cannot be mistaken for the injectable
curve's band at a glance - its own heading naming it illustrative, a permanent
notice on every card, a dashed line instead of a filled shape.
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

**Cycle event**:
A menstrual event for people on testosterone - period occurred, spotting, or
nothing this month - and an epoch day, structurally independent of the
regimen episode the same way **Side effect** is: no episode reference, and it
works whether or not one exists. Not an entry: no mood, dimension values,
tags or note. Charted against regimen episode history so cessation is
visible over time, but purely descriptive otherwise - no prediction of a
next period, no fertility framing, no assumption that a regular cycle
exists. "Nothing this month" is a real, loggable state, not the absence of a
row - the shape a severity scale cannot represent. Modeled after
[Clue's own guidance for trans users](https://helloclue.com/articles/cycle-a-z/tips-for-using-clue-when-you're-trans),
which documents both the harm mainstream cycle trackers do (gendered copy,
fertility-first framing) and the fix that worked: gender-neutral language and
letting cycle tracking coexist with dysphoria and HRT tracking rather than
assuming one story.
_Avoid_: Period tracker, menstrual cycle (implies a regularity this makes no
assumption of), fertility window

**Personal effect**:
A body-change marker a person can mark a "first noticed" date for, from an
open catalogue (ticket 41) rather than the closed eight the screen started
with (ticket 07's original four, widened once to eight by ticket 02). One
row per marker - a fresh date replaces the old one rather than logging a
series of sightings - every marker read against the same anchor, the
earliest **regimen episode** overall, regardless of which direction a
person is on.

Roughly forty feminizing and thirty masculinizing built-ins, transcribed
from genderdysphoria.fyi's two second-puberty pages, plus whatever a person
adds of their own. This is the **third** revisit of this list's closure -
ticket 07 closed it at four and called it closed, ticket 02 reopened it
once to reach trans-masc parity and closed it again at eight, calling that
final. Ticket 41 stops closing it: two closures in two phases was the
argument that a fixed list was never going to be the right length.

Every built-in belongs to one **effect category** and carries a source
tier: tier 1 (roughly twenty, a published guideline window - Hembree et
al.'s Endocrine Society table for the original eight, widened by GenderGP's
WPATH-sourced HRT timeline tables) draws a shaded band, gated exactly as
before on the anchoring episode's drug (feminizing bands only where it
names estradiol, masculinizing only where it names testosterone, none at
all for a drug the app cannot classify). Tier 2 (named by the community
catalogue, or a guideline entry whose figure is "variable" with no usable
range) gets a marker and a date, cited to its source, never a band. Tier 3
- a person's own addition - gets a marker and a date, no source, no
direction pushed onto it. The gate is always on the band, never on the
row: every marker stays loggable and keeps showing a date already
recorded regardless of tier or drug.

Masculinizing fat redistribution stays a distinct marker from fat
redistribution, not the same one read two ways - the two describe
different, not opposite, changes, the same reasoning that gives body
odour, facial features and hands/feet their own key per direction where
the source names both. Every existing key from the original eight is
unchanged, and their windows are a claim about the literature (never a
target or a judgement of how fast a person is changing) exactly as before.
_Avoid_: Symptom, milestone (a personal effect is a body change one of
three sources names, not a life-event marker), effect alone (ambiguous
with side effect)

**Effect category**:
A named, toggleable collection over the personal-effects catalogue (ticket
41) - "body shape and composition", "skin and hair", "genital and sexual",
"cognitive and emotional", "sensory" - the same semantics as **tag group**:
turning one off hides its effects from the timeline and the "mark a
change" picker without touching any marker already recorded against them.
Built-in only, unlike tag group: no custom-category creation is offered.
Body shape and composition, and skin and hair, ship on by default -
together they hold every one of the eight effects that predate this
ticket, so an existing journal loses no visible effect and a new journal's
screen stays no longer than the eight-row screen it replaces. Genital and
sexual, cognitive and emotional, and sensory ship off by default, a
privacy and comfort decision as much as a length one: genital and sexual
in particular names ejaculate changes, orgasm changes and genital odour,
on a screen in an app whose disguise mode exists because its readers
sometimes hand their phone to someone.
_Avoid_: Tag (an effect category groups the effect catalogue, not an
entry)

**Hair staging**:
A dated series of self-recorded observations about hair, each one carrying
the published scale it was read against: Norwood-Hamilton's twelve stages,
Sinclair's five grades, or neither of the two, which carries the person's own
words instead of a grade. The two scales are separate published
classifications and are never merged, compared or converted into one
another - '1' through '5' are grade codes on both and mean different things
on each, so a stage without its scale says nothing. Neither is extended
either: an in-between grade would be invented clinical vocabulary, which is
why a pattern neither describes gets its own option rather than a new stage.
What the series is read against is a start date the person set, or failing
that their earliest logged dose of anything - never a named hair-loss drug,
because hair change is not assumed to be damage being fought. Staging and
photos work with no anchor at all; they lose the week counts and nothing
else. The screen records what someone says they see and never says what it
means or what follows from it.
_Avoid_: Norwood staging (there are two scales, and naming one as the
default is the assumption this area exists without), hair loss (the screen
makes no claim about which direction anyone is going), severity

**Wear session**:
A tracked stretch of binder or tucking wear time, logged either as a live
start/stop timer or as a backfilled start day plus duration, with an optional
comfort/pain note. Its own record type, not an Entry: no mood, dimension
values, tags or note beyond that one free-text field. Charted against the
existing built-in `chest` and `genitals` body regions' dysphoria trend rather
than against a region key of its own. Its optional Reminder is
an ordinary one, on a wear-specific marker, for whatever hour count the
person sets - the app states no safe maximum and gives no advice.
_Avoid_: Wear time (that is the duration on a session, not the record itself)

**Size record**:
What was bought and what fit: a garment category (a closed built-in list,
never user-extensible), a free-text size, an optional free-text brand and a
free-text fit note, dated and charted over time grouped by category. Pairs
with, and never duplicates, **Measurement** - no body-measurement math, and
no size normalized or converted across brands or sizing systems. Distinct
from a **Tryout**'s `garment` kind, which is a one-off experiment with a
felt-sense history, not an ongoing record of sizes across many purchases.
_Avoid_: Fit alone (collides with the hormone-curve sense of how well a
published curve fits the literature; always say "fit note" or keep it
next to "size")

### Reflection and retrospection

**Wrapped**:
A retrospective screen for a completed week, month or year, built on the same
`recap(fromEpochDay, toEpochDay)` seam as other reporting. Like a recap, nothing
about a wrapped is stored; opening one always recomputes from that range's
entries, milestones and photos.
_Avoid_: Report, summary

**Wrapped card**:
The shared card the wrapped screen's own week/month/year views do not use
directly - it's what ticket 17's optional book opening page and ticket 18's
share card are built from instead, so the same visual object isn't built
twice under two names. Composed from a user-chosen `WrappedCardContent`
(`wrappedCard.ts`): stat tiles and, optionally, **palette art** (below), and
nothing else - no journal text or photo, ever, because the type it's built
from has no field for either.

**Journal book**:
A print of a chosen range, made of the record types the person ticked before
generating it and no others. A keepsake rather than a copy: it leaves the
device in a form anyone can read, and nothing reads it back, so an **archive**
stays the only way to restore a journal. Not a second **clinician summary** -
different audience, different parts, and a book carries what was chosen rather
than what the range holds.
_Avoid_: Export (the archive owns that word), report, backup

**Book part**:
One kind of record a journal book may carry - entries, their photos, tags,
milestones, doubt entries, side effects, or the opening page. Every part is
answered before the book is assembled, and an unchosen part is never read, so
it cannot reach the page by way of something drawing it anyway.
_Avoid_: Section (a clinician summary section prints because it registers; a
book part prints because it was picked)

**Palette art**:
A wrapped card's optional decorative element: a gradient over the active
colour palette's flag stripes (`--motif-stripes`, `palettes.css`), the same
token the pride aurora background already reads. Carries no data of its
own - choosing it adds colour to the card, not a number.

**On-this-day**:
A daily retrospective offering what was logged a month, six months or a year
before today. Only ever resurfaces a **good day** (below) - never a bad one.

**Good day**:
The bar a day must clear for on-this-day to resurface it: a day average mood at
or above the mood scale's midpoint, any of the three euphoria capture tags
(`g-euphoria`, `g-soc-eu`, `g-body-eu`) logged that day, a body-region euphoria
of at least 50 on any one entry that day, or any of the three. The rule, not
just a definition: on-this-day must never show a day that doesn't clear this
bar. Neither the region's own dysphoria intensity nor a combination of the two
ever enters this rule, matching ticket 31's refusal of any net or scored
figure across a region's two axes.

**Doubt entry**:
A free-write record for a "not trans enough" spiral, timestamped and its own
record type - no mood, dimension values, tags or note (CONTEXT: "Entry").
Writing one surfaces the user's own past **euphoria capture**-tagged entries
and entries carrying a body region at or above the same euphoria floor
(CONTEXT: "Euphoria capture"), alongside any **Starred** ones, as
counterevidence, reached from a persistent Home affordance rather than the
normal new-entry flow.

**Counterevidence snapshot**:
A one-tap, saved copy of the counterevidence a doubt entry's composer was
showing at the moment of the tap, kept for rereading later rather than
re-derived on read - a euphoria-tagged entry edited, untagged or deleted
afterwards must not change what a past snapshot showed.

**Tryout**:
Something someone is trying - a name or pronoun set, a style, a garment,
makeup, or a presentation step - with a start date and an optional end date
once it is closed out. Several can exist at once, overlapping or entirely in
the past - nothing treats exactly one as "the current one". A non-name/pronoun
tryout carries a free-text description alongside its label, and any kind can
carry photos of its own. Which entries fall inside a tryout's dates is read
by date overlap alone, never a stored link.

**Felt-sense entry**:
One point in the running record of how a **tryout** or a **milestone** has
felt, on the app's one **mood** scale - belonging to exactly one of the
two, the same shape a **photo** already has. Its owner holds as many of
these as someone adds over its life, not a single rating fixed when it
was created. On a milestone, adding one is offered - never required - at
the milestone's own creation and again each time its **anniversary**
shows: tracking that a milestone was reached without ever asking how it
felt is the gap Chuanromanee & Metoyer (CHI 2023) named in a transition
app they studied.

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
survives. The default meaning of removing a tag, a gender dimension or a
measurement type.
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
one entry exists. Backdating an entry into a gap repairs it, and a day inside a
declared **Journaling pause** does the same without an entry - it bridges the
run rather than breaking it.

**Best streak**:
The longest such run inside a stated range, wherever in the range it falls. What a
recap reports, and a different question from the streak, which always ends at
today. The two were confused once already: the recap showed the current streak
capped at 28. Deliberately unaffected by a **Journaling pause**: this is a
question about a stated range, not about the run ending today.

**Journaling pause**:
A declared, dated break from journaling: a start day and an optional end day,
open while still running. Modeled on **Dose pause**'s shape but carries no
episode reference and no planned/accidental reason - it is journal-wide, not
attached to a regimen. A day inside its range bridges **Streak**'s run without
counting as a logged day or as a gap, and silences the daily **Check-in**
prompt and the Home streak line while it runs.
_Avoid_: Break, gap (a gap is what a journaling pause explains, the same
reasoning Dose pause's own _Avoid_ line gives), pause alone (ambiguous with
Dose pause)

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
A recurring or one-off prompt to do something, stored as a rule (wall-clock time
plus recurrence) rather than as a next-fire instant. Subject-agnostic: a
medication, injection or appointment prompt and a **wear session**'s own
"remind me after N hours" hook are the same row shape, with nothing about
either stored on it. Android only, though it travels in an archive.

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
_Avoid_: Locale (a pack is a country's procedure, not a language), Checklist
(a country pack is bundled content; see **Checklist** for the stored,
user-authored list a screen builds instead)

**Roadmap track**:
One of four groupings a roadmap goal belongs to: social, legal, presentational,
medical. A goal sits in exactly one. Nothing orders the tracks against each
other, and no track has to be finished before another can start.

**Roadmap goal**:
One step of a track, **Built-in** or **Custom**. A built-in goal is one step of
a country pack's procedure - named by its pack and goal keys rather than a
uuid, since both mean the same thing on every device, and says what the
procedure involves and never what someone should do about their own
situation. A custom goal is free text the person added to a track themselves -
uuid-identified, never translated, never reseeded - appended to the end of the
track's existing order with no reorder UI, because the roadmap already refuses
ordering between goals. Either kind is independently checkable, which is the
rule and not just a description: a goal never blocks or unblocks another, and
the order within a track is how the procedure usually runs (for a built-in) or
the order goals were added (for a custom one) rather than something enforced.
Either kind can also be marked **not part of one's path**, a third state a
goal's tick can hold alongside unchecked and checked, so a step nobody is
taking never reads as merely unfinished - grounded in the finding that a fixed
goal list can itself imply one correct transition path (Chuanromanee &
Metoyer, CHI 2023).
_Avoid_: Milestone (a milestone is a dated thing that happened; a goal is a step
that may never be taken), task, to-do

### Surgery

**Procedure**:
One operation someone is going through, with the consults leading up to it, a
surgery date once there is one, and a recovery log. Free text: the app ships no
list of procedures and never matches two spellings of one. Several coexist -
top surgery and facial feminization surgery are tracked independently - so
nothing about it is a singleton, and a person can have none. Screens say
**surgery journey** for the area and name the record after whatever the person
typed; everything the project says to itself says procedure, the same split
**Gender dimension** keeps with scale.
_Avoid_: Surgery as the name of the record (the operation is one day of a
procedure), case, patient

**Recovery log**:
What a **Procedure** accumulates after its surgery date: a day counter, dated
photos, free text, and a **Checklist** scoped to that procedure. Every part of
it is either the person's own writing or a date they entered. The app supplies
no aftercare instruction, no recovery target and no reading of the counter as
ahead of or behind anything, the same restraint the **Comparability flag** and
hair-removal recency already keep - it says how far along, and stops.
_Avoid_: Aftercare, recovery plan, post-op protocol

**Day since surgery**:
Days between a **Procedure**'s surgery date and today, counting the surgery day
as zero. Derived on read and never stored (ADR-0010), and signed both ways: a
date still ahead reads as a countdown, because a surgery date is usually set at
the consult, months out.
_Avoid_: Post-op day (that names a clinical convention this does not follow),
recovery day number

### Checklists

**Checklist**:
An ordered list of checklist items, standalone or scoped to one owner record.
Distinct from a **roadmap goal**: a roadmap goal is bundled, pack-authored
content with a fixed key, and the tick is the only part that is the user's; a
checklist item is itself the user's content, free text with nothing shipped by
the app behind it - the same distinction that separates **Custom** from
**Built-in**. The transition roadmap's country pack is content a screen reads;
a checklist is never that, however similar the two look on screen.
_Avoid_: To-do list, task list

**Checklist item**:
One line of a checklist: free-text content, checked or not, and whether it is
still open past whatever event closed its checklist's usual window - a visit,
a **Procedure**'s recovery close-out. Always **Custom** - no checklist item ships
built in.

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

**Clinician summary section**:
One part of the printable summary someone brings to a medical appointment, named
by its key in the assembled summary. A part appears because it registers a
section, which declares how it is read - through the read path of the area that
owns the rows - and, by where it is declared, where it prints. A part with no
section does not print. A section never computes a figure its own area does not
already produce, which is what keeps the summary a view rather than a second
opinion about the same rows.
_Avoid_: Report, block, page (several sections print on one page)

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
