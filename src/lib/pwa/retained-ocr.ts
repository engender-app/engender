import legacyOcrAssets from './legacy-ocr-assets.json';
import { OCR_ROOT, SHELL_CACHE_PREFIX } from './shell-assets';

/** Keep only OCR bytes from previous shells. Full retained-client shell
    lifetime is separate. The explicit legacy receipt covers the self-contained
    pre-generation Tesseract library; old OCR URLs must never resolve to newer bytes. */
export async function retainPreviousOcr(cacheStore: CacheStorage, current: string, base: string): Promise<void> {
  for (const name of await cacheStore.keys()) {
    if (!name.startsWith(SHELL_CACHE_PREFIX) || name === current) continue;
    const cache = await cacheStore.open(name);
    for (const request of await cache.keys()) {
      const path = new URL(request.url).pathname;
      if (path.startsWith(base + OCR_ROOT)) continue;
      const legacy = legacyOcrAssets.find(asset => base + asset.path === path);
      if (legacy) {
        const response = await cache.match(request);
        if (response) {
          const hash = await crypto.subtle.digest('SHA-256', await response.arrayBuffer());
          const hex = [...new Uint8Array(hash)].map(byte => byte.toString(16).padStart(2, '0')).join('');
          if (hex === legacy.sha256) continue;
        }
      }
      await cache.delete(request);
    }
    if (!(await cache.keys()).length) await cacheStore.delete(name);
  }
}

/** Read a retained generation by its exact URL, never by a model filename. */
export async function retainedOcr(cacheStore: CacheStorage, current: string, request: Request, base: string): Promise<Response | undefined> {
  const path = new URL(request.url).pathname;
  if (!path.startsWith(base + OCR_ROOT) && !legacyOcrAssets.some(asset => base + asset.path === path)) return;
  for (const name of await cacheStore.keys()) {
    if (!name.startsWith(SHELL_CACHE_PREFIX) || name === current) continue;
    const response = await (await cacheStore.open(name)).match(request);
    if (response) return response;
  }
}
