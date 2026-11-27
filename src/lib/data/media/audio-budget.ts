/* Read duration and channels before decoding PCM. The waveform
   budget allows two hours of stereo at 8 kHz (about 230 MB) or
   thirty minutes with eight channels. Oversized audio still stores
   and plays with a plain track. The app's 10 MiB recording limit
   holds about 43 minutes of its Opus. */

import { MediaBudgetError } from './budget';

export const MAX_AUDIO_SECONDS = 2 * 60 * 60;
export const MAX_AUDIO_CHANNEL_SECONDS = 4 * 60 * 60;

export interface AudioInfo {
  /** Declared length, or null when the container does not say. */
  seconds: number | null;
  /** Declared channel count, or null. */
  channels: number | null;
}

const tagAt = (b: Uint8Array, at: number, text: string): boolean =>
  at >= 0 && b.length >= at + text.length && [...text].every((c, i) => b[at + i] === c.charCodeAt(0));
const u16le = (b: Uint8Array, at: number): number => b[at] | (b[at + 1] << 8);
const u32le = (b: Uint8Array, at: number): number => (b[at] | (b[at + 1] << 8) | (b[at + 2] << 16) | (b[at + 3] << 24)) >>> 0;
const u32be = (b: Uint8Array, at: number): number => ((b[at] << 24) | (b[at + 1] << 16) | (b[at + 2] << 8) | b[at + 3]) >>> 0;
const u64le = (b: Uint8Array, at: number): number => u32le(b, at) + u32le(b, at + 4) * 2 ** 32;
const u64be = (b: Uint8Array, at: number): number => u32be(b, at) * 2 ** 32 + u32be(b, at + 4);

function wavInfo(b: Uint8Array): AudioInfo {
  let channels: number | null = null;
  let byteRate = 0;
  let at = 12;
  while (at + 8 <= b.length) {
    const size = u32le(b, at + 4);
    if (tagAt(b, at, 'fmt ') && at + 20 <= b.length) {
      channels = u16le(b, at + 10);
      byteRate = u32le(b, at + 16);
    } else if (tagAt(b, at, 'data')) {
      // A streamed WAV leaves the size at 0 or 0xFFFFFFFF, and any header can
      // lie past the end of the file: what a decoder reads is what is there.
      const present = b.length - (at + 8);
      const bytes = size === 0 || size > present ? present : size;
      return { channels, seconds: byteRate > 0 ? bytes / byteRate : null };
    }
    at += 8 + size + (size & 1);
  }
  return { channels, seconds: null };
}

/** The last page's granule position over the stream's rate. */
function oggInfo(b: Uint8Array): AudioInfo {
  const payload = 27 + b[26];
  let channels: number | null = null;
  let rate = 0;
  let preSkip = 0;
  if (tagAt(b, payload, 'OpusHead')) {
    channels = b[payload + 9];
    preSkip = u16le(b, payload + 10);
    rate = 48000;
  } else if (b[payload] === 1 && tagAt(b, payload + 1, 'vorbis')) {
    channels = b[payload + 11];
    rate = u32le(b, payload + 12);
  }
  let last = -1;
  for (let at = b.length - 27; at > 0; at--) {
    if (b[at] === 0x4f && tagAt(b, at, 'OggS')) {
      last = at;
      break;
    }
  }
  if (last < 0 || rate === 0) return { channels, seconds: null };
  const granule = u64le(b, last + 6);
  return { channels, seconds: Math.max(0, granule - preSkip) / rate };
}

/** Walks the boxes to moov/mvhd. */
function mp4Info(b: Uint8Array): AudioInfo {
  const find = (from: number, to: number, type: string): [number, number] | null => {
    let at = from;
    while (at + 8 <= to) {
      let size = u32be(b, at);
      let header = 8;
      if (size === 1) {
        size = u64be(b, at + 8);
        header = 16;
      } else if (size === 0) size = to - at;
      if (size < header) return null;
      if (tagAt(b, at + 4, type)) return [at + header, Math.min(to, at + size)];
      at += size;
    }
    return null;
  };
  const moov = find(0, b.length, 'moov');
  if (!moov) return { seconds: null, channels: null };
  let seconds: number | null = null;
  const mvhd = find(moov[0], moov[1], 'mvhd');
  if (mvhd) {
    const [at] = mvhd;
    const version = b[at];
    const timescale = u32be(b, at + (version === 1 ? 20 : 12));
    const duration = version === 1 ? u64be(b, at + 24) : u32be(b, at + 16);
    if (timescale > 0) seconds = duration / timescale;
  }
  let channels: number | null = null;
  for (let at = moov[0]; at + 24 < moov[1]; at++) {
    if (b[at] === 0x6d && tagAt(b, at, 'mp4a')) {
      channels = (b[at + 20] << 8) | b[at + 21];
      break;
    }
  }
  return { seconds, channels };
}

/** Matroska/WebM. Chromium's MediaRecorder leaves the Segment's size and the
    Info's Duration unwritten, so the length of the app's own recordings is
    the timecode of their last cluster. */
function webmInfo(b: Uint8Array): AudioInfo {
  const CLUSTER = [0x1f, 0x43, 0xb6, 0x75];
  const isCluster = (at: number) => b[at] === CLUSTER[0] && b[at + 1] === CLUSTER[1] && b[at + 2] === CLUSTER[2] && b[at + 3] === CLUSTER[3];
  let firstCluster = b.length;
  for (let at = 0; at + 4 < b.length; at++) {
    if (isCluster(at)) {
      firstCluster = at;
      break;
    }
  }

  let scale = 1_000_000;
  let seconds: number | null = null;
  let channels: number | null = null;
  for (let at = 0; at < firstCluster && at + 4 < b.length; at++) {
    if (b[at] === 0x2a && b[at + 1] === 0xd7 && b[at + 2] === 0xb1 && b[at + 3] >= 0x81 && b[at + 3] <= 0x88) {
      const length = b[at + 3] & 0x0f;
      let value = 0;
      for (let i = 0; i < length; i++) value = value * 256 + b[at + 4 + i];
      if (value > 0) scale = value;
    } else if (b[at] === 0x44 && b[at + 1] === 0x89 && (b[at + 2] === 0x84 || b[at + 2] === 0x88) && seconds === null) {
      const view = new DataView(b.buffer, b.byteOffset + at + 3, b[at + 2] & 0x0f);
      seconds = (view.byteLength === 4 ? view.getFloat32(0) : view.getFloat64(0)) as number;
    } else if (b[at] === 0x9f && b[at + 1] === 0x81 && channels === null && b[at + 2] >= 1 && b[at + 2] <= 32) {
      channels = b[at + 2];
    }
  }
  if (seconds !== null) return { seconds: (seconds * scale) / 1e9, channels };

  let lastTimecode = -1;
  for (let at = firstCluster; at + 8 < b.length; at++) {
    if (!isCluster(at)) continue;
    const first = b[at + 4];
    const width = first === 0 ? 0 : Math.clz32(first) - 23; // vint length, 1..8
    const timecode = at + 4 + width;
    if (width < 1 || width > 8 || b[timecode] !== 0xe7 || b[timecode + 1] < 0x81 || b[timecode + 1] > 0x88) continue;
    const length = b[timecode + 1] & 0x0f;
    let value = 0;
    for (let i = 0; i < length; i++) value = value * 256 + b[timecode + 2 + i];
    if (value > lastTimecode) lastTimecode = value;
  }
  return { seconds: lastTimecode < 0 ? null : (lastTimecode * scale) / 1e9, channels };
}

/** What a container's own header says about its length and channels. Never decodes. */
export function readAudioInfo(b: Uint8Array): AudioInfo {
  if (b.length >= 12 && tagAt(b, 0, 'RIFF') && tagAt(b, 8, 'WAVE')) return wavInfo(b);
  if (b.length >= 28 && tagAt(b, 0, 'OggS')) return oggInfo(b);
  if (b.length >= 12 && tagAt(b, 4, 'ftyp')) return mp4Info(b);
  if (b.length >= 4 && b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) return webmInfo(b);
  return { seconds: null, channels: null };
}

/** Throws before any decoder is made when the audio is over the budget.

    A container this cannot read a length from (MP3, AAC, FLAC, AMR) is let
    through: guessing a length from its bytes would refuse a real 10 MiB MP3
    at 64 kbit/s, which is 22 minutes, to catch a 10 MiB one at 8 kbit/s,
    which is under three hours and still within what one decode can hold.
    Those files are already bounded by the 10 MiB importer ceiling
    (stores/voiceRecording.ts). */
export function refuseAudioOverBudget(bytes: Uint8Array): void {
  const info = readAudioInfo(bytes);
  if (info.seconds === null) return;
  const seconds = info.seconds;
  const channels = info.channels ?? 2;
  if (seconds > MAX_AUDIO_SECONDS || seconds * channels > MAX_AUDIO_CHANNEL_SECONDS) {
    throw new MediaBudgetError(
      'audio-duration',
      `Recording is ${Math.round(seconds)} s over ${channels} channel(s); the limit is ${MAX_AUDIO_SECONDS} s and ${MAX_AUDIO_CHANNEL_SECONDS} channel-seconds`
    );
  }
}
