# 10 - rel: A privacy policy Play accepts, and licence notices in the app

Status: ready-for-agent
Was: phase-14 pre-release 06 (moved 2026-10-05)
Type: build
Audit findings: R5, S-09, R7
Severity: P1, blocks release (policy); R7 P2
Blocked by: none
Blocked by note: done/phase-14 pre-release 05 (done)
Size: M
Size note: one to two days
Model: sonnet
UI: yes (About sheet links and a new notices screen). Mandatory `/impeccable`
pass on the About sheet and the notices screen, then sign-off and the no-yank
clause from the spec.

## Problems

**Policy (R5, S-09).** `docs/privacy-policy.en.md` and `.pl.md`:

- scoped to `app.engender.dev`, which does not exist (fixed by done/phase-14 pre-release 05);
- no contact or developer identity; they end with `SUPPORT.md` and
  `SECURITY.md` as repo paths, not URLs;
- no section on deleting your data (uninstall, clearing storage, the in-app
  erase from done/phase-14 pre-release 15);
- not linked from the app;
- the permission list matches `AndroidManifest.xml:647-666` but omits
  `USE_BIOMETRIC` and `USE_FINGERPRINT`, which `androidx.biometric` adds to the
  merged manifest (seen in a stale merged manifest; confirm on a fresh build).

Play requires a reachable policy with a contact for an app that asks for
camera and microphone. The landing site serves its own `/en/privacy/`; check
whether it matches `docs/` and say which is the source.

**Notices (R7).** About shows only "Free software under GPLv3. Source code is
public." There is no source URL (GPLv3 section 6), no notices for 325 bundled
packages (MIT 267, Apache-2.0 14, others), and `static/fonts/{nunito,outfit}*.woff2`
ship without their OFL text (`static/pdf-fonts` does carry `LICENSE_*`).

## What to build

- Policy, both languages: contact (the address Alicja chooses; asked in pre-release-human 03), a deletion
  section, the two biometric permissions, the live URL. Keep the Polish natural:
  it goes through the Polish sign-off in pre-release-human 05 afterwards.
- About: a Privacy link and a Source code link.
- A notices screen generated at build time from the data
  `scripts/check-licences.mjs` already collects (name, version, licence, notice
  text where the licence requires it), plus the OFL files beside the fonts.
- `npm run check` and `check:licences` stay green; a check that every shipped
  package appears in the generated notices.

## Acceptance

- [ ] Policy has contact, deletion and the full permission list in English and
      Polish, and is published at the URL About links to.
- [ ] About links Privacy, Source code and the notices screen.
- [ ] Every bundled package's licence and required notice is reachable in the
      app; OFL text ships with the fonts.
- [ ] `/impeccable` pass done; sign-off crops of the About sheet and the
      notices screen, trans light and dark.
- [ ] Notices screen arrival sampled: no yank.

## Audit 2026-10-05

Confirmed still open; none of the acceptance boxes are met. The audit adds the
Quick exit claims, which it calls release-blocking (B10). Reports:
`.claude/audit-2026-10-05/report-rel.md`, `report-sec.md`.

- **REL-02 (P1 for Play).** `docs/privacy-policy.en.md` has no contact, no
  deletion section, says "once hosting is published", ends with repo paths,
  and its permission list (lines 61-70) omits `USE_BIOMETRIC` and
  `USE_FINGERPRINT`, which `androidx.biometric` merges in
  (`android/app/build.gradle:95`). The About sheet
  (`settings/+page.svelte:743-751`) links only Website and Guide. The live
  `https://engender.barankiewicz.dev/en/privacy/` is a security explainer, not
  this policy: no contact, no date, no deletion section.
- **SEC-04 (P3).** The policy contradicts the code: it says the browser
  clipboard is never cleared, but it is after 60 s
  (`recovery-key-clipboard.ts:242-257`); it says a still photo needs no CAMERA
  permission, but `PhotosPlugin.java:67-68` requests it; the biometric pair is
  missing. The Polish policy says the same (lines 67-68, 75-78).
- **REL-11 (P2).** No notices screen, no OFL texts for the four woff2 files in
  `static/fonts/`, and the About line "Free software under GPLv3. Source code
  is public." (`messages/en.json:12`) has no URL.
- **REL-03 (P1, blocks release).** `CHANGELOG.md:24` ("App lock, disguise mode
  and quick exit...") and `README.md:80-81` still advertise Quick exit, which
  82667cec removed on 2 October; `release-notes.mjs` copies the CHANGELOG line
  into the GitHub Release body. The landing guide
  (`https://engender.barankiewicz.dev/en/guide/`, in the landing repo) still
  describes the two-finger swipe. Someone at risk would install the app
  expecting a panic gesture that does not exist.

New acceptance:

- [ ] One canonical policy URL: decide whether the repo file or the landing
      page is the source, and About links to that one.
- [ ] The clipboard, CAMERA and biometric bullets match the code, in English
      and Polish.
- [ ] CHANGELOG 1.0.0, README and the landing guide describe disguise plus lock
      timing and no longer present Quick exit as a feature; `git grep -i
      "quick.\?exit" CHANGELOG.md README.md docs` finds no such claim.
