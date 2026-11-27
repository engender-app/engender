/* Record a benchmark's microphone and processing chain. Mean pitch and
   durations remain comparable across devices; cepstral and formant measures,
   including resonance, need the same chain.

   openMicrophone(true) requests echo cancellation, noise suppression and
   automatic gain control off. Read actual flags from getSettings(), since
   the device may still process audio. Noise suppression changes broadband
   high-frequency energy and gain control changes levels.

   Store the chain as one nullable, readable value in SQLite and Archives.
   sameCaptureChain compares it as a whole. captureChainOfStream in
   stores/voiceRecording.ts reads the live microphone; this module stays pure. */

/** The three constraints `UNPROCESSED_AUDIO` asks for, as the track says
    they were actually applied. `undefined` is a real answer and not an
    absent one: a browser that reports nothing about a constraint has not
    said it was honoured, which is not the same as saying it was off. */
/* CaptureSettings stays exported for its own test, and cross-checked in
   benchmarkDelta.test.ts (AU-09 test-only review). */
export type CaptureSettings = Pick<
  MediaTrackSettings,
  'echoCancellation' | 'noiseSuppression' | 'autoGainControl'
>;

/** Anything with no name of its own. One token for a device the user agent
    does not describe and for a microphone the browser did not label, since
    both mean the same thing: the chain is identified by what is left. */
const UNKNOWN = 'unknown';

const SEPARATOR = ' | ';

/** The fallback name for the equipment, off the user agent's platform.

    A fallback and not the answer: Chrome reduced the Android user agent in
    version 110, freezing the model token to `Android 10; K` on every
    phone, so this cannot tell two phones apart and is not asked to. The
    model proper comes from client hints
    (`captureChainOfStream` in stores/voiceRecording.ts) and this is what
    stands in where they are unavailable - a desktop browser reading
    `X11; Linux x86_64`, or anything that answers nothing at all.

    The Android arm is kept for the same reason: a WebView old enough to
    predate the reduction still carries a real model, and reading it costs
    one regex. What either arm returns is coarse, which is why the
    microphone's own label travels beside it. */
export function deviceFromUserAgent(userAgent: string): string {
  const android = /\bAndroid\s+[^;)]+;\s*([^;)]+?)(?:\s+Build\/[^;)]*)?\s*\)/.exec(userAgent);
  if (android) return clean(android[1]);
  const platform = /\(([^)]*)\)/.exec(userAgent);
  return platform ? clean(platform[1]) : UNKNOWN;
}

/** Trimmed, with the separator taken out so a part cannot pretend to be
    two, and `unknown` where nothing is left. */
function clean(part: string): string {
  const trimmed = part.replaceAll('|', '/').trim();
  return trimmed === '' ? UNKNOWN : trimmed;
}

/** `off` is the benchmark's own request honoured; `on` is the device
    refusing it; `?` is a browser that did not say. */
const applied = (setting: boolean | undefined): string =>
  setting === undefined ? '?' : setting ? 'on' : 'off';

/** The chain one take was recorded through, as it is stored.

    `device` is the phone, resolved by the caller that can ask the platform
    for it; `label` and `settings` come off the take's own audio track.
    Fixed field order and one token per constraint, so two takes made
    through the same equipment produce the same string character for
    character and equality is the whole comparison. */
export function captureChainOf(device: string, label: string, settings: CaptureSettings): string {
  const processing = [
    `ec=${applied(settings.echoCancellation)}`,
    `ns=${applied(settings.noiseSuppression)}`,
    `agc=${applied(settings.autoGainControl)}`
  ].join(' ');
  return [clean(device), clean(label), processing].join(SEPARATOR);
}

/** Whether two takes were recorded through one chain, which is what the
    device-sensitive figures are gated on (audio/benchmarkDelta.ts).

    A missing chain is not a match, not even against another missing one: a
    benchmark from before capture chains were tracked kept no record of
    what recorded it, and two unknowns are not evidence of one phone. Every benchmark this build
    writes carries a chain, and the app has no users, so the case this
    refuses is a fixture rather than a person's history. */
/* sameCaptureChain stays exported only for its own test (AU-09 test-only
   review). */
export function sameCaptureChain(a: string | null, b: string | null): boolean {
  return a !== null && b !== null && a === b;
}

/** Why two chains are not one, for the sentence that breaks an own series.

    `device` covers the microphone as well as the phone, because a headset
    plugged into one handset is as much a change of equipment as a second
    handset: what the person did is swap what the sound went through, and
    the app cannot say which of the two parts mattered. `processing` is the
    same equipment that stopped granting unprocessed capture, or started
    reporting nothing about a constraint - the take is still a take, and
    it is not on the same chain.

    `unrecorded` is either side having no chain at all, and it names no
    equipment on purpose: a row from before capture chains were tracked is
    not evidence of one phone or of two, so the only honest sentence is
    that the app does not
    know what recorded it. Null where the two match, which is the caller's
    signal that the series carries on. */
export type ChainBreak = 'device' | 'processing' | 'unrecorded';

export function captureChainBreak(a: string | null, b: string | null): ChainBreak | null {
  if (a === null || b === null) return 'unrecorded';
  if (sameCaptureChain(a, b)) return null;
  return equipmentOf(a) === equipmentOf(b) ? 'processing' : 'device';
}

/** The device and the microphone, which is everything in the chain but the
    three constraint tokens. Read off the string rather than kept in a
    second column: one string is what travels through the column and the
    archive, and this is the only question anybody asks of its parts. */
function equipmentOf(chain: string): string {
  return chain.split(SEPARATOR).slice(0, 2).join(SEPARATOR);
}
