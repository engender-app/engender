/* Phase 8 features ticket 33 (ADR-0036) first moved this with its parent
   screen, to /practice/voice/metrics. Phase 11 ticket 17 folded that
   screen into a sheet over /practice/voice - repointed straight at the
   sheet's own default rather than at the other stub, so a bookmark this
   old lands in one hop, not two. */
import { redirect } from '@sveltejs/kit';

export function load() {
  redirect(307, '/practice/voice?metric=pitch');
}
