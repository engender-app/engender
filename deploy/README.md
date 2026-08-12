# Production hosting and release switch

Ticket 05 serves the Journal from one decided origin:
`app.gender-diary.barankiewicz.dev`.

The VPS keeps immutable release directories and one symlink:

- `/home/journal/releases/<version>--<buildId>/` - complete static release
- `/home/journal/current` - symlink nginx serves from

Nginx resolves the symlink per request, so replacing it is enough to switch
traffic with no reload and no half-copied release state.

## Nginx setup

Install these files:

- `deploy/nginx/journal-headers.conf` -> `/etc/nginx/snippets/gender-diary-journal-headers.conf`
- `deploy/nginx/journal-site.conf` -> `/etc/nginx/snippets/gender-diary-journal-site.conf`
- `deploy/nginx/journal.conf` -> `/etc/nginx/sites-available/gender-diary-journal.conf`

Enable the site and reload nginx:

```bash
sudo ln -sf /etc/nginx/sites-available/gender-diary-journal.conf /etc/nginx/sites-enabled/gender-diary-journal.conf
sudo nginx -t
sudo systemctl reload nginx
```

## Deploy command

Build locally or in CI, upload the `build/` directory to the VPS, then run:

```bash
node scripts/journal-release.mjs deploy /path/to/uploaded/build
```

Optional paths:

```bash
node scripts/journal-release.mjs deploy /path/to/build --root /home/journal/releases --current /home/journal/current
```

What deploy enforces:

- source directory must contain `index.html`, `service-worker.js`, `_app/version.json`, and `release.json`
- full directory copy lands before the symlink switch
- previous release directory stays in place

## Rollback command

Named rollback:

```bash
node scripts/journal-release.mjs rollback <version>--<buildId>
```

Previous release rollback:

```bash
node scripts/journal-release.mjs rollback --previous
```

By default rollback refuses a target with lower `schemaMax` than the currently
served release. That guard stops selecting code that cannot safely open journals
already migrated by a newer release.

Override only for an explicitly audited incident:

```bash
node scripts/journal-release.mjs rollback <version>--<buildId> --force
```

## Test harness

Run this from the repository root:

```bash
npm run verify:hosting
```

Prerequisite: Docker must be running and the current user must be allowed to
talk to the Docker socket.

It boots nginx in a container with these exact config snippets and checks:

- COOP/COEP, CSP, and cache headers
- immutable caching for hashed assets, update-aware caching for shell files
- SPA fallback
- `release.json` metadata
- cold install followed by offline launch
- no runtime requests to other origins

## Local operator note

If you keep a machine-specific runbook, store it in
`.scratch/ticket-05-hosting-checklist.md` so it stays local and untracked.
