# Self-hosting engender

The web app is a folder of static files. There is no server component, no
database and no account system behind it, so hosting your own copy comes
down to serving that folder over HTTPS with the right headers. You don't need
to fork or rebuild anything: every release publishes the same bundle that
`app.engender.dev` serves.

This page covers the two supported setups: a Docker image behind a reverse
proxy you already run, or nginx directly on the host. The production setup
for `app.engender.dev` is in [README.md](README.md).

## Before you start

- **HTTPS is required.** The service worker, the on-device database (OPFS)
  and passkeys only work in a secure context. Over plain HTTP the app will
  not start. `http://localhost` counts as secure, which is fine for trying
  it out and nothing else.
- **Serve it over HTTP/2.** A first visit loads about a hundred files. Over
  HTTP/1.1 a browser fetches six at a time, and on a slow phone the
  2026-10-03 performance audit measured the first screen at about 6.0 s against
  about 3.5 s over HTTP/2, before this release's first frame. Nobody has
  remeasured HTTP/1.1 since, so read those as the audit's numbers, not ours
  for this release. Caddy and the nginx template below speak HTTP/2 already. The
  Docker image listens on plain port 80, so the proxy in front of it is the
  place that matters: don't put it in front of the browser as HTTP/1.1.
- **Serve it from the root of a host name.** `journal.example.org` works.
  `example.org/engender/` does not: the offline shell answers every
  navigation with one cached document, and the asset paths in it assume `/`.
- **The headers are part of the app.** The Content-Security-Policy is what
  stops an injected script from sending a journal's key to another origin,
  and the cache rules are what keep one page load from mixing files from two
  releases. Both setups below install them from
  `deploy/nginx/journal-headers.conf` and `deploy/nginx/journal-site.conf`,
  the files production uses. Don't add your own CSP or cache headers in
  front, and don't let a proxy strip these.

## What each origin keeps to itself

Journals live in the browser's storage for one origin, and passkeys are bound
to it too. Hosting your own copy does not move anyone's data:

- A journal kept on `app.engender.dev` will not appear on your host, and the
  reverse is also true. To move, a person exports a backup from Export &
  import in Settings, sets the app up on the new origin (unlocking included),
  and restores the backup there with Import backup.
- Changing your host name later strands every journal on the old one in the
  same way. Pick a name you mean to keep, and tell people to export before
  you move.
- There is nothing you can do on the server to help with either. The
  server never sees a journal.

## Get a release

Download three files from the
[releases page](https://github.com/engender-app/engender/releases), with
`1.0.0` standing in for the version you want:

- `engender-web-1.0.0.tar.gz`, the app itself
- `engender-src-1.0.0.tar.gz`, the source, which carries the configs in
  `deploy/`
- `SHA256SUMS`

Check them and unpack:

```bash
sha256sum --check --ignore-missing SHA256SUMS
tar -xzf engender-src-1.0.0.tar.gz        # makes engender-1.0.0/
mkdir -p /srv/engender/1.0.0
tar -xzf engender-web-1.0.0.tar.gz -C /srv/engender/1.0.0
```

A release can be rebuilt from its tag byte for byte. If you would rather not
trust the published bundle, `npm ci && node scripts/package-release.mjs` on a
checkout of the tag builds it again, and the checksum should match.

## Option 1: Docker behind your reverse proxy

The image is stock nginx with the two snippets and a plain-HTTP server block
(`deploy/self-host/container.conf`). The bundle is mounted into it, not built
in, so an update does not need a new image.

```bash
docker build -t engender -f engender-1.0.0/deploy/self-host/Dockerfile engender-1.0.0/deploy
docker run -d --name engender --restart unless-stopped \
  -p 127.0.0.1:8080:80 \
  -v /srv/engender/1.0.0:/srv/engender:ro \
  engender
```

On a host with SELinux (Fedora, RHEL), write the mount as
`/srv/engender/1.0.0:/srv/engender:ro,z`.

Then point your reverse proxy at `127.0.0.1:8080` and let it handle HTTPS. For
Caddy, the whole site block is:

```
journal.example.org {
    reverse_proxy 127.0.0.1:8080
}
```

Caddy passes response headers through unchanged by default. Check with
`curl -sI https://journal.example.org/` that `content-security-policy` and
`cross-origin-embedder-policy` arrive.

## Option 2: nginx on the host

This needs nginx 1.25.1 or newer for the template's `http2 on;`. On an older
one, delete that line and write `listen 443 ssl http2;` instead.

Put the release in place first. `scripts/journal-release.mjs` from the source
archive copies it in whole and only then points a `current` symlink at it, so
no request ever sees a half-copied release (the repository tests with
Node 24):

```bash
cd engender-1.0.0
node scripts/journal-release.mjs deploy /srv/engender/1.0.0 \
  --root /srv/engender/releases --current /srv/engender/current
```

If you'd rather not use it, skip this and point `root` at the unpacked bundle
in the next step.

You need a certificate before nginx will accept the config. With certbot,
`sudo certbot certonly --nginx -d journal.example.org` gets one without
touching any site, and its paths are
`/etc/letsencrypt/live/journal.example.org/fullchain.pem` and `privkey.pem`.

Copy the shared snippets and the template in:

```bash
sudo cp deploy/nginx/journal-headers.conf /etc/nginx/snippets/engender-journal-headers.conf
sudo cp deploy/nginx/journal-site.conf /etc/nginx/snippets/engender-journal-site.conf
sudo cp deploy/self-host/engender.conf /etc/nginx/sites-available/engender.conf
```

Edit `/etc/nginx/sites-available/engender.conf`. The lines to change are
marked `EDIT`: the host name, the certificate paths and the root. Then
enable it:

```bash
sudo ln -sf /etc/nginx/sites-available/engender.conf /etc/nginx/sites-enabled/engender.conf
sudo nginx -t && sudo systemctl reload nginx
```

Brotli is optional and has an install order that matters, see
[README.md](README.md#nginx-setup).

## Updating

Never unpack a new release over the old one while it is being served. A
browser that fetches the new `index.html` before the new chunks are in place
gets a page that cannot load.

- **Docker:** unpack into a new directory, such as `/srv/engender/1.1.0`, then
  `docker rm -f engender` and run the same `docker run` with the new path.
- **nginx:** run `journal-release.mjs deploy` with the new bundle, or unpack
  into a new directory and change `root`.

Also bring the configs up to date from the new source archive. Releases can
change the headers: when the CSP gains a directive the app needs, an old
snippet will block it. For Docker, rebuild the image from the new
`deploy/`. For nginx, copy the two snippets again.

People with the app open keep the release they started with. The new one
installs in the background and the app offers it with a notice, never while a
write, migration or import is running, and it only takes over when the person
taps. There is no need to pick a quiet hour.

Rolling back is safe until a release changes the journal's schema.
`release.json` in each bundle says which schema it goes up to as `schemaMax`,
and a release with a lower number cannot open journals a newer one has
already migrated. `journal-release.mjs rollback` refuses such a rollback
unless you pass `--force`. With Docker, compare `schemaMax` yourself before
pointing the container at an older directory.

## Checking your setup

The repository's own check runs against this image. From a checkout with
Docker running:

```bash
npm ci && npm run build && npm run verify:hosting
```

It builds the image, serves a fresh build through it, checks the headers,
cache rules and SPA fallback, installs the app in a headless Chromium and
restarts it offline. It also runs `nginx -t` over the bare-nginx template.
