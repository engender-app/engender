/* Phase 8 features ticket 33 (ADR-0036): moved with its parent screen. */
import { redirect } from '@sveltejs/kit';

export function load() {
  redirect(307, '/media/photos/export');
}
