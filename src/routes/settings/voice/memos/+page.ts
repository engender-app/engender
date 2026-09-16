/* Phase 8 features ticket 33 (ADR-0036) first sent this at /media/voice/memos.
   Phase 11 ticket 17 folded that screen into the voice screen's own
   Recordings tab - repointed straight at the final destination rather than
   at the other stub, so a bookmark this old lands in one hop, not two. */
import { redirect } from '@sveltejs/kit';

export function load() {
  redirect(307, '/practice/voice?tab=recordings');
}
