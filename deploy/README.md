# Production hosting and release switch

Ticket 05 serves the Journal from one decided origin:
`app.engender.barankiewicz.dev`.

The VPS keeps immutable release directories and one symlink:

- `/home/journal/releases/<version>--<buildId>/` - complete static release
- `/home/journal/current` - symlink nginx serves from

Nginx resolves the symlink per request, so replacing it is enough to switch
traffic with no reload and no half-copied release state.

Hosting your own copy on another origin is covered in
[SELF-HOSTING.md](SELF-HOSTING.md). It installs the same two snippets.

## Adding the chosen hostname to an existing installation

Keep `app.gender-diary.barankiewicz.dev` serving its existing release. Add
`app.engender.barankiewicz.dev` as a separate nginx site; do not redirect the
old hostname or replace its certificate. Browser journals belong to their
origin. A journal on the old hostname stays there until its owner exports an
archive and imports it on the new hostname. Android still uses
`https://localhost`, so these DNS and nginx changes do not move Android data.

In the DNS provider's panel, set an A record for
`app.engender.barankiewicz.dev` to the existing journal VPS address. Read that
address from the `zabka-vps` SSH alias. Keep the landing site's record and the
old app record unchanged. Check both authoritative nameservers before issuing
a certificate. If the new app hostname has an AAAA record, it must reach the
same server too.

First enable an HTTP-only server for the new hostname. Give its
`/.well-known/acme-challenge/` location the root `/var/lib/letsencrypt` and
return 404 for other paths. Create that directory, test nginx, then reload.
This bootstrap site lets certbot validate the hostname before its TLS
certificate exists:

```bash
sudo install -d -m 0755 /var/lib/letsencrypt
sudo nginx -t
sudo systemctl reload nginx
sudo certbot certonly --webroot -w /var/lib/letsencrypt -d app.engender.barankiewicz.dev
```

After issuance, install the snippets and replace only the new hostname's
bootstrap site with `deploy/nginx/journal.conf` as described below. Its HTTP
challenge location keeps renewals out of the immutable release directories.
The new site initially serves the existing `/home/journal/current` release;
adding a hostname does not publish a new app build.

Verify valid TLS, response headers and `/release.json` on both app hostnames.
Their release metadata must match. To roll back the hostname addition,
disable only the new site's symlink, test nginx and reload, then restore the
new hostname's previous DNS record. Leave the old site, its certificate and
`/home/journal/current` untouched.

## Nginx setup

Install these files:

- `deploy/nginx/journal-headers.conf` -> `/etc/nginx/snippets/engender-journal-headers.conf`
- `deploy/nginx/journal-site.conf` -> `/etc/nginx/snippets/engender-journal-site.conf`
- `deploy/nginx/journal-http.conf` -> `/etc/nginx/snippets/engender-journal-http.conf`
- `deploy/nginx/journal.conf` -> `/etc/nginx/sites-available/engender-journal.conf`

`deploy/nginx/journal-brotli.conf` is optional and goes in last, because it
needs a module stock nginx does not have. Install the module first, check that
nginx still starts, and only then copy the snippet in:

```bash
sudo apt install libnginx-mod-http-brotli-filter libnginx-mod-http-brotli-static
sudo cp deploy/nginx/journal-brotli.conf /etc/nginx/snippets/engender-journal-brotli.conf
sudo nginx -t && sudo systemctl reload nginx
```

If the module is not available on the box, skip both steps. `journal-site.conf`
includes the snippet by wildcard, so its absence is not an error, and the
origin serves gzip as before. Getting the order wrong is what to avoid: the
snippet without the module is an unknown directive, and nginx refuses to start
rather than ignoring it.

For a hosted demo, `npm run build:demo-hosting` writes Brotli quality 11
sidecars into `build/` after the PWA asset list has been generated. Upload
the whole directory. The optional snippet serves those files to clients
accepting Brotli and keeps quality 5 dynamic compression as the fallback.
Compression adds build time and release storage; the decoded bytes stay the
same. Use `npm run build` for Android: hosting sidecars do not belong in the
APK. Production builds and walkthrough builds use that default command too.

Enable the site and reload nginx:

```bash
sudo ln -sf /etc/nginx/sites-available/engender-journal.conf /etc/nginx/sites-enabled/engender-journal.conf
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
- source `release.json` must name a release version (not `0.0.0-dev...`) unless `--allow-development-version` is passed deliberately
- full directory copy lands before the symlink switch
- previous release directory stays in place

For explicit non-release checks only:

```bash
node scripts/journal-release.mjs deploy /path/to/uploaded/build --allow-development-version
```

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

It builds the self-hosting image from `deploy/self-host/`, which installs these
exact config snippets, serves the build through it and checks:

- COOP/COEP, CSP, and cache headers
- immutable caching for hashed assets, update-aware caching for shell files
- SPA fallback
- `release.json` metadata
- cold install followed by offline launch
- no runtime requests to other origins
- `nginx -t` over the bare-nginx template in `deploy/self-host/engender.conf`

## Local operator note

If you keep a machine-specific runbook, store it in
`.scratch/ticket-05-hosting-checklist.md` so it stays local and untracked.
