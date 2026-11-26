# The pitch graph carries no population reference bands

Status: Accepted
Decided: 2026-09-03
Last reviewed: 2026-11-02
Supersedes: ADR-0060 (merged in)

No figure in the voice module draws a population reference band, and the
metric reference sheet quotes none. The pitch graph keeps a fixed hertz
axis, the person's trace and an optional comfort bracket with no default.

Every other figure is explained instead, and the explanation never
instructs. It says what a measure is, how this app measures it, what is
physically known to change it and what it cannot tell you. It never says
what a person's figure should be, prescribes an exercise or mentions the
person's own numbers. Each measure also names its comparison tier in
ordinary words: whether its absolute value can be trusted against
published figures, or only against the person's own earlier takes
(ADR-0061).

## Why the bands went

The first version of this record allowed two cited bands on the pitch
graph, labelled as typical ranges and not targets. ADR-0060 then narrowed
that: a band only where the cited population's language matches the
passage, and only for habitual speaking F0. Both rules were attempts to
make the bands honest, and a later review removed them anyway.

The language problem was real. The English-sourced bands sat under a
Polish passage, and Polish speakers read about 30 to 50 Hz higher than
English speakers on the same task (Andreeva and colleagues, Interspeech
2014 and Speech Prosody 2014, two corpora, the direction replicated). An
ordinary Polish cis man reading the passage landed near the top of a band
captioned as a cis woman's, and a Polish trans woman at 190 Hz would have
read herself as inside it. A band that wrong is worse than none because it
carries a citation.

The language key fixed the number but not the reading. A band behind a
person's trace still read as a destination, and a caption could explain
its source without undoing the comparison the graph invited. That
conflicts with the product rule against interpreting a value or implying
where a voice should sit (ADR-0012). Published figures stay useful as
research context. They are not drawn against someone's recording.

F0 was the only measure that ever qualified. A band is honest only where a
difference exists, the person can act on or understand it, and it was
measured on the same task in the same language. Pitch spread in semitones
shows no sex effect and differs by language instead. Speaking rate in
words per minute cannot cross the two passages, since morphology alone
opens a gap of tens of words a minute. F1 and F2 show no sex difference in
the one Polish dataset. Cepstral peak prominence has a sex gap smaller
than its protocol effects, and its published cutoffs are dysphonia
screening thresholds. Maximum phonation time is not measured, because the
sex gap is lung volume and nothing in voice work shortens it.

## Why the reference screen explains and never instructs

The maintainer asked for the user not to be left with numbers that mean nothing,
and for the app not to judge them. The line between those is the
difference between a glossary and a coach. A general fact about a measure
is a fact about the world. A sentence about the person's own figure is a
verdict, however gently phrased (ADR-0012).

The field about how well a measure is studied as a gender cue does the
most work. The strongest known cue is formant spacing, which needs F3 and
F4, and a phone cannot measure those. The person is told so, because
otherwise an app that measures pitch well lets someone conclude that pitch
is the thing to chase. The supporting listener study is one speaker and
needs replication. It agrees with older work that F0 is necessary and
insufficient.

## Consequences

The absolute axis stays so takes made months apart share a scale, with
round hertz ticks that name no population.

The metric registry (`src/lib/data/voice/metrics.ts`) holds the measures,
their tier and one reviewed-on date for the whole set
(`VOICE_METRICS_REVIEWED_ON`). Pitch's tier keeps its older name,
`referenced`, because a DOM attribute and a probe read it; it now means a
figure that can be read against published research as context, never a
drawn band. Words for each measure's fields live in
`src/lib/data/voice/metricLabels.ts` as records over the metric key union,
so a measure added without every field fails typecheck. Citations stay in
English in both locales.

The reference sheet opens from the figures (`metricHref`, `/voice?metric=`)
and has no hub row.

## Considered and rejected

- **Bands keyed by passage language, with a caption.** Built, then removed
  for the reading problem above.
- **A band for a second measure.** Each candidate failed the test above.
- **Prose telling the person where their figure sits.** A verdict
  (ADR-0012).

History: decided 2026-09-03 as "cited reference bands on the pitch graph only"; narrowed 2026-09-04 (ADR-0060: language key, F0 only, explain-only sheet); bands removed 2026-10; ADR-0060 absorbed 2026-11-02.