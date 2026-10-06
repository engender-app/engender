/** Count SQL crossing the worker boundary, below the ordinary-read cache. */
export function installWorkerReadRecorder() {
  const OriginalWorker = window.Worker;
  type Crossing = { key: string; bytes: number; failed: boolean; settled: Promise<void>; settle: () => void };
  let recording: Crossing[] | null = null;
  const detach: (() => void)[] = [];
  window.Worker = class extends OriginalWorker {
    constructor(scriptURL: string | URL, options?: WorkerOptions) {
      super(scriptURL, options);
      const pending = new Map<number, Crossing>();
      const reply = (event: MessageEvent) => {
        const crossing = pending.get(event.data?.id);
        if (!crossing) return;
        crossing.failed = event.data.ok === false;
        crossing.bytes = new TextEncoder().encode(JSON.stringify(event.data.result ?? null)).byteLength;
        pending.delete(event.data.id);
        crossing.settle();
      };
      const stopped = () => {
        for (const crossing of pending.values()) { crossing.failed = true; crossing.settle(); }
        pending.clear();
      };
      this.addEventListener('message', reply);
      this.addEventListener('error', stopped);
      const originalPost = this.postMessage.bind(this);
      this.postMessage = (message: unknown, transfer: Transferable[] | StructuredSerializeOptions = []) => {
        const request = message as { id?: number; op?: string; args?: { sql?: string; params?: unknown[] } };
        if (recording && request.id !== undefined && ['query', 'run', 'exec'].includes(request.op ?? '')) {
          let settle!: () => void;
          const settled = new Promise<void>((resolve) => { settle = resolve; });
          const crossing = {
            key: JSON.stringify([request.op, request.args?.sql, request.args?.params ?? []]),
            bytes: 0, failed: false, settled, settle
          };
          recording.push(crossing);
          pending.set(request.id, crossing);
        }
        if (Array.isArray(transfer)) originalPost(message, transfer);
        else originalPost(message, transfer);
      };
      detach.push(() => {
        this.postMessage = originalPost;
        this.removeEventListener('message', reply);
        this.removeEventListener('error', stopped);
        for (const crossing of pending.values()) crossing.settle();
        pending.clear();
      });
    }
  };
  return {
    async record<T>(operation: () => Promise<T>) {
      if (recording) throw new Error('Worker SQL recording is already open');
      const crossings: Crossing[] = [];
      recording = crossings;
      try {
        const result = await operation();
        await Promise.all(crossings.map((crossing) => crossing.settled));
        if (crossings.some((crossing) => crossing.failed)) throw new Error('Recorded journal SQL failed');
        return {
          result,
          crossings: {
            statements: crossings.length,
            bytes: crossings.reduce((sum, crossing) => sum + crossing.bytes, 0),
            duplicates: crossings.length - new Set(crossings.map((crossing) => crossing.key)).size
          }
        };
      } finally {
        recording = null;
      }
    },
    restore() {
      window.Worker = OriginalWorker;
      for (const cleanup of detach) cleanup();
      detach.length = 0;
    }
  };
}
