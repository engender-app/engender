/** Keep only conflicts proved to be recovered by the real driver.
 * @param {{ index: number, text: string, source?: string }[]} errors
 * @param {{ index: number, type: string, path?: string, op?: string, error?: string, source?: string, worker?: string, token?: string, id?: number }[]} events
 */
export function classifyBfcacheConsoleErrors(errors, events) {
  const used = new Set();
  const handled = [];
  const unmatched = [];
  for (const error of errors) {
    const conflict = error.text.startsWith('opfs-sahpool: NoModificationAllowedError:')
      && error.text.includes("Failed to execute 'createSyncAccessHandle'");
    const failure = conflict && error.source && events.find(event => {
      if (event.type !== 'failure' || !['attach', 'open'].includes(event.op ?? '')
        || !event.path || !event.worker || !event.token || event.source !== error.source
        || event.index <= error.index || !event.error?.includes('Access Handles cannot be created')
        || !error.text.includes(event.error) || used.has(event)) return false;
      return events.some(request => request.type === 'request' && request.worker === event.worker
        && request.token === event.token && request.id === event.id && request.op === event.op
        && request.path === event.path && request.source === event.source && request.index < error.index);
    });
    const retired = failure && events.find(event => event.type === 'retired'
      && event.worker === failure.worker && event.token === failure.token && event.index > failure.index);
    const opened = retired && events.find(event => event.type === 'open'
      && event.path === failure.path && event.token === failure.token
      && event.source === failure.source && event.worker && event.worker !== failure.worker && event.index > retired.index);
    const ready = opened && events.find(event => event.type === 'ready'
      && event.path === opened.path && event.token === opened.token && event.index > opened.index);
    const durable = ready && events.find(event => event.type === 'durable'
      && event.path === ready.path && event.index > ready.index);
    if (durable) {
      used.add(failure);
      handled.push({ error, failure, retired, opened, ready, durable });
    } else unmatched.push(error);
  }
  return { handled, unmatched };
}
