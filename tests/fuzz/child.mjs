/* Child process for the importer fuzz harness. Run with a heap limit:
   node --max-old-space-size=1024 tests/fuzz/child.mjs '<json args>'
   Protocol on stdout: READY <json>, S <target> <index> <k>, R <json>, DONE.
   The parent watches these lines to detect hangs and crashes. */
import { createServer } from 'vite';
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const args = JSON.parse(process.argv[2]);
const root = args.root;
process.chdir(root);
const server = await createServer({
  root, configFile: false, logLevel: 'silent', appType: 'custom',
  server: { middlewareMode: true, hmr: false, watch: null, ws: false },
  optimizeDeps: { noDiscovery: true, include: [] }
});
const cases = await server.ssrLoadModule('/tests/fuzz/fuzz-cases.ts');
process.removeAllListeners('warning');

const names = args.targets ?? cases.TARGET_NAMES;
if (!names.length || names.some((name) => !cases.TARGET_NAMES.includes(name)) || new Set(names).size !== names.length) {
  throw new Error('FUZZ_TARGETS must contain distinct known targets');
}

if (args.replay || args.artifact) {
  const receipt = args.artifact ? JSON.parse(readFileSync(args.artifact, 'utf8')) : null;
  if (receipt && receipt.phase !== 'run') throw new Error('this receipt failed before an input was generated');
  const [tname, idx] = receipt ? [receipt.target, receipt.index] : args.replay.split(':');
  const spec = receipt
    ? { input: new Uint8Array(readFileSync(args.artifact.replace(/\.json$/, '.bin'))), mutations: receipt.mutations, meta: receipt.meta }
    : await cases.targetByName(tname).make(cases.rngFor(args.seed, tname, Number(idx)));
  if (args.out) {
    writeFileSync(args.out, spec.input);
    writeFileSync(args.out + '.json', JSON.stringify({ target: tname, seed: receipt?.seed ?? args.seed, index: Number(idx), mutations: spec.mutations, meta: spec.meta, bytes: spec.input.length }, null, 1));
  }
  if (args.run) {
    const o = await cases.guardPrototype(() => cases.targetByName(tname).run(spec));
    console.log(JSON.stringify(o));
  }
  if (args.shrink) {
    const t = cases.targetByName(tname);
    const o = await t.run(spec);
    const small = await cases.shrink(t, spec, o.sig);
    writeFileSync(args.out + '.min', small.input);
    console.log('shrunk', spec.input.length, '->', small.input.length, JSON.stringify(await t.run(small)));
  }
  await server.close();
  process.exit(0);
}

let k = args.startK ?? 0;
const total = args.count * names.length;
mkdirSync(args.outDir, { recursive: true });
const active = resolve(args.outDir, 'active');
process.stdout.write(`READY ${JSON.stringify({ targets: names, total, startK: k })}\n`);
for (; k < total; k++) {
  const index = Math.floor(k / names.length);
  const tname = names[k % names.length];
  process.stdout.write(`S ${tname} ${index} ${k}\n`);
  // Remove the old input before generation: a generation crash has no input yet.
  rmSync(active + '.bin', { force: true });
  const receipt = { target: tname, seed: args.seed, index, k, phase: 'generation' };
  writeFileSync(active + '.json', JSON.stringify(receipt, null, 1));
  const t = cases.targetByName(tname);
  let result;
  try {
    const spec = await t.make(cases.rngFor(args.seed, tname, index));
    Object.assign(receipt, { phase: 'run', mutations: spec.mutations, meta: spec.meta, bytes: spec.input.length });
    writeFileSync(active + '.bin', spec.input);
    writeFileSync(active + '.json', JSON.stringify(receipt, null, 1));
    const o = await cases.guardPrototype(() => t.run(spec));
    result = { ...o, t: tname, i: index, k, mut: spec.mutations, bytes: spec.input.length };
  } catch (error) {
    // The harness itself threw while building a case: report as such.
    result = { kind: 'harness-error', sig: cases.signature(error), t: tname, i: index, k, ms: 0 };
  }
  const usage = process.resourceUsage();
  Object.assign(result, { maxRssKb: usage.maxRSS, userCpuMs: usage.userCPUTime / 1000, systemCpuMs: usage.systemCPUTime / 1000 });
  if (!['typed', 'accepted', 'guard'].includes(result.kind)) {
    const path = resolve(args.outDir, `case-seed${args.seed}-${tname}-${index}`);
    if (receipt.phase === 'run') copyFileSync(active + '.bin', path + '.bin');
    writeFileSync(path + '.json', JSON.stringify({ ...receipt, result }, null, 1));
    result.artifact = path + '.json';
  }
  process.stdout.write(`R ${JSON.stringify(result)}\n`);
}
rmSync(active + '.bin', { force: true });
rmSync(active + '.json', { force: true });
await server.close();
await new Promise((done) => process.stdout.write('DONE\n', done));
process.exit(0);
