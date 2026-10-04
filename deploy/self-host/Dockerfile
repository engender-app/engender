# nginx with engender's serving rules (phase 13 self-hosting ticket 01).
# Build from the repository's deploy/ directory:
#
#   docker build -t engender -f deploy/self-host/Dockerfile deploy
#
# and mount an unpacked release bundle at /srv/engender. It serves plain HTTP
# on port 80: TLS is the job of the reverse proxy you put in front, and the app
# will not start without it. deploy/SELF-HOSTING.md has the rest.
#
# Docker Official Image index from docker.io/library/nginx:1.27-alpine.
FROM nginx:1.27-alpine@sha256:65645c7bb6a0661892a8b03b89d0743208a18dd2f3f17a54ef4b76fb8e2f2a10

COPY nginx/journal-headers.conf /etc/nginx/snippets/engender-journal-headers.conf
COPY nginx/journal-site.conf /etc/nginx/snippets/engender-journal-site.conf
COPY self-host/container.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
