import { isAndroid } from '../platform';

let attempted = false;

/** Count this document once, without reading the journal or the current route. */
export function countPageLoad(): void {
  if (attempted) return;
  attempted = true;
  if (
    !import.meta.env.PROD || import.meta.env.VITE_DEMO === '1' ||
    location.origin !== 'https://app.engender.barankiewicz.dev' ||
    isAndroid() || !navigator.onLine
  ) return;

  void fetch('/_stats/app', {
    method: 'POST',
    credentials: 'omit',
    referrerPolicy: 'no-referrer',
    redirect: 'error',
    cache: 'no-store',
    keepalive: true
  }).catch(() => { /* A failed count never affects the journal and is not retried. */ });
}
