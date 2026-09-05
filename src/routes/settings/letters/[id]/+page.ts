/* Phase 8 features ticket 33 (ADR-0036): moved with its parent screen. */
import { redirect } from '@sveltejs/kit';

export function load({ params }) {
  redirect(307, `/transition/letters/${params.id}`);
}
