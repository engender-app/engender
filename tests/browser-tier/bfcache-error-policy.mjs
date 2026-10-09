/** Keep only conflicts proved to be recovered by the real driver.
 * @param {{ index: number, text: string }[]} errors
 * @param {{ index: number, type: string, path?: string, op?: string, error?: string }[]} events
 */
export function classifyBfcacheConsoleErrors(errors, events) {
  const used = new Set();
  const handled = [];
  const unmatched = [];
  for (const error of errors) {
    const conflict = error.text.startsWith('opfs-sahpool: NoModificationAllowedError:')
      && error.text.includes("Failed to execute 'createSyncAccessHandle'");
    const failure = conflict && events.find(event => event.type === 'failure'
      && ['attach', 'open'].includes(event.op ?? '') && event.path
      && event.error?.includes('Access Handles cannot be created')
      && error.text.includes(event.error ?? '') && !used.has(event));
    const opened = failure && events.find(event => event.type === 'open'
      && event.path === failure.path && event.index > Math.max(error.index, failure.index));
    const ready = opened && events.find(event => event.type === 'ready'
      && event.path === opened.path && event.index > opened.index);
    const durable = ready && events.find(event => event.type === 'durable'
      && event.path === ready.path && event.index > ready.index);
    if (durable) {
      used.add(failure);
      handled.push({ error, failure, opened, ready, durable });
    } else unmatched.push(error);
  }
  return { handled, unmatched };
}
