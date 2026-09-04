import assert from 'node:assert/strict';
import { test } from 'vitest';
import { sine } from './test-support/synth.ts';
import { trackPitch } from './pitch.ts';
import {
  PITCH_TRACK_HZ,
  decodePitchTrack,
  downsamplePitchTrack,
  encodePitchTrack
} from './track.ts';

/* The stored track (phase 8 features ticket 09, seam 1). What is proved
   here is the arithmetic between the tracker's 10 ms frames and the row's
   own column: how many points a passage becomes, what an unvoiced stretch
   becomes, and that a row written out and read back is the same track. */

test('a thirty-second passage becomes about a hundred and twenty points', () => {
  // Frames straight from the geometry rather than from real audio: this is
  // arithmetic over a frame grid, and thirty seconds of synthesized speech
  // would spend a minute of the suite proving nothing extra.
  const frames = Array.from({ length: 3000 }, (_, i) => ({ atSeconds: i * 0.01, hz: 180 }));
  const points = downsamplePitchTrack(frames);
  assert.equal(points.length, 120);
  assert.equal(PITCH_TRACK_HZ, 4);
});

test('each point is the median of the frames under it', () => {
  // One quarter-second bucket, four frames wide at a 62.5 ms hop.
  const frames = [
    { atSeconds: 0, hz: 100 },
    { atSeconds: 0.0625, hz: 300 },
    { atSeconds: 0.125, hz: 200 },
    { atSeconds: 0.1875, hz: 220 }
  ];
  assert.deepEqual(downsamplePitchTrack(frames), [210]);
});

test('a bucket with no voiced frame in it is a hole, not a zero', () => {
  const frames = [
    { atSeconds: 0, hz: 180 },
    { atSeconds: 0.25, hz: null },
    { atSeconds: 0.5, hz: 190 }
  ];
  assert.deepEqual(downsamplePitchTrack(frames), [180, null, 190]);
});

test('a bucket keeps its voiced frames when only some of them are voiced', () => {
  const frames = [
    { atSeconds: 0, hz: 180 },
    { atSeconds: 0.05, hz: null },
    { atSeconds: 0.1, hz: 200 },
    { atSeconds: 0.15, hz: null },
    { atSeconds: 0.2, hz: null }
  ];
  assert.deepEqual(downsamplePitchTrack(frames), [190]);
});

test('trailing holes are dropped so the track ends at the last voiced point', () => {
  const frames = [
    { atSeconds: 0, hz: 180 },
    { atSeconds: 0.25, hz: null },
    { atSeconds: 0.5, hz: null }
  ];
  assert.deepEqual(downsamplePitchTrack(frames), [180]);
});

test('a passage nobody voiced downsamples to nothing at all', () => {
  const frames = [
    { atSeconds: 0, hz: null },
    { atSeconds: 0.25, hz: null }
  ];
  assert.deepEqual(downsamplePitchTrack(frames), []);
  assert.equal(encodePitchTrack([]), null);
});

test('a real take downsamples to a track the same shape as the passage', () => {
  const track = trackPitch(sine(180, 2).samples, 16000);
  const points = downsamplePitchTrack(track.frames);
  // Two seconds at four hertz, less the frames at the end that YIN needs
  // the samples after to compute.
  assert.ok(points.length >= 6 && points.length <= 8, `${points.length} points`);
  for (const hz of points) {
    assert.ok(hz !== null && Math.abs(hz - 180) <= 1, `${hz} Hz`);
  }
});

test('a track written to a row and read back is the same track', () => {
  const points = [181.44, null, 190.06, 205.5];
  const stored = encodePitchTrack(points);
  assert.equal(stored, '181.4,,190.1,205.5');
  assert.deepEqual(decodePitchTrack(stored), [
    { atSeconds: 0, hz: 181.4 },
    { atSeconds: 0.25, hz: null },
    { atSeconds: 0.5, hz: 190.1 },
    { atSeconds: 0.75, hz: 205.5 }
  ]);
});

test('a benchmark from before the column has no track rather than an empty one', () => {
  assert.equal(decodePitchTrack(null), null);
  assert.equal(decodePitchTrack(''), null);
});
