import { afterEach, beforeEach, expect, test, vi } from 'vitest';

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv('PROD', true);
  vi.stubEnv('VITE_DEMO', '');
  vi.stubGlobal('location', { origin: 'https://app.engender.barankiewicz.dev' });
  vi.stubGlobal('navigator', { onLine: true });
  vi.stubGlobal('window', {});
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 204 })));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

test('counts once with no route, query, credentials, referrer or body', async () => {
  vi.stubGlobal('location', {
    origin: 'https://app.engender.barankiewicz.dev',
    pathname: '/search', search: '?q=private-journal-text', hash: '#private'
  });
  const { countPageLoad } = await import('./page-load');
  countPageLoad();
  countPageLoad();
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(fetch).toHaveBeenCalledWith('/_stats/app', {
    method: 'POST', credentials: 'omit', referrerPolicy: 'no-referrer',
    redirect: 'error', cache: 'no-store', keepalive: true
  });
});

test.each(['android', 'offline', 'development', 'demo', 'self-hosted'])('does not count %s', async (kind) => {
  if (kind === 'android') vi.stubGlobal('window', { Capacitor: { getPlatform: () => 'android' } });
  if (kind === 'offline') vi.stubGlobal('navigator', { onLine: false });
  if (kind === 'development') vi.stubEnv('PROD', false);
  if (kind === 'demo') vi.stubEnv('VITE_DEMO', '1');
  if (kind === 'self-hosted') vi.stubGlobal('location', { origin: 'https://journal.example' });
  const { countPageLoad } = await import('./page-load');
  countPageLoad();
  expect(fetch).not.toHaveBeenCalled();
});

test('failed counts do not retry', async () => {
  vi.mocked(fetch).mockRejectedValue(new TypeError('Network unavailable'));
  const { countPageLoad } = await import('./page-load');
  countPageLoad();
  await Promise.resolve();
  countPageLoad();
  expect(fetch).toHaveBeenCalledTimes(1);
});
