/* Vitest entry for the importer fuzz harness (testing ticket 11).
   Spawns child.mjs under a heap limit and a per-case watchdog, collects
   the outcomes, writes a summary, and fails on any defect.

   FUZZ_SEED (default 1), FUZZ_COUNT cases per target (default 40),
   FUZZ_LONG=1 raises the count to FUZZ_LONG_COUNT (default 2000),
   FUZZ_TARGETS (comma list), FUZZ_OUT (summary dir),
   FUZZ_HEAP_MB (at most 1024), FUZZ_WATCHDOG_MS (at most 30000). */
import { spawn } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test, expect } from 'vitest';

const root = resolve(__dirname, '../..');
const seed = Number(process.env.FUZZ_SEED ?? 1);
const long = process.env.FUZZ_LONG === '1';
const count = Number(long ? process.env.FUZZ_LONG_COUNT ?? 2000 : process.env.FUZZ_COUNT ?? 40);
const heapMb = Math.min(Number(process.env.FUZZ_HEAP_MB ?? 1024), 1024);
const watchdogMs = Math.min(Number(process.env.FUZZ_WATCHDOG_MS ?? 30000), 30000);
const targets = process.env.FUZZ_TARGETS?.split(',');
/* An error that is not one of the typed failures is reported in the summary either way; FUZZ_STRICT_TYPED=1 also fails the run on it. */
const strictTyped = process.env.FUZZ_STRICT_TYPED === '1';
const outDir = process.env.FUZZ_OUT ?? resolve(root, 'ci-logs/fuzz');

type R = { kind: string; sig: string; t: string; i: number; k: number; ms: number; filesLeft?: string[]; mut?: string[]; maxRssKb?: number; userCpuMs?: number; systemCpuMs?: number };
type Crash = { t: string; i: number; k: number; why: string; artifact?: string };
let expectedTotal = 0;
let userCpuMs = 0;
let systemCpuMs = 0;

async function runChild(startK: number, results: R[], crashes: Crash[]): Promise<number | null> {
  return new Promise((done) => {
    const child = spawn(process.execPath, [`--max-old-space-size=${heapMb}`, resolve(root, 'tests/fuzz/child.mjs'), JSON.stringify({ root, seed, count, targets, startK, outDir })], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
    let current: { t: string; i: number; k: number } | null = null;
    let buf = '';
    let stderr = '';
    let finished = false;
    let killedFor = '';
    let ready: { targets: string[]; total: number; startK: number } | null = null;
    let nextK = startK;
    let lastUsage = { userCpuMs: 0, systemCpuMs: 0 };
    let timer: NodeJS.Timeout;
    const arm = () => { clearTimeout(timer); timer = setTimeout(() => { killedFor = 'hang'; child.kill('SIGKILL'); }, watchdogMs); };
    arm();
    child.stderr.on('data', (d) => { stderr += d; if (stderr.length > 20000) stderr = stderr.slice(-20000); });
    child.stdout.on('data', (d) => {
      buf += d;
      let nl;
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl); buf = buf.slice(nl + 1);
        try {
          if (line.startsWith('READY ')) {
            ready = JSON.parse(line.slice(6));
            if (!ready || ready.startK !== startK || ready.total !== count * ready.targets.length || (targets && targets.join(',') !== ready.targets.join(','))) throw new Error('invalid READY receipt');
            expectedTotal = ready.total;
          } else if (line.startsWith('S ')) {
            const [, t, i, k] = line.split(' ');
            current = { t, i: Number(i), k: Number(k) };
            if (!ready || current.k !== nextK || current.i !== Math.floor(nextK / ready.targets.length) || current.t !== ready.targets[nextK % ready.targets.length]) throw new Error('missing or reordered case');
            arm();
          } else if (line.startsWith('R ')) {
            const result: R = JSON.parse(line.slice(2));
            if (!current || result.k !== current.k || result.t !== current.t || result.i !== current.i) throw new Error('result does not match active case');
            results.push(result); nextK++; current = null;
            lastUsage = { userCpuMs: result.userCpuMs ?? 0, systemCpuMs: result.systemCpuMs ?? 0 };
            arm();
          } else if (line === 'DONE') {
            if (!ready || current || nextK !== ready.total) throw new Error('incomplete child results');
            finished = true;
          }
        } catch (error) { killedFor = String(error); child.kill('SIGKILL'); }
      }
    });
    child.on('error', (error) => { killedFor = String(error); });
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      userCpuMs += lastUsage.userCpuMs; systemCpuMs += lastUsage.systemCpuMs;
      if (finished && code === 0 && !signal && !killedFor) return done(null);
      const oom = /heap out of memory|JavaScript heap|Allocation failed/i.test(stderr);
      const why = killedFor === 'hang' ? `hang past ${watchdogMs} ms` : killedFor || (oom ? `heap past ${heapMb} MB` : `child died (code ${code}, signal ${signal}): ${stderr.slice(-300)}`);
      const crash: Crash = { ...(current ?? { t: '?', i: -1, k: nextK }), why };
      const active = resolve(outDir, 'active');
      const path = resolve(outDir, `case-seed${seed}-${crash.t}-${crash.i}-crash`);
      const saved = existsSync(active + '.json') ? JSON.parse(readFileSync(active + '.json', 'utf8')) : null;
      const receipt = current && saved?.k === current.k ? saved : { seed, ...crash, phase: current ? 'generation' : 'startup' };
      if (current && saved?.k === current.k && saved.phase === 'run' && existsSync(active + '.bin')) copyFileSync(active + '.bin', path + '.bin');
      writeFileSync(path + '.json', JSON.stringify({ ...receipt, crash }, null, 1));
      crash.artifact = path + '.json';
      crashes.push(crash);
      done(current && !killedFor.startsWith('Error:') ? current.k + 1 : null);
    });
  });
}

test(`importer fuzz seed=${seed} count=${count}/target${long ? ' (long)' : ''}`, async () => {
  const results: R[] = [];
  const crashes: Crash[] = [];
  for (const [name, value] of Object.entries({ seed, count, heapMb, watchdogMs })) {
    expect(Number.isSafeInteger(value) && value > 0, `${name} must be a positive integer`).toBe(true);
  }
  mkdirSync(outDir, { recursive: true });
  rmSync(resolve(outDir, 'active.bin'), { force: true });
  rmSync(resolve(outDir, 'active.json'), { force: true });
  const t0 = Date.now();
  let next: number | null = 0;
  while (next !== null) next = await runChild(next, results, crashes);
  const seconds = (Date.now() - t0) / 1000;

  const byTarget: Record<string, Record<string, number>> = {};
  const sigs: Record<string, { kind: string; count: number; first: string; targets: Set<string> }> = {};
  for (const r of results) {
    (byTarget[r.t] ??= {})[r.kind] = (byTarget[r.t][r.kind] ?? 0) + 1;
    if (!['typed', 'accepted', 'guard'].includes(r.kind) && (strictTyped || r.kind !== 'untyped')) {
      const s = (sigs[`${r.kind} | ${r.sig}`] ??= { kind: r.kind, count: 0, first: `${r.t}:${r.i}`, targets: new Set() });
      s.count++; s.targets.add(r.t);
    }
  }
  const orphan = results.filter((r) => r.filesLeft?.length && r.kind !== 'accepted');
  const summary = {
    seed, count, long, heapMb, watchdogMs, seconds, cases: results.length, crashes, byTarget,
    untypedRefusals: results.filter((r) => r.kind === 'untyped').length,
    untypedSignatures: [...results.filter((r) => r.kind === 'untyped').reduce((m, r) => m.set(r.sig, (m.get(r.sig) ?? 0) + 1), new Map<string, number>())].sort((a, b) => b[1] - a[1]).map(([sig, n]) => ({ sig, n })),
    defects: Object.entries(sigs).map(([sig, s]) => ({ sig, kind: s.kind, count: s.count, first: s.first, targets: [...s.targets] })),
    refusedWithFilesLeftInStore: orphan.length,
    slowest: [...results].sort((a, b) => b.ms - a.ms).slice(0, 5).map((r) => ({ t: r.t, i: r.i, ms: Math.round(r.ms) })),
    maxRssKb: Math.max(0, ...results.map((r) => r.maxRssKb ?? 0)),
    userCpuMs, systemCpuMs
  };
  mkdirSync(outDir, { recursive: true });
  writeFileSync(resolve(outDir, `summary-seed${seed}-n${count}.json`), JSON.stringify(summary, null, 1));
  writeFileSync(resolve(outDir, `results-seed${seed}-n${count}.jsonl`), results.map((r) => JSON.stringify(r)).join('\n') + '\n');
  console.error(JSON.stringify({ ...summary, defects: summary.defects.length + ' signatures' }, null, 1));
  expect(crashes, 'hangs, heap blowups or child crashes').toEqual([]);
  expect(results.length, 'all requested cases completed').toBe(expectedTotal);
  expect(summary.defects, 'defective outcomes').toEqual([]);
}, 3 * 3600 * 1000);
