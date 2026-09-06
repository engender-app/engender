/* One module decides how a picked file's bytes come in (phase 9 audit
   ticket 06).

   The finding that ticket started from was not that base64 was chosen once
   - it was that the pick path never got the treatment writes and file-store
   reads both already had, and then that a second caller (the OCR lab) had
   copied the base64 decode rather than reusing it. Two decoders is how the
   first one survives a fix to the other.

   So: `readPickedOverChannel` is the fast transport and `readPickedBase64`
   is the floor's fallback, and only `picker.ts` gets to choose between
   them, through the `androidPickedBytes` it exports for everyone else.
   Anything else naming either transport is a third decode being written,
   and the answer is to call `androidPickedBytes` instead of widening this
   list. */

import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { test } from 'vitest';

const src = fileURLToPath(new URL('../src/', import.meta.url));

/** Where each transport is allowed to be named: the module that owns it,
    and the one module that chooses between them. */
const TRANSPORTS: [name: string, allowed: string[]][] = [
  [
    'readPickedOverChannel',
    ['lib/data/photos/android-pick-channel.ts', 'lib/data/photos/picker.ts']
  ],
  ['readPickedBase64', ['lib/data/photos/android-bridge.ts', 'lib/data/photos/picker.ts']]
];

/** The code with its comments taken out, the same crude pass and for the
    same reason tests/webview-floor.test.ts gives: this repo's comments
    discuss these transports by name - android-pick-channel.ts's header is
    about which one it is and what the other costs - and a rule that read
    comments would have to be argued with rather than fixed. */
const withoutComments = (code: string): string =>
  code.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

function sources(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) sources(path, found);
    else if (/\.(ts|svelte)$/.test(entry.name) && !entry.name.endsWith('.test.ts')) found.push(path);
  }
  return found;
}

test('only picker.ts chooses which transport a picked file arrives over', () => {
  const offences: string[] = [];

  for (const file of sources(src)) {
    const relative = file.slice(src.length);
    const code = withoutComments(readFileSync(file, 'utf8'));
    for (const [name, allowed] of TRANSPORTS) {
      if (allowed.includes(relative)) continue;
      if (code.includes(name)) offences.push(`${relative} names ${name}`);
    }
  }

  assert.deepEqual(
    offences,
    [],
    `these should call androidPickedBytes() from data/photos/picker.ts instead:\n  ${offences.join('\n  ')}`
  );
});

/** The companion check every registry rule in this repo carries: the rule
    above can fail. Without this, a typo in either transport's name would
    make it pass over a tree that has three decoders in it - and the same
    comment-stripping, so a name that survived only in prose could not
    stand in for the real thing either. */
test('the rule can fail', () => {
  const named = TRANSPORTS.map(([name, allowed]) => {
    const owner = withoutComments(readFileSync(join(src, allowed[0]), 'utf8'));
    return owner.includes(name);
  });

  assert.deepEqual(
    named,
    [true, true],
    'a transport this rule names is not in the file it says owns it, so the rule matches nothing'
  );
});
