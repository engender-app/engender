# A recovery key is an optional second wrap of the data key

Status: Accepted
Decided: 2026-09-03
Last reviewed: 2026-11-02
Supersedes: none
Amends: ADR-0018, ADR-0041

A person can mint one **recovery key**: 120 bits of randomness, shown once as Crockford base32 (`crypto/recoveryKey.ts`), which wraps the same data key their access mode wraps. It opens the journal on the device that holds it when the access mode cannot. It does not exist unless somebody asked for it, and one tap removes it. The key is 24 data symbols plus a check symbol, written as five groups of five. 24 symbols is exactly 15 bytes, so bytes and text are a bijection with no padding, and the check symbol covers all 25 characters, so no single wrong symbol and no transposition survives. This amends ADR-0018's "no data-preserving recovery": that sentence is now true only of a journal with no recovery key, and copy that repeats it says so.

## What it is not

**Not portability.** It moves nothing, so it cannot open a journal on a machine that does not already hold one. An archive is still the only copy that survives losing the device (ADR-0041).

**Not an archive password.** A forgotten archive password stays unreadable forever. A key that opened archives would open every copy that ever left the device.

**Not a mid-session bypass.** `SessionUnlock` is the screen behind lock-on-leave, where the data key is already in memory. There is nothing to recover there.

## Why, and what it costs

The web's device-bound mode is the case that justifies it. Android has an unattended scheduled export (ADR-0042) and so a file to restore from. The web has none, and what destroys a device-bound key there is not a decision (storage eviction, cleared site data, a reset profile). That was the one loss the app answered with nothing. A forgotten passphrase points at a password manager, and a forgotten four-digit PIN is rare.

The cost is real: a gate-free opener on paper, in an app built for somebody whose phone gets searched by a person who lives with them. Whoever finds the paper bypasses disguise, the PIN and the rest. It is acceptable because the key exists only if asked for, no flow mints one silently, revoking takes effect on the next boot, and the copy says what the paper is before showing it.

## Shape

The wrap lives in `recovery-key.json` beside `keystore.json` (`data/recovery-key-file.ts`), not as a second entry in the keystore. `KeystoreMetadata` answers what gate boot should draw, and a recovery wrap is not an access mode. Keeping it apart means a mode change never touches it and revocation never touches the mode, so a recovery key survives every mode change by construction. Reset empties the OPFS root and takes it along.

It runs through the same pipeline as every secret under its own `recovery-key` profile at the passphrase budget. There is no growing delay: against 120 bits neither attacker gets anywhere, so a delay would be theatre (ADR-0041 says what a throttle is worth).

## A replacement commits on confirmation

Minting writes the new wrap to `recovery-key-pending.json` and leaves the active wrap alone, so the old key keeps working until the person confirms. Only wrap ciphertext is stored; the key's characters never are. "I have written it down" opens the pending wrap with the key on screen, writes it over the active file, then removes the pending one. A cut between those two steps leaves identical wraps, and the next read finishes the tidy. While a pending wrap exists, a gate tries the active wrap and then the pending one, and promotes the pending one if it opens.

If a pending wrap exists after any unlock, Home and the recovery screen show one notice with three choices: type the new key to finish, make a new key, or keep the old key. Revoking removes the pending wrap before the active one. Changing the passphrase, PIN or access mode discards the pending wrap first, and an unconfirmed key is not restored across an uncertain credential state; the confirmed key keeps working. Every operation runs inside credential serialization.

**Known exposure.** Between minting and confirmation, two recovery keys open the journal, and the notice says so. Killing the old key at mint time was the defect this design fixes.

Minting, replacing and finishing need fresh current-owner proof under ADR-0041. A recovery unlock grants one-use proof for immediate protection setup only and cannot mint or replace a key.

## Missing access metadata

Retained journal storage without its access wrap is a recovery case, not a fresh install (`needs-recovery` boot plan). An unreadable wrap cannot fall back to leftover device credentials. A retained active or pending recovery wrap opens the same journal, and choosing a new access mode stays mandatory so the forgotten secret is not left in place. Without a usable wrap, the gate offers archive replacement or reset behind explicit destructive confirmation.

## Rejected

- **An onboarding step or first-setup offer.** Onboarding has the least context and the highest skip rate, and nothing is written yet. The offer belongs where the risk is legible: moving an existing journal to device-bound mode on the web.
- **A QR code beside the digits.** It makes the paper scannable by whoever finds it.
- **Showing the key again.** Impossible: only the wrap is stored. Settings offers replace and revoke.
- **Carrying the recovery wrap in an archive.** A second copy of the bypass in the file the person puts on other storage. A deliberate non-registration (ADR-0027).
- **A scheduled encrypted backup on the web instead.** Not rejected. It covers the same loss without a written opener, but needs a saved password of its own and does nothing for someone who forgot it.

History: amended 2026-09-03 (120 bits, five groups, check symbol over all 25 characters), 2026-10-14 (fresh proof), 2026-10-16 (pending replacement) and later (missing access metadata); trimmed 2026-11-02.