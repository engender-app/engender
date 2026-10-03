# 06 - rel: A privacy policy Play accepts, and licence notices in the app

Status: ready-for-agent
Type: build
Audit findings: R5, S-09, R7
Severity: P1, blocks release (policy); R7 P2
Blocked by: 05
Size: M
Size note: one to two days
Model: sonnet
UI: yes (About sheet links and a new notices screen). Mandatory `/impeccable`
pass on the About sheet and the notices screen, then sign-off and the no-yank
clause from the spec.

## Problems

**Policy (R5, S-09).** `docs/privacy-policy.en.md` and `.pl.md`:

- scoped to `app.engender.dev`, which does not exist (fixed by 05);
- no contact or developer identity; they end with `SUPPORT.md` and
  `SECURITY.md` as repo paths, not URLs;
- no section on deleting your data (uninstall, clearing storage, the in-app
  erase ticket 15 adds);
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

- Policy, both languages: contact (the address Alicja chooses; ask), a deletion
  section, the two biometric permissions, the live URL. Keep the Polish natural:
  it goes through the Polish sign-off in human step 16 afterwards.
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
