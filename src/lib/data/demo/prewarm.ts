import { isAndroid } from '../../platform';

// Fetch once in the page, then hand the bytes to the existing worker. A
// preload in the page cannot serve a worker's fetch while still in flight.
if (!isAndroid()) {
  const wasmUrl = document.querySelector<HTMLScriptElement>('script[data-demo-prewarm]')!.dataset.wasm!;
  const binary = fetch(wasmUrl, { credentials: 'same-origin', priority: 'high' })
    .then((response) => {
      if (!response.ok) throw new Error(`database module download failed: ${response.status}`);
      return response.arrayBuffer();
    });
  void Promise.all([
    import('../sqlite/mc-driver'),
    import('../legacy-journal')
  ]).then(([{ prewarmJournalWorker }, { JOURNAL_DATABASE }]) =>
    prewarmJournalWorker(JOURNAL_DATABASE, binary)
  ).catch(() => {});
  void binary.catch(() => {});
}
