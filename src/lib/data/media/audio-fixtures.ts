/* Header-only audio containers for tests: the metadata a reader of the
   duration finds, and not a frame a decoder could expand. */

const ascii = (s: string): number[] => [...s].map((c) => c.charCodeAt(0));
const be = (n: number, bytes: number): number[] => Array.from({ length: bytes }, (_, i) => Math.floor(n / 2 ** (8 * (bytes - 1 - i))) & 255);
const le = (n: number, bytes: number): number[] => be(n, bytes).reverse();

/** An EBML element with a one-byte size (fine for these small payloads). */
const ebml = (id: number[], payload: number[]): number[] => [...id, 0x80 | payload.length, ...payload];

/** A WebM like Chromium's MediaRecorder writes it: the Segment has unknown
    size, and `duration` is present only when the writer knew it. Without
    one, the length shows only in the clusters' own timecodes. */
export function webm(options: { seconds?: number; channels?: number; lastClusterSeconds?: number }): Uint8Array {
  const { seconds, channels = 1, lastClusterSeconds } = options;
  const f32 = new Uint8Array(new Float32Array([(seconds ?? 0) * 1000]).buffer);
  const info = ebml(
    [0x15, 0x49, 0xa9, 0x66],
    [...ebml([0x2a, 0xd7, 0xb1], be(1_000_000, 3)), ...(seconds === undefined ? [] : ebml([0x44, 0x89], [...f32].reverse()))]
  );
  const tracks = ebml([0x16, 0x54, 0xae, 0x6b], ebml([0xae], ebml([0xe1], ebml([0x9f], [channels]))));
  const clusters = (lastClusterSeconds === undefined ? [0] : [0, lastClusterSeconds * 1000]).flatMap((ms) =>
    ebml([0x1f, 0x43, 0xb6, 0x75], ebml([0xe7], be(ms, 4)))
  );
  return new Uint8Array([
    ...ebml([0x1a, 0x45, 0xdf, 0xa3], ebml([0x42, 0x82], ascii('webm'))),
    0x18, 0x53, 0x80, 0x67, 0x01, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff,
    ...info, ...tracks, ...clusters
  ]);
}

/** A PCM WAV whose header says `seconds` long; the data chunk is `dataBytes` of silence. */
export function wav(options: { seconds: number; channels?: number; rate?: number; dataBytes?: number }): Uint8Array {
  const { seconds, channels = 1, rate = 8000 } = options;
  const byteRate = rate * channels * 2;
  const declared = Math.round(seconds * byteRate);
  const dataBytes = options.dataBytes ?? declared;
  return new Uint8Array([
    ...ascii('RIFF'), ...le(36 + declared, 4), ...ascii('WAVE'),
    ...ascii('fmt '), ...le(16, 4), ...le(1, 2), ...le(channels, 2), ...le(rate, 4), ...le(byteRate, 4), ...le(channels * 2, 2), ...le(16, 2),
    ...ascii('data'), ...le(declared, 4),
    ...new Array(dataBytes).fill(0)
  ]);
}

/** An Ogg Opus stream: the ID header page, then a last page whose granule position says how long it is. */
export function oggOpus(options: { seconds: number; channels?: number }): Uint8Array {
  const { seconds, channels = 1 } = options;
  const page = (granule: number, payload: number[]) => [
    ...ascii('OggS'), 0, 0, ...le(granule, 8), ...le(1, 4), ...le(0, 4), ...le(0, 4), 1, payload.length, ...payload
  ];
  const head = [...ascii('OpusHead'), 1, channels, ...le(312, 2), ...le(48000, 4), ...le(0, 2), 0];
  return new Uint8Array([...page(0, head), ...page(Math.round(seconds * 48000) + 312, [1, 2, 3])]);
}

/** An MP4 audio file whose moov/mvhd says `seconds` long. */
export function mp4(options: { seconds: number; channels?: number }): Uint8Array {
  const { seconds, channels = 1 } = options;
  const box = (type: string, payload: number[]) => [...be(8 + payload.length, 4), ...ascii(type), ...payload];
  const timescale = 1000;
  const mvhd = box('mvhd', [0, 0, 0, 0, ...be(0, 4), ...be(0, 4), ...be(timescale, 4), ...be(Math.round(seconds * timescale), 4), ...new Array(80).fill(0)]);
  const mp4a = box('mp4a', [...new Array(6).fill(0), 0, 1, ...new Array(8).fill(0), ...be(channels, 2), 0, 16, ...new Array(20).fill(0)]);
  return new Uint8Array([...box('ftyp', [...ascii('M4A '), 0, 0, 0, 0]), ...box('moov', [...mvhd, ...mp4a])]);
}
