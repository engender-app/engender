/* What recorded a benchmark (phase 8 features ticket 28, ADR-0061).

   `CONTEXT.md` already says a benchmark is comparable only to benchmarks
   read from the same passage. For some of the figures the microphone
   matters as much as the words: mean pitch and the durations survive a
   change of phone, cepstral and formant measures do not, and a formant is
   what this app's resonance figure is. Without a recorded chain nothing
   downstream can tell those two cases apart at read time, so a trend line
   would run straight through a change of phone and look like a voice
   changing.

   **And asking for unprocessed capture is not the same as getting it.**
   `openMicrophone(true)` requests `echoCancellation`, `noiseSuppression`
   and `autoGainControl` all false and says in its own comment that this is
   a request rather than a guarantee, because a device offering only the
   processed path still opens. `MediaStreamTrack.getSettings()` reports what
   was actually applied, which is why the three flags below are read back
   rather than assumed from what was asked for. Noise suppression works
   hardest on broadband high-frequency energy and automatic gain control
   exists to destroy level differences, so a take recorded under either is a
   different chain from one without on the same phone.

   One string, not a row of columns: nothing compares two chains part by
   part - the only question ever asked of it is whether two takes share one
   (`sameCaptureChain`), and the whole value is what travels in one nullable
   column and through the archive. Written so it reads at the sqlite prompt,
   the same call `pitch_track` makes for a comma-separated track over a BLOB
   of floats.

   Pure, and node-tested: the DOM types are read at the one call site that
   has a live track (stores/voiceBenchmark.ts), and what arrives here is
   three booleans, a label and a user agent string. */

/** The three constraints `UNPROCESSED_AUDIO` asks for, as the track says
    they were actually applied. `undefined` is a real answer and not an
    absent one: a browser that reports nothing about a constraint has not
    said it was honoured, which is not the same as saying it was off. */
export type CaptureSettings = Pick<
  MediaTrackSettings,
  'echoCancellation' | 'noiseSuppression' | 'autoGainControl'
>;

/** Anything with no name of its own. One token for a device the user agent
    does not describe and for a microphone the browser did not label, since
    both mean the same thing: the chain is identified by what is left. */
const UNKNOWN = 'unknown';

const SEPARATOR = ' | ';

/** The phone, as its own browser names it. An Android WebView's user agent
    carries the build model (`Linux; Android 16; Pixel 10a Build/...`), which
    is the one place either of this app's platforms says what hardware it is
    running on - `getSettings()` has no model in it, and a Capacitor device
    plugin would be a dependency for one string.

    Off Android there is no model to read, so the platform token stands in.
    It is stable across browser versions, which is what a chain key needs:
    the version lives outside the parentheses. */
function deviceModel(userAgent: string): string {
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

    `label` and `settings` come off the take's own audio track; `userAgent`
    is `navigator.userAgent`. Fixed field order and one token per
    constraint, so two takes made through the same equipment produce the
    same string character for character and equality is the whole
    comparison. */
export function captureChainOf(label: string, settings: CaptureSettings, userAgent: string): string {
  const processing = [
    `ec=${applied(settings.echoCancellation)}`,
    `ns=${applied(settings.noiseSuppression)}`,
    `agc=${applied(settings.autoGainControl)}`
  ].join(' ');
  return [deviceModel(userAgent), clean(label), processing].join(SEPARATOR);
}

/** Whether two takes were recorded through one chain, which is what the
    device-sensitive figures are gated on (audio/benchmarkDelta.ts).

    A missing chain is not a match, not even against another missing one: a
    benchmark from before ADR-0061 kept no record of what recorded it, and
    two unknowns are not evidence of one phone. Every benchmark this build
    writes carries a chain, and the app has no users, so the case this
    refuses is a fixture rather than a person's history. */
export function sameCaptureChain(a: string | null, b: string | null): boolean {
  return a !== null && b !== null && a === b;
}
