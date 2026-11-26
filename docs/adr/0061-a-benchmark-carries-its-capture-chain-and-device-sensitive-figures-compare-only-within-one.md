# A benchmark carries its capture chain, and device-sensitive figures compare only within one

Status: Accepted
Decided: 2026-09-04
Last reviewed: 2026-11-12
Supersedes: none

A voice benchmark records which phone made it and whether the unprocessed
capture it asked for was actually granted. Figures whose absolute value
does not survive a change of microphone are compared only between
benchmarks that share that chain, the same way `acousticDelta` already
refuses to compare benchmarks that read different passages.

## Why

The microphone matters as much as the words, for some figures. Mean F0
shows no significant effect of recording device or of how the phone is
held (McKenna and colleagues, JASA 2023; Awan and colleagues, JSLHR 2024),
and durations behave the same way. Cepstral peak prominence correlates
well with a reference chain but sits at a fixed offset from it (1.29 dB in
the McKenna study), and smartphone formants failed test-retest outright
(Hu and colleagues, Behavior Research Methods 2024).

So some figures mean something anywhere and some only against the same
person's earlier takes on the same equipment. Without a recorded chain the
app cannot tell which case it is in and would draw a trend line through a
change of phone, which would look like a voice changing.

Requesting unprocessed capture is not getting it. `openMicrophone(true)`
asks for echo cancellation, noise suppression and automatic gain control
all off, and a device that only offers the processed path still opens. A
take recorded with noise suppression silently on is a different chain from
one without, on the same phone. `MediaStreamTrack.getSettings()` reports
what was applied, so the check costs one call.

## What identifies a chain

The device model and whether the three unprocessed constraints were
honoured, stored as one string (`src/lib/audio/captureChain.ts`, read live
by `captureChainOfStream` in `src/lib/stores/voiceRecording.ts`).

Sample rate is left out: `ANALYSIS_SAMPLE_RATE` is a constant, so a column
for it would never vary. Mouth-to-microphone distance matters most in the
literature but cannot be read from the API, so it is a sentence on the
reference sheet, not a stored guess. The recording flow also said it until
a later change left one hint above the passage.

## Consequences

Across a chain change the pair delta keeps the pitch figures and drops the
resonance ones, and says so (`sameChain` in `src/lib/audio/benchmarkDelta.ts`).
The own-series trend breaks visibly at the change with a stated reason.
F0 and durations compare across everything, which is why pitch is the one
figure read as meaningful on its own (ADR-0059).

The gate lives beside `acousticDelta`'s passage check, not in a screen, so
a caller cannot compare across chains by forgetting to look. A missing
chain never matches, not even another missing one.

The column is nullable as a migration must be. The app has no users yet,
so benchmarks that predate it are a fixture problem and the demo and
golden fixtures were regenerated with a chain.

The model stays inside the same encrypted journal as the audio. It is shown
only to the person, and the archive carries it because a restored
benchmark that lost its chain would silently rejoin a series it does not
belong to.

History: decided 2026-09-04; trimmed and its pointer to ADR-0060 moved to ADR-0059 2026-11-02; the recording flow's distance instruction cut 2026-11-12.