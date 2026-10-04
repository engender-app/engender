# 05 - rel: Every link points at a domain the project owns

Status: done
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

## Comments

2026-10-04: Work stopped at the user's request. Implementation had completed
before the stop arrived. Reviewed SHA:
`3eb75ec2b592f2ce7fceb9c9022d9821def1b592` on
`ticket-05-rel-domain-links-and-repo-urls`. Source tree is clean.

Final production build, svelte-check (0 errors, 0 warnings), copy check and
all 6,808 Node tests across 521 files passed. Independent Standards and Spec
reviews pass with no findings at that SHA. The first full-suite failure
exposed HTTP locations outside shared nginx ownership; the committed fix
puts them in `journal-http.conf` and preserves the strict ownership guard.

DNS and TLS are provisioned. Normal external HTTPS returns 200. The separate
certificate expires on 2027-01-02. Security headers, nested-route fallback,
public HTTP renewal challenge, renewal timer and release byte parity pass.
The old hostname, its nginx/snippet hashes, certificate and active release
remain unchanged. No real journals were opened, erased or migrated. No new
app build was published.

Infrastructure writes added only the new hostname's nginx site, separate
engender site/header/HTTP snippets and its separate certificate. The user
changed the new hostname's DNS A record to the existing VPS. Rollback steps
live in `deploy/README.md` and
`.claude/worktrees/p14-05-domain/.claude/review-05/infrastructure-plan.md`;
applied scripts in that evidence directory retain rollback guards for only
the new paths. `infrastructure-proof.json` records the pre-action hashes.

Evidence and final handover:
`.claude/worktrees/p14-05-domain/.claude/review-05/handover.json`.
Separate review records: `standards.json` and `spec.json` in that directory.
Final verification logs: `build-final.log`, `typecheck-final.log`,
`copy-final.log` and `full-test-final.log`. Live infrastructure proofs:
`final-infrastructure-proof.json`, `http-owner-install-proof.json`,
`final-host-hashes.log`, `live-host-proof.log` and
`renewal-challenge-proof.json`.

No final stack remains queued or active; it exited successfully before the
stop. No implementation, fixes, reviews or verification continue. Root owns
merging this completed ticket and updating its status. No resume command is
needed for implementation. If the user requests fresh verification, run:

```bash
cd /home/alice/_projekty/priv/gender-diary/.claude/worktrees/p14-05-domain
python3 /home/alice/_projekty/priv/gender-diary/.claude/orchestration/phase14-no-ui-20261003/heavy.py -- sh -c 'npm run build && npm run check && npm test -- --maxWorkers=2'
```
