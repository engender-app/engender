/* The production CSP is split across two policies (phase 2 ticket 05): a header
   from nginx, and a meta policy SvelteKit writes into the document because only
   a build knows the hashes of the scripts inside it. This file guards the half
   that can drift silently - a hash that no longer matches blocks the script it
   was for, and nothing about the build fails.

   It reads `build/`, so it needs a build. `npm run build` runs before `npm test`
   in CI for two other reasons already. */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { expect, test } from 'vitest';

const DOCUMENT = 'build/index.html';

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
  const policy = metaPolicy(html());
  expect(policy).not.toContain("'unsafe-inline'");
  expect(policy).not.toContain("'unsafe-eval'");
  // WASM compilation is not eval, and both SQLite and Argon2 need it.
  expect(policy).toContain("'wasm-unsafe-eval'");
});

test('the built document loads no script from anywhere but its own origin', () => {
  const sources = [...html().matchAll(/<script[^>]*\bsrc="([^"]*)"/g)].map((match) => match[1]);
  expect(sources.filter((src) => /^[a-z]+:|^\/\//i.test(src))).toEqual([]);
});
