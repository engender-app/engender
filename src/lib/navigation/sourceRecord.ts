/** Only journal surfaces that originate source links can be return targets. */
export function sourceReturnTo(url: URL): string | null {
  const value = url.searchParams.get('returnTo');
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.includes('\\')) return null;
  const target = new URL(value, url.origin);
  if (target.origin !== url.origin) return null;
  if (target.pathname !== '/media/photos' && target.pathname !== '/transition/milestones'
    && !/^\/media\/documents\/[^/]+$/.test(target.pathname)) return null;
  return target.pathname + target.search + target.hash;
}

export function withSourceReturn(href: string, source: URL): string {
  const target = new URL(href, source.origin);
  target.searchParams.set('returnTo', source.pathname + source.search + source.hash);
  return target.pathname + target.search + target.hash;
}

/** Where a Care-spine source screen goes back to: the lane and day the
    tapped mark named (`?lane=<drug>&date=<day>`, under either name - `drug`
    is what a schedule link carries for its own picker), or the hub when it
    names neither. */
export function careLaneReturnHref(url: URL): string {
  const lane = url.searchParams.get('lane') ?? url.searchParams.get('drug');
  const date = url.searchParams.get('date');
  if (!lane && !date) return '/more';
  const params = new URLSearchParams();
  if (lane) params.set('lane', lane);
  if (date) params.set('date', date);
  return `/care?${params.toString()}`;
}
