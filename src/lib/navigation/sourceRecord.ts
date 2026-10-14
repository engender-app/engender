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

/** The list an entry was opened from (Calendar, Search, a day, On this day,
    Good moments, a tag's entries), carried in `from` so it survives a reload
    of the editor. Kept apart from `returnTo`: that one also makes the editor
    show its "back to the source record" button, which an ordinary list is
    not. Any in-app path but another entry will do. */
export function listReturnTo(url: URL): string | null {
  const value = url.searchParams.get('from');
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.includes('\\')) return null;
  const target = new URL(value, url.origin);
  if (target.origin !== url.origin || target.pathname.startsWith('/entry/')) return null;
  return target.pathname + target.search + target.hash;
}

export function withListReturn(href: string, list: URL): string {
  const target = new URL(href, list.origin);
  target.searchParams.set('from', list.pathname + list.search + list.hash);
  return target.pathname + target.search + target.hash;
}

export function withSourceReturn(href: string, source: URL): string {
  const target = new URL(href, source.origin);
  target.searchParams.set('returnTo', source.pathname + source.search + source.hash);
  return target.pathname + target.search + target.hash;
}

/** A Care link carries an episode UUID, never its free-text drug name. */
export function careEpisodeId(url: URL): string | null {
  const id = url.searchParams.get('episode');
  return id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id) ? id : null;
}

/** Return to the same Care episode and numeric day. Legacy drug/lane text
    is not copied into another history entry. */
export function careLaneReturnHref(url: URL): string {
  const episodeId = careEpisodeId(url);
  const rawDate = url.searchParams.get('date');
  const date = rawDate !== null && /^-?\d+$/.test(rawDate) ? rawDate : null;
  if (!episodeId && !date) return '/more';
  const params = new URLSearchParams();
  if (episodeId) params.set('episode', episodeId);
  if (date) params.set('date', date);
  return `/care?${params.toString()}`;
}
