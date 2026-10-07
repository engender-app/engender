/* The self-hosting configs in deploy/self-host/ (phase 13 self-hosting ticket
   01) are server blocks and nothing else. Every response header, cache rule
   and compression setting lives in deploy/nginx/journal-headers.conf and
   journal-site.conf, which production and every self-hosted copy include as
   they are. A second copy of the CSP is the kind that falls behind: the first
   change to the policy lands in one file, and the self-hosted origins keep
   the old one with nothing to say so.

   tests/hosting/run.mjs serves the real image and checks what comes back;
   this is the cheap half that runs without Docker. */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from 'vitest';

const DEPLOY = 'deploy';
const SHARED = [
  'deploy/nginx/journal-headers.conf', 'deploy/nginx/journal-site.conf',
  'deploy/nginx/journal-http.conf'
];
const SELF_HOST_SERVERS = ['deploy/self-host/engender.conf', 'deploy/self-host/container.conf'];
// Analytics has its own responses and never serves journal assets.
const ANALYTICS = [
  'deploy/nginx/goatcounter-dashboard.conf', 'deploy/nginx/journal-count-proxy.conf',
  'deploy/nginx/journal-page-count.conf'
];
const DOCKERFILE = 'deploy/self-host/Dockerfile';

/** What only the shared snippets may say. */
const OWNED_BY_SHARED = /\b(add_header|gzip\w*|brotli\w*|expires|location)\b/;

function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? files(join(dir, entry.name)) : [join(dir, entry.name)]
  );
}

/** A config's directives, comments dropped. */
function code(path: string): string {
  return readFileSync(path, 'utf8')
    .split('\n')
    .map((line) => line.replace(/#.*/, ''))
    .join('\n');
}

test('no config under deploy/ restates a header, cache or compression rule', () => {
  const offenders = files(DEPLOY)
    .filter((path) => /\.conf$|Dockerfile$/.test(path))
    .filter((path) => !SHARED.includes(path) && !ANALYTICS.includes(path) && !path.endsWith('journal-brotli.conf'))
    .filter((path) => OWNED_BY_SHARED.test(code(path)));
  expect(offenders).toEqual([]);
});

test('each self-hosted server block serves the shared site rules', () => {
  for (const path of SELF_HOST_SERVERS) {
    expect(code(path), path).toMatch(/include\s+snippets\/engender-journal-site\.conf;/);
  }
});

test('the image installs the shared snippets under the names the site rules include', () => {
  const dockerfile = code(DOCKERFILE);
  expect(code('deploy/nginx/journal-site.conf')).toContain('include snippets/engender-journal-headers.conf;');
  expect(dockerfile).toContain('nginx/journal-headers.conf /etc/nginx/snippets/engender-journal-headers.conf');
  expect(dockerfile).toContain('nginx/journal-site.conf /etc/nginx/snippets/engender-journal-site.conf');
});
