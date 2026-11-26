# An unlock shows Today's sun, not the app's name

Status: Accepted
Decided: 2026-11-11
Last reviewed: 2026-11-26
Amends: the rule that the pride motif is Today-only, and the rule that an unlock shows no sun

A tester called the locked start screen unused potential and wanted no
writing on it, only something like the flag. The unlock is the first screen a person meets
every time they open the app, and its field held the app's name at 48 on one
of the flag's colours.

## Decision

An unlock's field draws Today's own flag sun and nothing written. The
unlocks are the lock gate (`SessionUnlock.svelte`), the passphrase and PIN
gate at a cold start (`JournalGate.svelte` while it asks for the secret) and
Android's authentication gate (`AndroidKeyGate.svelte`). The sun is
`FlagSun.svelte` itself, at Today's size and in Today's corner, and it is
still on a gate: no entrance, since a gate arrives as a cut, and no
breathing while someone types. The field is as tall as the sun, so its
edge cuts no ring: the outer ring's radius and 16px of field under it,
191px wherever the sun is full size, so the sun is not cut off. The PIN pad, the
tallest gate, comes first: the field takes the window less what the pad
needs and never less than a title's line, so on a short phone the edge
still crosses the outer ring. Measured: 191px with the whole sun at
390x844 and on desktop; 158px at 360x640 (17px into the ring); 146px at
360x568 (29px into it); 146px at 320x568, where the sun draws at 0.82 and
clears by 3px. Nothing scrolls at any of them. The corner stays cut by the
window's top and side, which is the mark's own drawing.

On desktop the gate has no rail and Today has, so the field and its sun
move 110px sideways on the opening's first frame, as the base's field and
wordmark already did. The maintainer accepted that.

The wordmark stays in the page as the screen's level-one heading, visually
hidden, so a screen reader hears what the screen is, as before.

Gates that are not unlocks (device recovery, schema too new, the recovery key,
a refused old journal, the access-mode question and the post-recovery mode)
keep a field of the flag's second colour with their own title on it, at the
title's height, because what each is about to do is what that screen is for.

`$lib/theme/gateFlag.ts` owns the decision (`gateDrawsFlag`); `screens.css` owns the
field's height, behind `data-gate-sun`.
`GateScreen.svelte` mounts the sun only when an unlock is not disguised.

## Disguise is the only switch

A lock screen is the surface most likely to be seen by someone other than its
owner, and a sun in the flag's colours is recognisable from further away than
one colour and a name. Disguise is the existing answer to that and stays the
only one: with disguise on, every gate keeps ADR-0101's neutral `--surface-2`
field at the title's height with the decoy's name, and no colour of the flag
reaches it. `tests/gate-flag-check.mjs` checks that on every palette and both
themes, by the DOM and by the pixels of the field, and screenshots of the
disguised gates match the base pixel for pixel. No second preference was
added: it would split one intent across two controls, the reason ADR-0035
gave for not adding one for the in-app motif.

## The handover to Today

The gate's sun is the same drawing in the same place as Today's. Opening the
app passes `holdSun` to the blind's carry (`appOpening.ts`), so the rings are
unnamed on both sides and each rides its own side's blind capture: the two
photographs of the sun are the same picture, and the field opens to Today's
height around one sun that does not move. Today's sun rests at scale 1 for
the length of the opening, because its breathing waits for its delay. The
sun is nested inside each side's blind, which matters: a held sun outside it
rides the field's capture, which is hidden by design.

## Contrast

On bisexual and asexual the sun's outline against the field measures 2.13:1
and 2.23:1, on Today and on the gate alike. The flag is not changed to pass
(a stripe is used at its own value and never nudged to pass a ratio);
`tests/palette-contrast.test.ts` pins the two so
the shortfall cannot grow or spread unnoticed.

## Options considered

Four drawings were built and compared, live and frame by frame: the stripes as the field, the launcher tile on the field, the
stripes with the wordmark kept small, and the corner sun. The maintainer picked the
sun. The first sun was a separate gradient drawing that faded while Today's
rings opened over it, which put two suns on screen during the opening; the
built one is Today's own sun, held.

## Consequences

- The rules that the pride motif is Today-only and that an unlock shows no sun
  no longer hold.
- `tests/gate-flag-check.mjs` is a dev-tier guard.
