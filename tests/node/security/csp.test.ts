/* Nginx sends a CSP header and the build generates a meta policy with
   inline script hashes. Capacitor only gets the meta policy, so pin all
   required directives there, including connect-src, and compare both
   policies. Check hashes against build/index.html. Run npm run build
   before npm test. */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { expect, test } from 'vitest';

const DOCUMENT = 'build/index.html';
const NGINX_HEADERS = 'deploy/nginx/journal-headers.conf';

/** The three directives CSP says a `<meta>` element cannot deliver: a browser
    parses the policy and ignores these, so a header is their only home. All
    three are listed because the rule is the spec's rather than this app's,
    and only frame-ancestors is in the header today - X-Frame-Options: DENY
    says the same thing to anything old enough not to read it. */
const HEADER_ONLY = ['frame-ancestors', 'report-uri', 'sandbox'];

/** What the built document's meta policy must say, hashes aside.

    Spelled out rather than derived from the header, even though the last test
    below asserts the two agree. Derived, an edit that dropped connect-src from
    both policies at once would keep every test passing, and dropping a
    directive from both is exactly the mistake worth catching - the two files
    are edited by the same hand.

    `script-src` is the one directive whose two policies differ on purpose:
    the header keeps 'unsafe-inline' because it cannot know the hashes and a
    narrower value there would contradict them, and the browser enforces the
    intersection, so what an injected inline script actually meets is this
    list of hashes. Everything else is the header's value verbatim. */
const EXPECTED: Record<string, string[]> = {
  'default-src': ["'self'"],
  'base-uri': ["'self'"],
  'object-src': ["'none'"],
  'frame-src': ["'none'"],
  'form-action': ["'none'"],
  'style-src': ["'self'", "'unsafe-inline'"],
  'img-src': ["'self'", 'blob:', 'data:'],
  'font-src': ["'self'"],
  'connect-src': ["'self'"],
  'worker-src': ["'self'", 'blob:'],
  'manifest-src': ["'self'"],
  'media-src': ["'self'", 'blob:']
};

const html = () => {
  if (!existsSync(DOCUMENT)) throw new Error(`No ${DOCUMENT}. Run \`npm run build\` first.`);
  return readFileSync(DOCUMENT, 'utf8');
};

/** Every script in the document with a body rather than a src. */
function inlineScripts(document: string): string[] {
  return [...document.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((match) => match[1]);
}

function metaPolicy(document: string): string {
  const match = document.match(/<meta http-equiv="content-security-policy" content="([^"]*)"/i);
  if (!match) throw new Error('The built document carries no meta CSP');
  return match[1];
}

/** The nginx header's policy, as shipped in the file that is copied to the box. */
function headerPolicy(): string {
  const conf = readFileSync(NGINX_HEADERS, 'utf8');
  const match = conf.match(/add_header\s+Content-Security-Policy\s+"([^"]*)"/i);
  if (!match) throw new Error(`No Content-Security-Policy in ${NGINX_HEADERS}`);
  return match[1];
}

function directives(policy: string): Record<string, string[]> {
  return Object.fromEntries(
    policy
      .split(';')
      .map((part) => part.trim().split(/\s+/))
      .filter(([name]) => name)
      .map(([name, ...sources]) => [name, sources])
  );
}

test('every inline script in the built document is covered by the meta CSP', () => {
  const document = html();
  const policy = metaPolicy(document);
  const scripts = inlineScripts(document);

  // Two of them: the boot-preference stamp from app.html and SvelteKit's start
  // call. A third would mean something new needs hashing too.
  expect(scripts).toHaveLength(2);

  const uncovered = scripts.filter(
    (body) => !policy.includes(`'sha256-${createHash('sha256').update(body).digest('base64')}'`)
  );
  expect(uncovered.map((body) => body.slice(0, 80))).toEqual([]);
});

test('the meta CSP allows no inline script it has not hashed', () => {
  const script = directives(metaPolicy(html()))['script-src'];
  expect(script).not.toContain("'unsafe-inline'");
  expect(script).not.toContain("'unsafe-eval'");
  // WASM compilation is not eval, and both SQLite and Argon2 need it.
  expect(script).toContain("'wasm-unsafe-eval'");
  expect(script).toContain("'self'");
});

test('the meta CSP carries the whole directive set, not the script half alone', () => {
  const meta = directives(metaPolicy(html()));

  for (const [name, sources] of Object.entries(EXPECTED)) {
    expect(meta[name], `meta CSP is missing ${name}`).toEqual(sources);
  }
  for (const name of HEADER_ONLY) {
    expect(Object.keys(meta), `${name} is ignored in a meta policy`).not.toContain(name);
  }
});

/* This one reaches into deploy/nginx/journal-headers.conf, which no other node
   test does. The reason is the defect it guards: the two policies drifting
   apart is what left Android with the script half alone for two releases. A
   deliberate change to the header is therefore a change to both places and to
   EXPECTED above - that this test fails first is the intent, not a snag. */
test('the two policies name the same directives, so neither platform gets less', () => {
  const meta = directives(metaPolicy(html()));
  const header = directives(headerPolicy());

  const missingFromMeta = Object.keys(header).filter(
    (name) => !HEADER_ONLY.includes(name) && !(name in meta)
  );
  expect(missingFromMeta, 'the header sends these and the document does not').toEqual([]);

  const missingFromHeader = Object.keys(meta).filter((name) => !(name in header));
  expect(missingFromHeader, 'the document carries these and the header does not').toEqual([]);

  // script-src excepted: see EXPECTED's note on why the two differ there.
  const disagreeing = Object.keys(meta).filter(
    (name) => name !== 'script-src' && header[name].join(' ') !== meta[name].join(' ')
  );
  expect(disagreeing, 'these directives say different things in the two policies').toEqual([]);
});

test('the built document loads no script from anywhere but its own origin', () => {
  const sources = [...html().matchAll(/<script[^>]*\bsrc="([^"]*)"/g)].map((match) => match[1]);
  expect(sources.filter((src) => /^[a-z]+:|^\/\//i.test(src))).toEqual([]);
});
