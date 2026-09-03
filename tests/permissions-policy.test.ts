/* The deployed nginx header sends `Permissions-Policy` with an empty
   allowlist for every feature the app does not use (phase 2 ticket 05). An
   empty allowlist denies the page's own origin too, not just embeds, and
   nothing in dev sets this header at all - so a feature that opens a
   microphone or camera can pass every local check and still be dead on the
   deployed origin, silently (phase 8 ticket 01).

   This derives the set of browser capabilities the app actually calls from
   the source, rather than hard-coding it, so a new getUserMedia call for a
   capability the header still denies fails here instead of shipping dark. */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from 'vitest';

const SRC_DIR = 'src';
const NGINX_HEADERS = 'deploy/nginx/journal-headers.conf';

/** Every getUserMedia constraint object requires at least one Permissions-Policy
    feature. Add an entry here only when a new key means a new feature - this
    is the one place the mapping is stated, not the source. */
const FEATURE_KEYS: Record<string, RegExp> = {
  camera: /\bvideo\s*:/,
  microphone: /\baudio\s*:/
};

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    if (entry.name.endsWith('.test.ts') || !/\.(ts|svelte)$/.test(entry.name)) return [];
    return [path];
  });
}

/** The text of one getUserMedia(...) call's argument, one nesting level of
    parens deep - enough for `getUserMedia(helper())` as well as a literal
    object, and nothing here needs more than that. */
function callArguments(text: string): string[] {
  return [...text.matchAll(/getUserMedia\(((?:[^()]|\([^()]*\))*)\)/g)].map((match) => match[1]);
}

/** A call that passes constraints through a named helper rather than a
    literal - `getUserMedia(videoCaptureConstraints())` - is resolved by
    finding that helper's own body wherever it is defined, so the keys it
    returns count the same as if they were written at the call site. */
function resolveHelper(name: string, files: { text: string }[]): string {
  for (const { text } of files) {
    const signature = text.match(
      new RegExp(`(?:function\\s+${name}\\s*\\([^)]*\\)[^{]*\\{|const\\s+${name}\\s*=[^{]*\\{)`)
    );
    if (!signature || signature.index === undefined) continue;
    let depth = 0;
    for (let i = signature.index + signature[0].length - 1; i < text.length; i++) {
      if (text[i] === '{') depth++;
      else if (text[i] === '}' && --depth === 0) return text.slice(signature.index, i + 1);
    }
  }
  throw new Error(`No definition found for ${name}() - a getUserMedia call passes it as an argument`);
}

/** The Permissions-Policy features the app's own calls require, read from
    the source rather than asserted by hand. */
function requestedFeatures(): Set<string> {
  const files = sourceFiles(SRC_DIR).map((path) => ({ path, text: readFileSync(path, 'utf8') }));
  const features = new Set<string>();

  for (const { text } of files) {
    for (const rawArg of callArguments(text)) {
      const arg = rawArg.trim();
      const helperName = arg.match(/^(\w+)\(\s*\)$/)?.[1];
      const constraintText = arg.startsWith('{') ? arg : resolveHelper(helperName ?? arg, files);

      for (const [feature, pattern] of Object.entries(FEATURE_KEYS)) {
        if (pattern.test(constraintText)) features.add(feature);
      }
    }
  }

  return features;
}

function permissionsPolicy(): Record<string, string> {
  const conf = readFileSync(NGINX_HEADERS, 'utf8');
  const match = conf.match(/add_header\s+Permissions-Policy\s+"([^"]*)"/i);
  if (!match) throw new Error(`No Permissions-Policy in ${NGINX_HEADERS}`);
  return Object.fromEntries(
    match[1].split(',').map((part) => {
      const directive = part.trim().match(/^([a-z-]+)=\(([^)]*)\)$/);
      if (!directive) throw new Error(`Could not parse Permissions-Policy directive: ${part}`);
      return [directive[1], directive[2]];
    })
  );
}

test('every browser capability the app calls is allowed in the deployed Permissions-Policy', () => {
  const policy = permissionsPolicy();
  const features = requestedFeatures();

  // Guards the guard: if this comes back empty, callArguments() or the
  // FEATURE_KEYS regexes stopped matching the real call sites and the test
  // below would pass for the wrong reason.
  expect([...features].sort()).toEqual(['camera', 'microphone']);

  const denied = [...features].filter((feature) => !policy[feature]?.includes('self'));
  expect(denied, `Permissions-Policy denies these on the deployed origin`).toEqual([]);
});

test('nothing else in the Permissions-Policy is widened past self', () => {
  const policy = permissionsPolicy();
  const selfOrEmpty = Object.entries(policy).filter(([, allowlist]) => allowlist === '' || allowlist === 'self');
  expect(selfOrEmpty).toHaveLength(Object.keys(policy).length);
});
