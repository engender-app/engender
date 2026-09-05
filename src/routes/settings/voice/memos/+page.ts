/* Phase 8 features ticket 33 (ADR-0036): voice memos got their own screen,
   grouped Media rather than Practice - the benchmark's own stub sits
   beside this one at ../+page.ts. */
import { redirect } from '@sveltejs/kit';

export function load() {
  redirect(307, '/media/voice/memos');
}
