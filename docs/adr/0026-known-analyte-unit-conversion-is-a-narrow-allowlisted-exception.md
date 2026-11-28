# Known-analyte unit conversion is a narrow, allowlisted exception to no-conversion

Status: Accepted
Decided: 2026-08-18
Last reviewed: 2026-11-02
Supersedes: none

Lab units are free text, so two differently labelled series never join and
never convert. One narrow exception exists: a built-in allowlist of analytes
whose conversion is a single physical constant (estradiol between pg/mL and
pmol/L, testosterone between ng/dL and nmol/L). For those the app may offer
the other unit as the person's preferred default and may compare values
across the two units. A converted number is never stored, never replaces what
the person logged, and never merges two series. Lab slip OCR follows the same
rule: its review shows, and saving writes, the value and unit printed on the
slip, with no conversion before the person has reviewed it.

## Why

The no-conversion rule exists because a unit string is copied off whatever a
report said. Two similar strings might be one unit misspelled or two
different assays, and the app cannot tell, so it refuses to guess. That
reasoning does not reach an analyte with a textbook factor: pg/mL and pmol/L
of estradiol are two writings of one number. Prolactin, LH and FSH are
outside the exception because they convert against an assay-specific
calibration standard, not a fixed factor.

## How the allowlist is bounded

The allowlist keys off the analyte's identity, never off the free-text unit,
so a custom or unrecognised analyte is never offered a conversion. It lives
in `src/lib/data/labs/units.ts` (`PREFERRED_UNIT_ANALYTES`,
`ALLOWED_PREFERRED_UNITS`), and each analyte has exactly two units, which is
what makes "the other unit" a well-posed question. A third unit needs a
caller that says which one it wants.

Lab series folding (CONTEXT: Lab series) is untouched. A series still keys on
the unit exactly as logged.

Two things read the allowlist today. The labs screen uses the preferred unit
as the default unit for a new typed result. OCR uses
`canonicalizeLabMeasurement` only to build in-memory duplicate-detection keys
(`src/lib/data/labs/ocr.ts`), so a slip value in pmol/L is flagged as a
duplicate of an existing pg/mL result. That key is never written. The slip's
own number and unit go through review rows and into the save untouched. The
preferred unit can change a later display or a default, and never an imported
record. `secondaryLabValue` (the converted reading shown beside a native one)
still exists and is tested, but no screen calls it since the hormone curve was
cut. A screen that adds a caller shows the converted value as secondary and
labels it as converted.

## Rejected

- **Convert at OCR import to the preferred unit.** Convenient, but a
  misread unit or a mislabelled analyte then rewrites a number the person
  never saw, and the record no longer says what the slip said.
- **Extend the allowlist to any analyte with a published factor.** The
  fixed-factor test is what keeps the exception small.

History: decided 2026-08-18; hormone curve consumer cut and OCR rule stated 2026-11-02.