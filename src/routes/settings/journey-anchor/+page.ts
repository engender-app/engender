/* The standalone screen is gone (deepening ticket 10): the pick moved onto
   the milestones screen, which is the only thing that ever needed it. This
   keeps the old address answering for anyone who still has it saved. */
import { redirect } from '@sveltejs/kit';

export function load() {
  redirect(307, '/settings/milestones');
}
