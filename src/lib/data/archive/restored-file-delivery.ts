/** Capacitor retains picker results while the replacement WebView is starting. */
interface Identity { processId: string; resetEpoch: number }
interface Recovery extends Identity { interrupted: boolean; cleanupPending: boolean }
interface RestoredResult {
  pluginId: string;
  methodName: string;
  success: boolean;
  data?: Record<string, unknown>;
  error?: { message?: string; data?: Record<string, unknown> };
}
export interface RestoredDelivery {
  outcome: 'saved' | 'cancelled' | 'failed' | 'cleanup-pending';
  backupAt?: number;
}

export function restoredFileDelivery(
  native: { recoveryStatus(): Promise<Recovery> },
  canReport: () => boolean,
  report: (result: RestoredDelivery) => void,
  getOwner: () => unknown
) {
  const pending = new Map<string, { identity: Identity; result: RestoredDelivery }>();
  const reported = new Set<string>();
  let running = false;
  let stopped = false;

  function enqueue(id: string, identity: Identity, result: RestoredDelivery) {
    const key = `${identity.processId}:${identity.resetEpoch}:${id}`;
    if (!reported.has(key)) pending.set(key, { identity, result });
  }

  async function flush() {
    if (running || stopped || !canReport()) return;
    const owner = getOwner();
    running = true;
    try {
      const current = await native.recoveryStatus();
      if (stopped || owner !== getOwner()) return;
      if (current.cleanupPending) enqueue('cleanup', current, { outcome: 'cleanup-pending' });
      else if (current.interrupted) enqueue('interrupted', current, { outcome: 'failed' });
      if (stopped || !canReport()) return;
      for (const [key, value] of pending) {
        pending.delete(key);
        if (value.identity.processId !== current.processId || value.identity.resetEpoch !== current.resetEpoch) continue;
        reported.add(key);
        report(value.result);
      }
    } catch {
      if (!stopped && owner === getOwner() && canReport() && !reported.has('status-failure')) {
        reported.add('status-failure');
        report({ outcome: 'failed' });
      }
    } finally {
      running = false;
      if (!stopped && owner !== getOwner()) void flush();
    }
  }

  return {
    accept(event: RestoredResult) {
      if (event.pluginId !== 'FileDelivery' || event.methodName !== 'finishFile') return;
      const data = event.success ? event.data : event.error?.data;
      if (!data || typeof data.transferId !== 'string' || typeof data.processId !== 'string'
        || typeof data.resetEpoch !== 'number') return;
      const saved = event.success && data.saved === true;
      enqueue(data.transferId, { processId: data.processId, resetEpoch: data.resetEpoch }, {
        outcome: saved ? 'saved' : event.success && data.saved === false ? 'cancelled' : 'failed',
        backupAt: saved && data.recordBackup === true && typeof data.savedAt === 'number' ? data.savedAt : undefined
      });
      void flush();
    },
    flush,
    stop() { stopped = true; pending.clear(); }
  };
}
