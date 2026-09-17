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
