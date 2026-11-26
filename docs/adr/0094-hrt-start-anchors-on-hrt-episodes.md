# The effects timeline counts from the HRT start, and a drug class says what HRT is

Status: Accepted
Decided: 2026-10-21
Last reviewed: 2026-11-02
Supersedes: none

The effects timeline, its literature bands and the hair week counts count from
one day: the **HRT start**. Every regimen episode carries a **drug class**,
`hrt` or `other`, and only `hrt` episodes set the start. The person can
override the date with a portable preference, `hrtStartEpochDay`.

## Why

The anchor used to be the start of the earliest regimen episode, whatever its
drug. Since a journal can hold concurrent episodes for different drugs (the
regimen editor's placeholder names sertraline), an SSRI started a year before
estradiol moved every band a year early. The bands are gated on the anchoring
episode's drug and sertraline names no literature table, so they vanished. The
hair anchor had the same flaw: its fallback was the earliest dose of anything.

## Rules

1. **Two values.** `drug_class` is a plain column (schema 93) with no CHECK, by
   ADR-0095. The only question asked of it is whether an episode counts
   towards the HRT start. The clinician summary also reads it, leaving non-HRT
   drugs out by default.
2. **The class is the person's.** A new episode starts as whatever its drug
   infers to, the editor shows it as two chips, and an edit naming no class
   keeps the stored one. An unknown stored value reads as `other`.
3. **One inference rule** (`src/lib/data/drugClass.ts`) serves a new episode,
   the schema-93 migration over stored episodes and an archive row from an
   older build. HRT when the drug, lowercased with diacritics removed,
   contains a stem for a hormone, an antiandrogen, a GnRH agonist or
   antagonist, or one of a short list of brand names common in Poland and the
   UK. Everything else is `other`. Finasteride and dutasteride are `other` on
   purpose: they are as often taken for scalp hair, and a guess of HRT would
   move the timeline for someone treating hair loss.
4. **The HRT start** is `hrtStartEpochDay` if set, else the earliest HRT
   episode's start. It is derived on every read (ADR-0010) by `hrtAnchor` in
   `src/lib/data/personalEffectWindow.ts`.
5. **The anchor's drug**, which gates the bands, is the first HRT episode that
   names a hormone with a literature table, else the first HRT episode. An
   antiandrogen started a month before estradiol starts the clock and
   estradiol's table still draws the bands. A date set with no HRT episode
   counts months and draws no band.
6. **The anchor ends only when every HRT episode has ended**, at the latest
   end. Before, the earliest episode's own end clipped the bands, so a switch
   from oral estradiol to gel stopped them at the switch.
7. **The hair anchor** is the date set on the hair screen, else the HRT start.
   Someone tracking hair with no HRT sets the hair date.

## Consequences

- An antiandrogen or GnRH agonist started well before a hormone moves the
  start earlier. That is what the preference is for; the regimen screen says
  which date is in use.
- A journal whose only HRT drug is spelled in a way the stems miss starts as
  `other` and anchors nothing until the person picks HRT. The editor shows the
  class beside the drug.
- Rows from an older archive are classified by today's rule, so a restored
  journal and the same journal migrated in place agree.
- Writers of an episode that predate the field keep working: the class is
  optional on the way in.

## Known exposure

The brand list is short and Polish- and UK-leaning. Nothing reads it after
creation, so extending it changes no stored row.

History: decided 2026-10-21, replacing the earliest-episode anchor and the earliest-dose hair fallback.

Amended 2026-11-26: rule 7, the hair anchor, is gone with the hair progress screen (schema 124); the HRT start anchors the effects timeline alone.
