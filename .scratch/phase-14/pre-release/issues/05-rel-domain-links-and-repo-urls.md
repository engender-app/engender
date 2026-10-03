# 05 - rel: Every link points at a domain the project owns

Status: ready-for-agent
Type: build
Audit findings: R2, R6 (URLs half)
Severity: P1, blocks release
Blocked by: pre-release-human-steps 17 (Alicja's domain decision)
Size: S
Size note: under a day
Model: sonnet
UI: no. Link targets only; nothing renders differently. No `/impeccable` pass.

## Problem

`engender.dev` is not registered (the .dev registry answers NXDOMAIN, checked
twice on 3 October). Yet these name it:

- `src/routes/settings/+page.svelte:135`, `SITE_URL`: the About sheet's
  Website and Guide links
- `docs/privacy-policy.en.md:11`, `docs/privacy-policy.pl.md:9`
  (`app.engender.dev`)
- `capacitor.config.ts:14`, `JOURNAL_ORIGIN`
- `deploy/nginx/journal.conf:8,18,21`, `deploy/README.md`, `SELF-HOSTING.md`

Every About link is dead today, and anyone could register the name and serve
content to users of a trans health app through the app's own links. What is
live: `gender-diary.barankiewicz.dev` (landing, `/en/privacy/` returns 200)
and `app.gender-diary.barankiewicz.dev`.

Separately, `SECURITY.md:11` and the `README.md:8` CI badge use
`barankiewicz/gender-diary`; the repo is now `engender-app/engender` (the old
URL redirects).

## What to build

Once human step 17 records the decision, point every reference above at the
chosen hosts, in one place where possible (a single constant for the site URL
the app and docs both read, if that fits the build). Check `capacitor.config.ts`
`JOURNAL_ORIGIN` against what the Android build actually uses before changing
it, and say in Comments what it affects. Update the repo URLs in SECURITY.md,
README and any other doc that names the old repo.

A test or check that greps the built output and docs for the retired host so
it cannot come back.

## Acceptance

- [ ] No reference to an unowned domain in `src/`, `docs/`, `deploy/`,
      `capacitor.config.ts`, README, SECURITY.md or SELF-HOSTING.md; a check
      enforces it.
- [ ] The About sheet's Website and Guide links open a live page.
- [ ] Repo URLs name `engender-app/engender`.
