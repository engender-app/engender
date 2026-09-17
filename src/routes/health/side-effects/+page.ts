/* Phase 11 all-four-doors ticket 13: side effects moved onto the same axis
   and the same screen as the changes somebody was hoping for. The address
   does not move with it - anyone who bookmarked or was sent this link keeps
   it working (ADR-0036's bargain), and it lands in one hop rather than two:
   /settings/side-effects points here no longer, and points at the merged
   screen directly instead (settings-route-redirects.test.ts). */
import { redirect } from '@sveltejs/kit';

export function load() {
  redirect(307, '/care/changes');
}
