/* A ceiling on the practise take and the passage step (phase 8 audit issue
   04), in the shape the vowel step's own ceiling already takes: a constant
   compared against `session.secondsCaptured()` inside the poll, calling the
   same `stop()` a manual Stop press calls rather than `discard()`, so the
   take is closed properly and stays analysable and saveable.

   A source contract, the same shape EntryEditor.gates.test.ts and
   BodyRegionInspectorSheet.test.ts already use: a `.svelte` file has no
   node-tier mount (ADR-0016), and proving the auto-stop by real elapsed
   time would mean waiting out the ceiling itself - the fake microphone is a
   real oscillator on a real AudioContext clock (tests/fake-microphone.mjs),
   with no way to run it faster than real time. */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('../../..', import.meta.url));
const practise = readFileSync(root + '/src/lib/components/VoicePractice.svelte', 'utf8');
const benchmarkFlow = readFileSync(root + '/src/lib/components/VoiceBenchmarkFlow.svelte', 'utf8');

/** Shared by both describe blocks below: the named constant is declared and
    sits at or under the audit's safe two-minute bound. */
function expectCeilingWithinAuditBound(source: string, constantName: string) {
  const match = source.match(new RegExp(`const ${constantName} = (\\d+);`));
  expect(match).not.toBeNull();
  const seconds = Number(match?.[1]);
  expect(seconds).toBeGreaterThan(0);
  expect(seconds).toBeLessThanOrEqual(120);
}

describe('the practise take stops itself at a ceiling', () => {
  it('defines a ceiling under the audit\'s safe two-minute bound', () => {
    expectCeilingWithinAuditBound(practise, 'PRACTISE_CEILING_SECONDS');
  });

  it('closes the take through stop(), not discard(), once the ceiling is reached', () => {
    expect(practise).toContain(
      'if (session.secondsCaptured() >= PRACTISE_CEILING_SECONDS) {'
    );
    expect(practise).toContain('void stop();');
  });

  it('says what happened when the ceiling stops the take', () => {
    expect(practise).toContain('toast(m.vb_ceiling_stopped());');
  });

  it('says the ceiling exists before the take ever reaches it', () => {
    expect(practise).toContain('m.vb_practise_ceiling_hint()');
  });
});

describe('the passage step stops itself at the same ceiling', () => {
  it('defines a ceiling under the audit\'s safe two-minute bound', () => {
    expectCeilingWithinAuditBound(benchmarkFlow, 'PASSAGE_CEILING_SECONDS');
  });

  it('closes the take through stop(), not discard(), once the ceiling is reached', () => {
    expect(benchmarkFlow).toContain(
      "step === 'passage' && session.secondsCaptured() >= PASSAGE_CEILING_SECONDS"
    );
    expect(benchmarkFlow).toContain('toast(m.vb_ceiling_stopped());');
  });

  it('says the ceiling exists before the take ever reaches it', () => {
    expect(benchmarkFlow).toContain('m.vb_passage_ceiling_hint()');
  });

  it('leaves the vowel step\'s own ten-second ceiling untouched', () => {
    expect(benchmarkFlow).toContain('const VOWEL_CEILING_SECONDS = 10;');
  });
});
