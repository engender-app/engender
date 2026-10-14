/* Seeded mutators for the importer fuzz harness (testing ticket 11).
   No dependencies beyond fflate (already the repo's zip reader).
   Every function takes the rng so a case is reproducible from
   (master seed, target, index). */

import { unzipSync, zipSync, type Zippable } from 'fflate';

export type Rng = () => number;

/** mulberry32. randomDraw.ts takes an injected rng but does not make one. */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function fnv1a(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export const int = (rng: Rng, lo: number, hi: number) => lo + Math.floor(rng() * (hi - lo + 1));
export const pick = <T>(rng: Rng, items: readonly T[]): T => items[Math.floor(rng() * items.length)];

export function weighted<T>(rng: Rng, items: readonly (readonly [number, T])[]): T {
  const total = items.reduce((sum, [w]) => sum + w, 0);
  let at = rng() * total;
  for (const [w, item] of items) {
    at -= w;
    if (at < 0) return item;
  }
  return items[items.length - 1][1];
}

const BIG_NUMBERS = [0xffffffff, 0x7fffffff, 0x80000000, 0x10000000, 0xffff, 0x7fff, 0, 1];

export type Mutation = { name: string; apply(bytes: Uint8Array, rng: Rng): Uint8Array };

function offset(rng: Rng, length: number): number {
  // Bias towards the ends: headers and trailers hold the structure.
  const r = rng();
  if (r < 0.2) return int(rng, 0, Math.min(length - 1, 64));
  if (r < 0.35) return Math.max(0, length - 1 - int(rng, 0, Math.min(length - 1, 96)));
  return int(rng, 0, Math.max(0, length - 1));
}

export const bitFlips: Mutation = {
  name: 'bitflip',
  apply(bytes, rng) {
    if (bytes.length === 0) return bytes;
    const out = bytes.slice();
    const flips = int(rng, 1, 8);
    for (let i = 0; i < flips; i++) out[offset(rng, out.length)] ^= 1 << int(rng, 0, 7);
    return out;
  }
};

export const overwriteRun: Mutation = {
  name: 'overwrite-run',
  apply(bytes, rng) {
    if (bytes.length === 0) return bytes;
    const out = bytes.slice();
    const at = offset(rng, out.length);
    const len = Math.min(out.length - at, int(rng, 1, 256));
    const mode = int(rng, 0, 3);
    for (let i = 0; i < len; i++) {
      out[at + i] = mode === 0 ? int(rng, 0, 255) : mode === 1 ? 0x00 : mode === 2 ? 0xff : 0x41;
    }
    return out;
  }
};

export const truncate: Mutation = {
  name: 'truncate',
  apply(bytes, rng) {
    if (bytes.length === 0) return bytes;
    return bytes.slice(0, weighted(rng, [[3, offset(rng, bytes.length)], [1, 0], [1, bytes.length - 1]]));
  }
};

export const duplicateChunk: Mutation = {
  name: 'duplicate-chunk',
  apply(bytes, rng) {
    if (bytes.length === 0) return bytes;
    const at = offset(rng, bytes.length);
    const len = Math.min(bytes.length - at, int(rng, 1, 1024));
    const piece = bytes.slice(at, at + len);
    const into = int(rng, 0, bytes.length);
    const out = new Uint8Array(bytes.length + len);
    out.set(bytes.subarray(0, into), 0);
    out.set(piece, into);
    out.set(bytes.subarray(into), into + len);
    return out;
  }
};

export const deleteChunk: Mutation = {
  name: 'delete-chunk',
  apply(bytes, rng) {
    if (bytes.length < 2) return bytes;
    const at = offset(rng, bytes.length);
    const len = Math.min(bytes.length - at, int(rng, 1, 512));
    const out = new Uint8Array(bytes.length - len);
    out.set(bytes.subarray(0, at), 0);
    out.set(bytes.subarray(at + len), at);
    return out;
  }
};

/** A length-looking field at a random offset set to something huge. */
export const inflateRandomField: Mutation = {
  name: 'inflate-field',
  apply(bytes, rng) {
    if (bytes.length < 4) return bytes;
    const out = bytes.slice();
    const at = int(rng, 0, out.length - 4);
    const value = pick(rng, [...BIG_NUMBERS, out.length * 2, out.length + 1, out.length - 1]) >>> 0;
    const view = new DataView(out.buffer);
    const width = pick(rng, [2, 4, 4, 4] as const);
    const little = rng() < 0.5;
    if (width === 4) view.setUint32(at, value, little);
    else view.setUint16(at, value & 0xffff, little);
    return out;
  }
};

/** Set a u32 at a known offset (an actual length field). */
export function inflateAt(offsets: readonly { at: number; little: boolean; width: 2 | 4 }[]): Mutation {
  return {
    name: 'inflate-known-field',
    apply(bytes, rng) {
      const usable = offsets.filter((o) => o.at + o.width <= bytes.length);
      if (usable.length === 0) return bytes;
      const out = bytes.slice();
      const o = pick(rng, usable);
      const value = pick(rng, [...BIG_NUMBERS, bytes.length * 2, bytes.length + 1]) >>> 0;
      const view = new DataView(out.buffer);
      if (o.width === 4) view.setUint32(o.at, value, o.little);
      else view.setUint16(o.at, value & 0xffff, o.little);
      return out;
    }
  };
}

export const BYTE_MUTATIONS: readonly Mutation[] = [
  bitFlips,
  overwriteRun,
  truncate,
  duplicateChunk,
  deleteChunk,
  inflateRandomField
];

/* ---------- zip structure edits ---------- */

const u16 = (b: Uint8Array, at: number) => new DataView(b.buffer, b.byteOffset).getUint16(at, true);
const u32 = (b: Uint8Array, at: number) => new DataView(b.buffer, b.byteOffset).getUint32(at, true);
const setU16 = (b: Uint8Array, at: number, v: number) => new DataView(b.buffer, b.byteOffset).setUint16(at, v & 0xffff, true);
const setU32 = (b: Uint8Array, at: number, v: number) => new DataView(b.buffer, b.byteOffset).setUint32(at, v >>> 0, true);

function findEocd(bytes: Uint8Array): number {
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 65535); i--) {
    if (u32(bytes, i) === 0x06054b50) return i;
  }
  return -1;
}

function centralEntries(bytes: Uint8Array): number[] {
  const eocd = findEocd(bytes);
  if (eocd < 0) return [];
  const count = u16(bytes, eocd + 10);
  let at = u32(bytes, eocd + 16);
  const found: number[] = [];
  for (let i = 0; i < count && at + 46 <= bytes.length && u32(bytes, at) === 0x02014b50; i++) {
    found.push(at);
    at += 46 + u16(bytes, at + 28) + u16(bytes, at + 30) + u16(bytes, at + 32);
  }
  return found;
}

function localHeaders(bytes: Uint8Array): number[] {
  const found: number[] = [];
  for (const entry of centralEntries(bytes)) {
    const at = u32(bytes, entry + 42);
    if (at + 30 <= bytes.length && u32(bytes, at) === 0x04034b50) found.push(at);
  }
  return found;
}

const EVIL_NAMES = ['../evil', '../../etc/passwd', '/abs/path', 'a\0b', '..\\..\\win', '', 'x/./../../y', '%2e%2e/z'];

/** One edit to the zip's own bookkeeping: EOCD counts and offsets, central
    directory sizes, offsets, name lengths and names, local header sizes. */
export const zipStructureEdit: Mutation = {
  name: 'zip-structure',
  apply(bytes, rng) {
    const eocd = findEocd(bytes);
    if (eocd < 0) return bytes;
    const out = bytes.slice();
    const entries = centralEntries(out);
    const locals = localHeaders(out);
    const kind = int(rng, 0, 14);
    const big = pick(rng, BIG_NUMBERS) >>> 0;
    switch (kind) {
      case 0: setU16(out, eocd + 10, pick(rng, [0, 1, 0xffff, u16(out, eocd + 10) + 1, u16(out, eocd + 10) - 1])); break;
      case 1: setU16(out, eocd + 8, pick(rng, [0, 0xffff, 1])); break;
      case 2: setU32(out, eocd + 12, big); break;
      case 3: setU32(out, eocd + 16, pick(rng, [big, 0, out.length, out.length - 1, u32(out, eocd + 16) + 1, u32(out, eocd + 16) - 1])); break;
      case 4: if (entries.length) setU32(out, pick(rng, entries) + 20, big); break; // compressed size
      case 5: if (entries.length) setU32(out, pick(rng, entries) + 24, big); break; // uncompressed size
      case 6: if (entries.length) setU32(out, pick(rng, entries) + 42, pick(rng, [big, 0, out.length - 1])); break; // local header offset
      case 7: if (entries.length) setU16(out, pick(rng, entries) + 28, pick(rng, [0, 1, 0xffff, 5000])); break; // name length
      case 8: if (entries.length) setU16(out, pick(rng, entries) + 30, pick(rng, [1, 0xffff, 100])); break; // extra length
      case 9: if (entries.length) setU16(out, pick(rng, entries) + 10, pick(rng, [0, 8, 1, 9, 12, 99])); break; // method
      case 10: if (entries.length) setU32(out, pick(rng, entries) + 16, int(rng, 0, 0xffffffff)); break; // crc
      case 11: if (locals.length) setU32(out, pick(rng, locals) + 18, big); break; // local compSize
      case 12: if (locals.length) setU32(out, pick(rng, locals) + 22, big); break; // local uncompSize
      case 13: if (locals.length) setU16(out, pick(rng, locals) + 26, pick(rng, [0, 0xffff, 3])); break; // local name length
      case 14: if (entries.length) setU16(out, pick(rng, entries) + 8, pick(rng, [1, 0x800, 0xffff])); break; // flags (encrypted etc.)
    }
    return out;
  }
};

/** Unzip for the mutators only: refuses a zip whose central directory claims more than 32 MB, because an
    unfiltered fflate unzipSync of such a file spends 35 s allocating and inflating it (found by seed 11; the
    app's own openZip checks the declared size first, zipReader.ts, so this is a harness guard only). */
function safeUnzip(bytes: Uint8Array): Record<string, Uint8Array> | null {
  try {
    let total = 0;
    unzipSync(bytes, { filter: (e) => { total += e.originalSize; return false; } });
    if (total > 32 * 1024 * 1024) return null;
    return unzipSync(bytes);
  } catch {
    return null;
  }
}

/** Re-zip with a member renamed to a hostile name, or duplicated under
    another name, or an extra hostile member added. */
export const zipRenameMember: Mutation = {
  name: 'zip-hostile-name',
  apply(bytes, rng) {
    const files = safeUnzip(bytes);
    if (!files) return bytes;
    const names = Object.keys(files);
    if (names.length === 0) return bytes;
    const evil = pick(rng, EVIL_NAMES);
    const target = pick(rng, names);
    const zippable: Zippable = {};
    const mode = int(rng, 0, 2);
    for (const name of names) {
      if (mode === 0 && name === target) zippable[evil || 'empty'] = files[name];
      else zippable[name] = files[name];
    }
    if (mode === 1) zippable[evil || 'empty'] = files[target];
    if (mode === 2) zippable[evil || 'empty'] = new Uint8Array(int(rng, 0, 64));
    let out = zipSync(zippable);
    // zipSync cannot write an empty or NUL name verbatim in every case; patch the central name too.
    if (evil === '' || evil.includes('\0')) {
      const entries = centralEntries(out);
      if (entries.length) {
        const e = pick(rng, entries);
        const len = u16(out, e + 28);
        out = out.slice();
        for (let i = 0; i < len; i++) out[e + 46 + i] = evil === '' ? 0 : i === 1 ? 0 : out[e + 46 + i];
      }
    }
    return out;
  }
};

/** Rewrite one zip member through `fn`, keeping the rest. */
export function mapZipMember(
  bytes: Uint8Array,
  member: string,
  fn: (member: Uint8Array) => Uint8Array
): Uint8Array {
  const files = safeUnzip(bytes);
  if (!files || !(member in files)) return bytes;
  const zippable: Zippable = {};
  for (const [name, data] of Object.entries(files)) zippable[name] = [name === member ? fn(data) : data, { level: 6 }];
  return zipSync(zippable);
}

export const ZIP_MUTATIONS: readonly Mutation[] = [zipStructureEdit, zipStructureEdit, zipRenameMember];

/* ---------- text and JSON ---------- */

const enc = new TextEncoder();
const dec = new TextDecoder('utf-8');

export const textLineEdit: Mutation = {
  name: 'text-lines',
  apply(bytes, rng) {
    const lines = dec.decode(bytes).split('\n');
    if (lines.length === 0) return bytes;
    const at = int(rng, 0, lines.length - 1);
    const kind = int(rng, 0, 8);
    switch (kind) {
      case 0: lines.splice(at, 1); break;
      case 1: lines.splice(at, 0, lines[at]); break;
      case 2: lines[at] = lines[at].replace(/,/g, ';'); break;
      case 3: lines[at] = lines[at] + '"'; break;
      case 4: lines[at] = '"' + lines[at]; break;
      case 5: lines[at] = lines[at].replace(/[0-9]+/, () => pick(rng, ['99999999999999999999', '-1', '0', '1e999', 'NaN', '2147483648', '-9223372036854775808'])); break;
      case 6: lines[at] = lines[at] + 'A'.repeat(int(rng, 1000, 200000)); break;
      case 7: lines[at] = lines[at] + pick(rng, ['\0', '\r', '‮', '\ud800', '﻿']); break;
      case 8: lines.splice(int(rng, 0, lines.length), 0, ',,,,,,,,,,,,'); break;
    }
    return enc.encode(lines.join('\n'));
  }
};

export const invalidUtf8: Mutation = {
  name: 'invalid-utf8',
  apply(bytes, rng) {
    if (bytes.length === 0) return bytes;
    const out = bytes.slice();
    const n = int(rng, 1, 6);
    for (let i = 0; i < n; i++) out[offset(rng, out.length)] = pick(rng, [0xc0, 0xc1, 0xf5, 0xff, 0x80, 0xfe]);
    return out;
  }
};

export const bomPrefix: Mutation = {
  name: 'bom',
  apply(bytes) {
    const out = new Uint8Array(bytes.length + 3);
    out.set([0xef, 0xbb, 0xbf]);
    out.set(bytes, 3);
    return out;
  }
};

export const TEXT_MUTATIONS: readonly Mutation[] = [textLineEdit, textLineEdit, invalidUtf8, bomPrefix];

const JSON_VALUES: readonly (() => unknown)[] = [
  () => null,
  () => 'x',
  () => '',
  () => 0,
  () => -1,
  () => 1.5,
  () => 2 ** 53,
  () => 1e308,
  () => -1e308,
  () => 4294967296,
  () => true,
  () => [],
  () => {},
  () => [[[[[[]]]]]],
  () => ({ a: { a: { a: { a: {} } } } }),
  () => 'A'.repeat(100000),
  () => '../../evil',
  () => '\u0000',
  () => '\ud800',
  () => '__proto__',
  () => '<script>alert(1)</script>',
  () => '2026-02-30',
  () => 'Z'.repeat(5000) + '‮'
];

type Json = null | boolean | number | string | Json[] | { [k: string]: Json };

function collectPaths(node: Json, path: (string | number)[], out: (string | number)[][], budget: { n: number }): void {
  if (budget.n-- <= 0) return;
  out.push(path);
  if (Array.isArray(node)) {
    // Sample a few children so big arrays do not dominate.
    const idx = node.length <= 6 ? node.map((_, i) => i) : [0, 1, node.length - 1, Math.floor(node.length / 2)];
    for (const i of idx) collectPaths(node[i], [...path, i], out, budget);
  } else if (node && typeof node === 'object') {
    for (const k of Object.keys(node)) collectPaths(node[k], [...path, k], out, budget);
  }
}

/** Parse JSON text, change one or two nodes, write it back. */
export function mutateJsonValue(root: Json, rng: Rng, log?: string[]): Json {
  const clone = structuredClone(root) as Json;
  const edits = int(rng, 1, 2);
  for (let e = 0; e < edits; e++) {
    const paths: (string | number)[][] = [];
    collectPaths(clone, [], paths, { n: 4000 });
    const path = pick(rng, paths);
    if (path.length === 0) {
      continue;
    }
    let parent: any = clone;
    for (const step of path.slice(0, -1)) parent = parent[step];
    const last = path[path.length - 1];
    const kind = weighted(rng, [[5, 'set'], [2, 'delete'], [2, 'dup'], [1, 'swap-type-array'], [1, 'wrap']] as const);
    const logAt = log ? log.length : 0;
    log?.push(`${kind} ${path.join('.')}`);
    if (kind === 'delete') {
      if (Array.isArray(parent)) parent.splice(last as number, 1);
      else delete parent[last];
    } else if (kind === 'dup' && Array.isArray(parent)) {
      parent.splice(last as number, 0, structuredClone(parent[last as number]));
    } else if (kind === 'swap-type-array') {
      parent[last] = [parent[last]];
    } else if (kind === 'wrap') {
      parent[last] = { v: parent[last] };
    } else {
      const value = pick(rng, JSON_VALUES)();
      parent[last] = value;
      if (log) log[logAt] += ' = ' + JSON.stringify(value)?.slice(0, 60);
    }
  }
  return clone;
}

export const jsonStructural: Mutation = {
  name: 'json-structural',
  apply(bytes, rng) {
    let parsed: Json;
    try {
      parsed = JSON.parse(dec.decode(bytes));
    } catch {
      return bytes;
    }
    let text = JSON.stringify(mutateJsonValue(parsed, rng));
    // Prototype-pollution probe: an own "__proto__" / "constructor" key can only arrive as raw JSON text.
    if (rng() < 0.12) {
      const key = pick(rng, ['"__proto__":{"polluted":"yes"}', '"constructor":{"prototype":{"polluted":"yes"}}']);
      const at = text.indexOf('{', int(rng, 0, Math.max(0, text.length - 1)));
      if (at >= 0) text = text.slice(0, at + 1) + key + (text[at + 1] === '}' ? '' : ',') + text.slice(at + 1);
    }
    return enc.encode(text);
  }
};

export const JSON_MUTATIONS: readonly Mutation[] = [jsonStructural, jsonStructural, jsonStructural, ...BYTE_MUTATIONS.slice(0, 3), invalidUtf8];

/** Apply 1..3 mutations from the menu. */
export function mutate(bytes: Uint8Array, menu: readonly Mutation[], rng: Rng): { bytes: Uint8Array; names: string[] } {
  let out = bytes;
  const names: string[] = [];
  const n = weighted(rng, [[6, 1], [3, 2], [1, 3]] as const);
  for (let i = 0; i < n; i++) {
    const m = pick(rng, menu);
    const t0 = performance.now();
    const before = out.length;
    if (process.env.FUZZ_DUMP) (globalThis as any).process.getBuiltinModule('node:fs').writeFileSync(`${process.env.FUZZ_DUMP}.stage${names.length}.bin`, out);
    out = m.apply(out, rng);
    if (process.env.FUZZ_TRACE) console.error(`mutation ${m.name}: ${before} -> ${out.length} bytes, ${Math.round(performance.now() - t0)} ms`);
    names.push(m.name);
  }
  return { bytes: out, names };
}

export const concat = (...parts: Uint8Array[]): Uint8Array => {
  const out = new Uint8Array(parts.reduce((s, p) => s + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
};

export const toHex = (bytes: Uint8Array): string => Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
