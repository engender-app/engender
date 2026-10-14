import { deriveKey } from '../../../src/lib/crypto/argon2id';
import { ARCHIVE_ARGON2_MAX_PARAMS, ARCHIVE_ARGON2_PARAMS } from '../../../src/lib/crypto/params';
import { ARCHIVE_FORMAT_VERSION, byteReader, readArchiveHeader } from '../../../src/lib/data/archive/container';

const budgetMs = 2000;
const maximum = ARCHIVE_ARGON2_MAX_PARAMS;
const probe = {
  ready: true,
  result: null as unknown,
  async run() {
    probe.ready = false;
    const WorkerType = window.Worker;
    let workerStarts = 0;
    let workerReplies = 0;
    try {
      window.Worker = new Proxy(WorkerType, {
        construct(target, args) {
          const worker = Reflect.construct(target, args) as Worker;
          workerStarts++;
          worker.addEventListener('message', () => workerReplies++, { once: true });
          return worker;
        }
      });
      const samples = [];
      for (const [name, params] of [['default', ARCHIVE_ARGON2_PARAMS], ['maximum', maximum]] as const) {
        const json = new TextEncoder().encode(JSON.stringify({ kdf: params,
          salt: btoa('synthetic-salt-24'), chunkSize: 1024, totalChunks: 1 }));
        const bytes = new Uint8Array(12 + json.length);
        bytes.set(new TextEncoder().encode('GDIARY'));
        new DataView(bytes.buffer).setUint16(6, ARCHIVE_FORMAT_VERSION);
        new DataView(bytes.buffer).setUint32(8, json.length);
        bytes.set(json, 12);
        async function* source() { yield bytes; }
        const { header } = await readArchiveHeader(byteReader(source()));
        for (let attempt = 0; attempt < 5; attempt++) {
          const start = performance.now();
          const key = await deriveKey('synthetic-budget-password', header.salt, header.kdf);
          const ms = performance.now() - start;
          const length = key.length;
          key.fill(0);
          if (length !== 32) throw Error('Archive derivation returned the wrong key length');
          samples.push({ name, attempt, ms });
        }
      }
      probe.result = { passed: workerStarts === 10 && workerReplies === 10 && samples.every((sample) => sample.ms <= budgetMs),
        budgetMs, workerStarts, workerReplies, defaultParams: ARCHIVE_ARGON2_PARAMS,
        maximumParams: maximum, samples, userAgent: navigator.userAgent };
    } catch (error) { probe.result = { passed: false, error: String(error) }; }
    finally {
      window.Worker = WorkerType;
      probe.ready = true;
    }
  }
};
Object.assign(window, { archiveKdfProbe: probe });
