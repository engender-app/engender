/* Audit item 6: entry templates stopped being a standalone screen - fifteen
   rows of names even hosted under Settings (redesign ticket 51) - and
   became a sheet raised over Settings (VocabularyManagerSheets.svelte).
   This address still lands: the Tracking row, a saved search hit and a
   bookmark to the old screen all still point here, and `?raise=templates`
   is read once by /settings/+page.svelte to open the sheet. */
import { redirect } from '@sveltejs/kit';

export function load() {
  redirect(307, '/settings?raise=templates');
}
