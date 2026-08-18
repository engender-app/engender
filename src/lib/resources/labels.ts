/* What each bundled resource offers, and when it answers. directory.ts holds
   no wording at all, so this is where an entry gets its sentence and where it
   changes when the language does (the same split as vocabulary/labels.ts).

   Both maps are typed against the key union directory.ts derives from its own
   `as const` list, so adding a resource without describing it is a typecheck
   failure. HOURS is deliberately `Message | null` rather than a partial map:
   an entry with no published hours has to say so explicitly here, which is
   the difference between "answers whenever" and "nobody wrote it down".

   Both maps are indexed straight, with no cast and no fallback to the raw
   key: `Resource.key` is the union rather than `string`, so there is no
   missing-message case to handle and nothing that could put "pl-lambda" on
   screen where a sentence belongs.

   This file imports paraglide, so nothing the Node tier touches may import
   it (ADR-0016). */

import { m } from '$lib/paraglide/messages';
import type { ResourceKey } from './directory';

type Message = (inputs?: {}, options?: { locale?: 'en' | 'pl' }) => string;

const DESCRIPTION: Record<ResourceKey, Message> = {
  'pl-lambda': m.resources_pl_lambda,
  'pl-transfuzja': m.resources_pl_transfuzja,
  'pl-tranzycja': m.resources_pl_tranzycja,
  'int-translifeline': m.resources_int_translifeline,
  'int-trevor': m.resources_int_trevor,
  'int-mindline-trans': m.resources_int_mindline_trans,
  'int-gdb': m.resources_int_gdb,
  'int-transfemscience': m.resources_int_transfemscience
};

const HOURS: Record<ResourceKey, Message | null> = {
  'pl-lambda': m.resources_pl_lambda_hours,
  'pl-transfuzja': null,
  'pl-tranzycja': null,
  'int-translifeline': m.resources_int_translifeline_hours,
  'int-trevor': m.resources_int_trevor_hours,
  'int-mindline-trans': m.resources_int_mindline_trans_hours,
  'int-gdb': null,
  'int-transfemscience': null
};

export const resourceDescription = (key: ResourceKey): string => DESCRIPTION[key]();

export const resourceHours = (key: ResourceKey): string | null => HOURS[key]?.() ?? null;
