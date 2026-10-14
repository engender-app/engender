/* Run after VITE_DEMO=1 npm run build. Use BROWSER_ENGINE=firefox for the
   Firefox profile check. Each run owns and removes its synthetic profile. */
import assert from 'node:assert/strict';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { browserEngine, launchPersistentBrowser } from './browser-harness.mjs';
import { serveBuild } from './serve-build.mjs';
import { SEARCH_RETURN_CANARY, searchReturnFlow } from './search-return-flow.mjs';

// Firefox compresses session files. Decode them before scanning because a
// raw scan of compressed bytes can miss the retained query.
function sessionBytes(data) {
  if (!data.subarray(0, 8).equals(Buffer.from('mozLz40\0'))) return data;
  const output = Buffer.alloc(data.readUInt32LE(8));
  let input = 12;
  let written = 0;
  const length = (initial) => {
    let count = initial;
    if (initial === 15) {
      let extra;
      do { extra = data[input++]; count += extra; } while (extra === 255);
    }
    return count;
  };
  while (input < data.length) {
    const token = data[input++];
    const literal = length(token >> 4);
    data.copy(output, written, input, input + literal);
    input += literal;
    written += literal;
    if (input >= data.length) break;
    const offset = data.readUInt16LE(input);
    input += 2;
    const match = length(token & 15) + 4;
    for (let index = 0; index < match; index++) {
      output[written] = output[written - offset];
      written++;
    }
  }
  assert.equal(written, output.length, 'Firefox session file must decode completely');
  return output;
}

async function scan(directory) {
  const needles = [Buffer.from(SEARCH_RETURN_CANARY), Buffer.from(SEARCH_RETURN_CANARY, 'utf16le')];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await scan(path);
    else if (entry.isFile()) {
      const bytes = sessionBytes(await readFile(path));
      assert.ok(!needles.some((needle) => bytes.includes(needle)), `Search term persisted in ${path}`);
    }
  }
}

const profile = await mkdtemp(join(tmpdir(), 'engender-search-return-'));
let server;
let context;
try {
  server = await serveBuild(process.cwd());
  context = await launchPersistentBrowser(profile, { viewport: { width: 412, height: 915 } });
  const page = context.pages()[0] ?? await context.newPage();
  await page.goto(`http://localhost:${server.httpServer.address().port}`);
  const result = await searchReturnFlow(page);
  assert.equal(result.storedQuery, false, 'Journal search must stay out of Web Storage');
  await context.close();
  context = null;
  await scan(profile);
  console.log(`PASS ${browserEngine()} search restored; closed profile has no held query`);
} finally {
  await context?.close();
  await server?.close();
  await rm(profile, { recursive: true, force: true });
}
