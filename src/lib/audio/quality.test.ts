import assert from 'node:assert/strict';
import { test } from 'vitest';
import { clipped, concat, mix, noise, silence, sine, wobblingSine } from './test-support/synth.ts';
import { frameGeometry, rms, trackPitch } from './pitch.ts';
import {
  SPEECH_GATE,
  VOWEL_GATE,
  assessQuality,
  passageGate,
  plausibleRate,
  readingFloorSeconds,
  runningQualitySignals,
  takeSignals
} from './quality.ts';
import type { QualityGate } from './quality.ts';

/* The gate's failure modes are tested as carefully as its happy path: a
   gate that never rejects is worse than no gate, because
   it launders a bad take into a trend chart where nothing downstream can
   tell it from a good one. */

const assess = (
  signal: { samples: Float32Array; sampleRate: number },
  gate: QualityGate = VOWEL_GATE
) =>
  assessQuality(
    takeSignals(signal.samples, signal.sampleRate, trackPitch(signal.samples, signal.sampleRate)),
    gate
  );

/** A held vowel as a good take arrives: room tone under it, three seconds of
    it, level well short of the rails. */
const goodTake = () => mix(sine(190, 3, 16000, 0.4), noise(3, 16000, 0.004));

test('a clean sustained take passes every check', () => {
  const report = assess(goodTake());
  assert.deepEqual(report.failed, []);
  assert.equal(report.passed, true);
});

test('a take driven into the rails fails on clipping and says so', () => {
  const report = assess(clipped(goodTake()));
  assert.ok(report.failed.includes('clipping'), `failed: ${report.failed.join(', ')}`);
  assert.equal(report.passed, false);
  assert.ok(report.peak >= 0.98);
});

test('a take buried in room noise fails on noise', () => {
  const report = assess(mix(sine(190, 3, 16000, 0.06), noise(3, 16000, 0.3)));
  assert.ok(report.failed.includes('noise'), `failed: ${report.failed.join(', ')}`);
  assert.ok(report.snrDb < 15, `snr ${report.snrDb.toFixed(1)} dB`);
});

test('a take shorter than a second and a half of voicing fails on length', () => {
  const report = assess(mix(sine(190, 0.8, 16000, 0.4), noise(0.8, 16000, 0.004)));
  assert.ok(report.failed.includes('tooShort'), `failed: ${report.failed.join(', ')}`);
  assert.ok(report.longestVoicedSeconds < 1.5);
});

test('three seconds broken into bursts is not a sustained vowel', () => {
  const burst = () => mix(sine(190, 0.7, 16000, 0.4), noise(0.7, 16000, 0.004));
  const report = assess(concat(burst(), silence(0.3), burst(), silence(0.3), burst()));
  assert.ok(report.failed.includes('tooShort'), `failed: ${report.failed.join(', ')}`);
  assert.ok(report.voicedSeconds > 1.5, 'the total was long enough, the run was not');
});

test('a wandering pitch fails on steadiness', () => {
  const report = assess(mix(wobblingSine(190, 3, 3), noise(3, 16000, 0.004)));
  assert.ok(report.failed.includes('unsteady'), `failed: ${report.failed.join(', ')}`);
  assert.ok(report.f0Cv !== null && report.f0Cv > 0.08);
});

test('a passage is not held on one note, so steadiness is not asked of it', () => {
  const report = assess(mix(wobblingSine(190, 3, 3), noise(3, 16000, 0.004)), passageGate(15, 'en'));
  assert.deepEqual(report.failed, []);
});

test('several things wrong at once are all named, not just the first', () => {
  const report = assess(clipped(mix(sine(190, 0.8, 16000, 0.4), noise(0.8, 16000, 0.2)), 6));
  assert.ok(report.failed.includes('clipping'));
  assert.ok(report.failed.includes('tooShort'));
  assert.ok(report.failed.length >= 2, `failed: ${report.failed.join(', ')}`);
});

test('a take with no voice in it at all is rejected, not passed on empty', () => {
  const report = assess(noise(3, 16000, 0.2));
  assert.equal(report.passed, false);
  assert.ok(report.failed.includes('tooShort'));
  assert.equal(report.f0Cv, null);
});

test('silence is rejected rather than read as a perfectly steady take', () => {
  const report = assess(silence(3));
  assert.equal(report.passed, false);
  assert.ok(report.failed.includes('tooShort'));
});

/** Words with room between them, which is the only shape that gives the SNR
    enough unvoiced frames to have a floor worth measuring - a held vowel is
    periodic end to end and scores the ceiling instead. */
const spokenTake = () =>
  concat(
    mix(sine(190, 0.4, 16000, 0.3), noise(0.4, 16000, 0.01)),
    noise(0.25, 16000, 0.01),
    mix(sine(210, 0.5, 16000, 0.3), noise(0.5, 16000, 0.01)),
    noise(0.3, 16000, 0.01),
    mix(sine(170, 0.6, 16000, 0.3), noise(0.6, 16000, 0.01))
  );

test('the room floor is read off dB bins, and the bin is all it costs', () => {
  // AU-05 turned the two SNR ranks - the voiced median and the room's quiet
  // quarter - from sorted lists into a 0.01 dB histogram, so that a poll
  // costs the same however long the take is. This is the one number in the
  // gate that moved, so it is pinned: the sorted lists answered 31.4608 dB
  // on this take and the bins answer 31.4600, which is the whole cost. A
  // sweep of 168 room-and-voice combinations put the worst drift anywhere at
  // 0.0066 dB and flipped no verdict; a hundredth of a decibel is the bound
  // quality.ts claims, and anything past it is a bug rather than a rounding.
  assert.ok(
    Math.abs(assess(spokenTake()).snrDb - 31.4608) < 0.01,
    `${assess(spokenTake()).snrDb} against the sorted lists' 31.4608 dB`
  );
});

/* Redesign ticket 41: the two tasks answer to two floors.

   `spokenTake` above is the shape of a read - three voiced bursts under
   0.6s each with pauses between them - and it existed here for the SNR test
   before anything asserted what the gate said about it. What the gate said
   was `tooShort`, because the passage and the vowel shared one constant
   over the longest *unbroken* run, and an honest read has no unbroken run
   longer than a syllable or two. */

/** A read of a passage this many words long. 1.5s of voice carried, against
    English's 0.083s a word: fifteen words ask for 1.24s and clear, thirty
    ask for 2.49s and do not. */
const SHORT_PASSAGE_WORDS = 15;

test('a passage read in the ordinary way clears its own floor', () => {
  const report = assess(spokenTake(), passageGate(SHORT_PASSAGE_WORDS, 'en'));
  assert.deepEqual(report.failed, [], `failed: ${report.failed.join(', ')}`);
  assert.equal(report.passed, true);
  // The reason this used to fail, stated so the regression is legible: the
  // total was there all along, the unbroken run never was.
  assert.ok(report.voicedSeconds > 1.4, `voiced ${report.voicedSeconds.toFixed(2)}s`);
  assert.ok(report.longestVoicedSeconds < 1.5, `longest run ${report.longestVoicedSeconds.toFixed(2)}s`);
});

test('the same read still fails the vowel, which is measured on one note', () => {
  const report = assess(spokenTake(), VOWEL_GATE);
  assert.ok(report.failed.includes('tooShort'), `failed: ${report.failed.join(', ')}`);
});

test('a held note clears the vowel and is not asked to be a passage', () => {
  const held = mix(sine(190, 3, 16000, 0.4), noise(3, 16000, 0.004));
  assert.deepEqual(assess(held, VOWEL_GATE).failed, []);
  /* Three seconds of one note is 3s of voice, so it clears a short
     passage's floor and fails a long one's - the split bites on the floor
     rather than on the shape of the take, which is what makes it a
     different rule and not a second name for the same one. */
  assert.deepEqual(assess(held, passageGate(20, 'en')).failed, []);
  assert.deepEqual(assess(held, passageGate(120, 'en')).failed, ['underRead']);
});

test('feeding each task the other one’s take gives different verdicts', () => {
  const read = spokenTake();
  const held = mix(sine(190, 3, 16000, 0.4), noise(3, 16000, 0.004));
  const passage = passageGate(SHORT_PASSAGE_WORDS, 'en');

  assert.equal(assess(read, passage).passed, true);
  assert.equal(assess(read, VOWEL_GATE).passed, false);
  assert.equal(assess(held, VOWEL_GATE).passed, true);
  assert.equal(assess(held, passageGate(120, 'en')).passed, false);
});

test('the floor scales with the passage, and per language', () => {
  assert.ok(
    Math.abs(readingFloorSeconds(196, 'en') - 2 * readingFloorSeconds(98, 'en')) < 1e-9,
    'twice the words is twice the voice'
  );
  assert.equal(readingFloorSeconds(0, 'en'), 0);
  // 82 Polish words and 98 English ones are the two bundled passages, and
  // Polish asks for more voice per word because its words are longer.
  assert.ok(readingFloorSeconds(1, 'pl') > readingFloorSeconds(1, 'en'));
  // The measured numbers themselves, pinned: ADR-0082 has where they came
  // from, and a change to either is a change to what the app accepts.
  assert.ok(Math.abs(readingFloorSeconds(98, 'en') - 8.134) < 0.001);
  assert.ok(Math.abs(readingFloorSeconds(82, 'pl') - 9.184) < 0.001);
});

test('half a passage does not clear the floor the whole one does', () => {
  /* The same read, cut in half: same pace, same voice, half the words got
     out. A gate that passed this is a gate that lets a half-read store a
     speaking rate twice the true one. */
  const whole = spokenTake();
  const half = concat(
    mix(sine(190, 0.4, 16000, 0.3), noise(0.4, 16000, 0.01)),
    noise(0.25, 16000, 0.01),
    mix(sine(210, 0.35, 16000, 0.3), noise(0.35, 16000, 0.01))
  );
  const gate = passageGate(SHORT_PASSAGE_WORDS, 'en');
  assert.equal(assess(whole, gate).passed, true);
  assert.ok(assess(half, gate).failed.includes('underRead'), `failed: ${assess(half, gate).failed.join(', ')}`);
});

test('free speech is asked nothing about its length', () => {
  // The practise tab. A second of speech is a second of speech there, and
  // the gate has nothing to say about how long somebody spoke for.
  const brief = mix(sine(190, 0.5, 16000, 0.3), noise(0.5, 16000, 0.01));
  assert.deepEqual(assess(brief, SPEECH_GATE).failed, []);
  assert.ok(assess(brief, VOWEL_GATE).failed.includes('tooShort'));
});

test('the live signals and the stored take reach the same verdict', () => {
  /* quality.ts's standing contract, now that there is a floor behind it:
     one accumulator, so the cue somebody watched and the verdict on the
     take that got stored cannot disagree. Driven here over the same frames
     the take is measured from, rather than over a second synthesis of
     them. */
  const gate = passageGate(SHORT_PASSAGE_WORDS, 'en');
  const { samples, sampleRate } = spokenTake();
  const track = trackPitch(samples, sampleRate);
  const { hop, hopSeconds } = frameGeometry(sampleRate);

  const live = runningQualitySignals(hopSeconds);
  live.observeSamples(samples);
  for (const frame of track.frames) {
    const from = Math.round(frame.atSeconds * sampleRate);
    const length = Math.min(hop, samples.length - from);
    if (length <= 0) break;
    live.observeFrame(rms(samples, from, length), frame.hz);
  }

  const watched = assessQuality(live.signals(), gate);
  const stored = assessQuality(takeSignals(samples, sampleRate, track), gate);
  assert.deepEqual(watched.failed, stored.failed);
  assert.equal(watched.passed, stored.passed);
  assert.equal(watched.voicedSeconds, stored.voicedSeconds);
});

test('a rate nobody could have read at is not plausible, a brisk one is', () => {
  // The bundled passages' own keys, and a custom one, which names no
  // language and gets the most permissive ceiling there is rather than a
  // guessed one.
  assert.equal(plausibleRate(180, 'builtin-en'), true);
  assert.equal(plausibleRate(232, 'builtin-en'), true, 'the fastest read measured');
  // Half the English passage at the slowest pace measured stores 313 wpm,
  // which is the case the length floor lets through and this catches.
  assert.equal(plausibleRate(313, 'builtin-en'), false);
  assert.equal(plausibleRate(156, 'builtin-pl'), true, 'the fastest Polish read measured');
  assert.equal(plausibleRate(210, 'builtin-pl'), false, 'half the Polish passage, unhurried');
  // A custom passage names no language, so it takes the more permissive of
  // the two rather than a guessed one: hiding an honest figure is the worse
  // of the two mistakes.
  assert.equal(plausibleRate(290, 'custom-1a2b3c4d'), true);
  assert.equal(plausibleRate(400, 'custom-1a2b3c4d'), false);
});
