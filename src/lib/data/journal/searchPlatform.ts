/* Which search hits a platform may show. A reminder rings only on Android,
   which is the only place its screen exists, so the web never offers one as a
   result. Kept apart from searchHitRows.ts so the rule is testable without
   paraglide. */
import type { SearchHit } from './textSearch';

export function hitsForPlatform(hits: readonly SearchHit[], android: boolean): SearchHit[] {
  return android ? [...hits] : hits.filter((hit) => hit.area !== 'reminders');
}
