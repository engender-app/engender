import { error } from '@sveltejs/kit';
import { WRAPPED_CADENCES } from '$lib/data/wrapped';
import type { PageLoad } from './$types';

export const load: PageLoad = ({ params }) => {
  if (!(WRAPPED_CADENCES as readonly string[]).includes(params.cadence)) error(404);
};
