/* Phase 8 features ticket 33 (ADR-0036): the screen moved off Settings,
   the address does not - anyone who bookmarked or was sent this link
   keeps it working. Repointed straight at the merged screen by ticket 13,
   the way redesign ticket 61 repointed `/settings/sizes` at the merged
   measurements screen rather than at a stub of a stub - a stale bookmark
   lands one call away, not two. */
import { redirect } from '@sveltejs/kit';

export function load() {
  redirect(307, '/care/changes');
}
