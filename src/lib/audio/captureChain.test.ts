import assert from 'node:assert/strict';
import { test } from 'vitest';
import { captureChainOf, deviceFromUserAgent, sameCaptureChain, type CaptureSettings } from './captureChain.ts';

const PIXEL = 'Mozilla/5.0 (Linux; Android 16; Pixel 10a Build/BP1A.250505.005) AppleWebKit/537.36';
const REDUCED = 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0';
const DESKTOP = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0';

const UNPROCESSED: CaptureSettings = { echoCancellation: false, noiseSuppression: false, autoGainControl: false };
const chain = (label: string, settings: CaptureSettings = UNPROCESSED, device = 'Pixel 10a') =>
  captureChainOf(device, label, settings);

test('names the phone the take was recorded on', () => {
  assert.match(chain('Bottom microphone'), /^Pixel 10a \| Bottom microphone \|/);
});

test('two phones are two chains', () => {
  assert.notEqual(chain('Bottom microphone'), chain('Bottom microphone', UNPROCESSED, 'SM-A546B'));
});

test('a headset is a different chain from the phone it is plugged into', () => {
  assert.notEqual(chain('Bottom microphone'), chain('Wired headset'));
});

/* The fallback name, for a browser that answers no client hints. Chrome
   reduced the Android user agent in version 110, so the model token there
   is the same 'K' on every phone and this cannot be the model. */
test('the fallback reads an old WebView model, the reduced token, or the platform', () => {
  assert.equal(deviceFromUserAgent(PIXEL), 'Pixel 10a');
  assert.equal(deviceFromUserAgent(REDUCED), 'K');
  assert.equal(deviceFromUserAgent(DESKTOP), 'X11; Linux x86_64');
  assert.equal(deviceFromUserAgent('nothing in parentheses'), 'unknown');
});

/* The ticket's own case: the constraints are a request, and a device that
   granted them is not the same chain as the same device that did not. */
test('a device that refused a constraint is a different chain from one that granted it', () => {
  assert.notEqual(chain('Bottom microphone'), chain('Bottom microphone', { ...UNPROCESSED, noiseSuppression: true }));
});

test('each of the three constraints is read separately', () => {
  const chains = new Set([
    chain('mic'),
    chain('mic', { ...UNPROCESSED, echoCancellation: true }),
    chain('mic', { ...UNPROCESSED, noiseSuppression: true }),
    chain('mic', { ...UNPROCESSED, autoGainControl: true })
  ]);
  assert.equal(chains.size, 4);
});

/* A browser that reports nothing about a constraint has not told us it was
   honoured, and saying so is not the same as saying it was off. */
test('a constraint the browser does not report is neither on nor off', () => {
  const unreported = { echoCancellation: false, noiseSuppression: undefined, autoGainControl: false };
  assert.notEqual(chain('mic', unreported), chain('mic'));
  assert.notEqual(chain('mic', unreported), chain('mic', { ...UNPROCESSED, noiseSuppression: true }));
});

test('a microphone with no name of its own still makes a chain', () => {
  assert.equal(chain('  '), chain(''));
});

test('the same equipment twice is the same chain', () => {
  assert.equal(chain('Bottom microphone'), chain('Bottom microphone', { ...UNPROCESSED }));
  assert.ok(sameCaptureChain(chain('mic'), chain('mic')));
});

test('an unrecorded chain is not the same as any other, including another unrecorded one', () => {
  assert.equal(sameCaptureChain(null, chain('mic')), false);
  assert.equal(sameCaptureChain(chain('mic'), null), false);
  assert.equal(sameCaptureChain(null, null), false);
});
