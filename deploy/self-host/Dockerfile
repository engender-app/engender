# nginx with engender's serving rules (phase 13 self-hosting ticket 01).
# Build from the repository's deploy/ directory:
#
#   docker build -t engender -f deploy/self-host/Dockerfile deploy
#
# and mount an unpacked release bundle at /srv/engender. deploy/SELF-HOSTING.md
# has the rest, including why HTTPS has to be in front of it.
#
# The same nginx version tests/hosting/run.mjs has always checked the rules on.
FROM nginx:1.27-alpine

COPY nginx/journal-headers.conf /etc/nginx/snippets/engender-journal-headers.conf
COPY nginx/journal-site.conf /etc/nginx/snippets/engender-journal-site.conf
COPY self-host/container.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
