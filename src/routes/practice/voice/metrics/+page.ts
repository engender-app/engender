/* Phase 11 ticket 17: the metric reference folded into the voice screen's
   own sheet, opened from a figure's own link (metricHref) rather than
   reached as a screen of its own - a bookmark to this address keeps
   landing somewhere, at the sheet's lead figure. */
import { redirect } from '@sveltejs/kit';

export function load() {
  redirect(307, '/practice/voice?metric=pitch');
}
