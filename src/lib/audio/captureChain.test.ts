import assert from 'node:assert/strict';
import { test } from 'vitest';
import { captureChainOf, sameCaptureChain } from './captureChain.ts';

const PIXEL = 'Mozilla/5.0 (Linux; Android 16; Pixel 10a Build/BP1A.250505.005) AppleWebKit/537.36';
const DESKTOP = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0';

const UNPROCESSED = { echoCancellation: false, noiseSuppression: false, autoGainControl: false };

test('names the phone the take was recorded on', () => {
  assert.match(captureChainOf('Bottom microphone', UNPROCESSED, PIXEL), /^Pixel 10a \| Bottom microphone \|/);
});

test('falls back to the platform where the user agent names no model', () => {
  assert.match(captureChainOf('Default', UNPROCESSED, DESKTOP), /^X11; Linux x86_64 \|/);
});

test('two phones are two chains', () => {
  const other = 'Mozilla/5.0 (Linux; Android 15; SM-A546B Build/UP1A.231005.007) AppleWebKit/537.36';
  assert.notEqual(captureChainOf('Bottom microphone', UNPROCESSED, PIXEL), captureChainOf('Bottom microphone', UNPROCESSED, other));
});

test('a headset is a different chain from the phone it is plugged into', () => {
  assert.notEqual(captureChainOf('Bottom microphone', UNPROCESSED, PIXEL), captureChainOf('Wired headset', UNPROCESSED, PIXEL));
});

/* The ticket's own case: the constraints are a request, and a device that
   granted them is not the same chain as the same device that did not. */
test('a device that refused a constraint is a different chain from one that granted it', () => {
  const suppressed = { ...UNPROCESSED, noiseSuppression: true };
  assert.notEqual(captureChainOf('Bottom microphone', UNPROCESSED, PIXEL), captureChainOf('Bottom microphone', suppressed, PIXEL));
});

test('each of the three constraints is read separately', () => {
  const chains = new Set([
    captureChainOf('mic', UNPROCESSED, PIXEL),
    captureChainOf('mic', { ...UNPROCESSED, echoCancellation: true }, PIXEL),
    captureChainOf('mic', { ...UNPROCESSED, noiseSuppression: true }, PIXEL),
    captureChainOf('mic', { ...UNPROCESSED, autoGainControl: true }, PIXEL)
  ]);
  assert.equal(chains.size, 4);
});

/* A browser that reports nothing about a constraint has not told us it was
   honoured, and saying so is not the same as saying it was off. */
test('a constraint the browser does not report is neither on nor off', () => {
  const unreported = { echoCancellation: false, noiseSuppression: undefined, autoGainControl: false };
  const chain = captureChainOf('mic', unreported, PIXEL);
  assert.notEqual(chain, captureChainOf('mic', UNPROCESSED, PIXEL));
  assert.notEqual(chain, captureChainOf('mic', { ...UNPROCESSED, noiseSuppression: true }, PIXEL));
});

test('a microphone with no name of its own still makes a chain', () => {
  assert.equal(captureChainOf('  ', UNPROCESSED, PIXEL), captureChainOf('', UNPROCESSED, PIXEL));
});

test('the same equipment twice is the same chain', () => {
  assert.equal(captureChainOf('Bottom microphone', UNPROCESSED, PIXEL), captureChainOf('Bottom microphone', { ...UNPROCESSED }, PIXEL));
  assert.ok(sameCaptureChain(captureChainOf('mic', UNPROCESSED, PIXEL), captureChainOf('mic', UNPROCESSED, PIXEL)));
});

test('an unrecorded chain is not the same as any other, including another unrecorded one', () => {
  const chain = captureChainOf('mic', UNPROCESSED, PIXEL);
  assert.equal(sameCaptureChain(null, chain), false);
  assert.equal(sameCaptureChain(chain, null), false);
  assert.equal(sameCaptureChain(null, null), false);
});
