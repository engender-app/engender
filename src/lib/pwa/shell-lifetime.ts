import { retainPreviousOcr } from './retained-ocr';
import { SHELL_CACHE_PREFIX } from './shell-assets';

/** A cache entry, not a served resource. Browser client IDs contain no journal data. */
export const SHELL_CLIENTS = '/.engender-shell-clients';

interface Receipt { clients: string[]; predecessors: string[] }

interface ShellClients {
  matchAll(options: { type: 'window'; includeUncontrolled: boolean }): Promise<Array<{ id: string }>>;
}

/** Persist document ownership in each activated shell. Receipts survive worker
    suspension; unreported pre-policy documents conservatively keep old shells.
    An installing cache has no receipt and is never collected by the active worker. */
export function createShellLifetime(
  cacheStore: CacheStorage, clients: ShellClients, current: string, base: string, origin: string
) {
  const receipt = new Request(new URL(base + SHELL_CLIENTS, origin));
  let pending = Promise.resolve();
  const enqueue = (work: () => Promise<void>) => {
    const next = pending.then(work);
    pending = next.catch(() => {});
    return next;
  };
  const names = async () => (await cacheStore.keys()).filter(name => name.startsWith(SHELL_CACHE_PREFIX));
  const read = async (name: string): Promise<Receipt | null> => {
    const response = await (await cacheStore.open(name)).match(receipt);
    if (!response) return null;
    const value = await response.json() as Partial<Receipt>;
    if (!Array.isArray(value.clients) || !value.clients.every(id => typeof id === 'string') ||
        !Array.isArray(value.predecessors) || !value.predecessors.every(name => typeof name === 'string')) {
      throw new Error('Invalid shell client receipt');
    }
    return value as Receipt;
  };
  const write = async (name: string, value: Receipt) => {
    await (await cacheStore.open(name)).put(receipt, new Response(JSON.stringify({ clients: [...new Set(value.clients)], predecessors: value.predecessors })));
  };
  const live = async () => new Set((await clients.matchAll({ type: 'window', includeUncontrolled: true })).map(client => client.id));
  const collect = async () => {
    const ownership = await read(current);
    if (!ownership) return;
    const eligible = new Set([current, ...ownership.predecessors]);
    const alive = await live();
    const keep = new Set<string>();
    for (const name of await names()) {
      // An outgoing worker may still finish an event after a successor activates.
      if (!eligible.has(name)) { keep.add(name); continue; }
      const record = await read(name);
      if (record === null) { keep.add(name); continue; }
      const remaining = record.clients.filter(id => alive.has(id));
      await write(name, { ...record, clients: remaining });
      if (remaining.length) keep.add(name);
    }
    await retainPreviousOcr(cacheStore, current, base, keep);
  };
  return {
    activate: () => enqueue(async () => {
      const alive = await live();
      const shells = await names();
      const records = await Promise.all(shells.map(async name => ({ name, ids: await read(name) })));
      const known = new Set(records.flatMap(record => record.ids?.clients ?? []));
      const unknown = [...alive].filter(id => !known.has(id));
      for (const { name, ids } of records) {
        const adopted = name !== current || shells.length === 1 ? unknown : [];
        await write(name, { clients: [...(ids?.clients ?? []), ...adopted],
          predecessors: name === current ? shells.filter(shell => shell !== current) : ids?.predecessors ?? [] });
      }
      await collect();
    }),
    release: (clientId: string, version: string) => enqueue(async () => {
      const target = SHELL_CACHE_PREFIX + version;
      const ownership = await read(current);
      if (!ownership) return;
      const shells = (await names()).filter(name => name === current || ownership.predecessors.includes(name));
      if (!shells.includes(target)) return;
      const ids = await read(target);
      if (ids === null) return;
      // Publish the destination first: a failed receipt write must keep old protection.
      await write(target, { ...ids, clients: [...ids.clients, clientId] });
      for (const name of shells) {
        if (name === target) continue;
        const previous = await read(name);
        if (previous !== null) await write(name, { ...previous, clients: previous.clients.filter(id => id !== clientId) });
      }
      await collect();
    }),
    collect: () => enqueue(collect)
  };
}

/** Old documents request their original immutable URLs after controller takeover.
    Documents and unhashed resources always belong to the current release. */
export async function retainedShellAsset(
  cacheStore: CacheStorage, current: string, request: Request, base: string, origin: string
): Promise<Response | undefined> {
  if (!new URL(request.url).pathname.startsWith(base + '/_app/immutable/')) return;
  for (const name of await cacheStore.keys()) {
    if (!name.startsWith(SHELL_CACHE_PREFIX) || name === current) continue;
    const cache = await cacheStore.open(name);
    if (!(await cache.match(new Request(new URL(base + SHELL_CLIENTS, origin))))) continue;
    const response = await cache.match(request);
    if (response) return response;
  }
}
