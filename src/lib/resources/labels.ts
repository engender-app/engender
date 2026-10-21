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
  'pl-116123': m.resources_pl_116123,
  'pl-centrum-wsparcia': m.resources_pl_centrum_wsparcia,
  'pl-116111': m.resources_pl_116111,
  'pl-transfuzja': m.resources_pl_transfuzja,
  'pl-tranzycja': m.resources_pl_tranzycja,
  'pl-tranzycja-testosterone': m.resources_pl_tranzycja_testosterone,
  'pl-zaimki': m.resources_pl_zaimki,
  'int-translifeline': m.resources_int_translifeline,
  'int-mindline-trans': m.resources_int_mindline_trans,
  'int-gdb': m.resources_int_gdb,
  'int-transfemscience': m.resources_int_transfemscience,
  'int-wpath-soc8': m.resources_int_wpath_soc8
};

const HOURS: Record<ResourceKey, Message | null> = {
  'pl-lambda': m.resources_pl_lambda_hours,
  'pl-116123': m.resources_hours_always,
  'pl-centrum-wsparcia': m.resources_hours_always,
  'pl-116111': m.resources_hours_always,
  'pl-transfuzja': null,
  'pl-tranzycja': null,
  'pl-tranzycja-testosterone': null,
  'pl-zaimki': null,
  'int-translifeline': m.resources_int_translifeline_hours,
  'int-mindline-trans': m.resources_int_mindline_trans_hours,
  'int-gdb': null,
  'int-transfemscience': null,
  'int-wpath-soc8': null
};

export const resourceDescription = (key: ResourceKey): string => DESCRIPTION[key]();

export const resourceHours = (key: ResourceKey): string | null => HOURS[key]?.() ?? null;
