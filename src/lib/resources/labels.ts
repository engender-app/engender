/* Localize directory.ts resources here. Both maps cover the full key union. Null hours mean
   none were published. Keep this Paraglide module out of Node imports. */

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
  'pl-zaimki': null,
  'int-translifeline': m.resources_int_translifeline_hours,
  'int-mindline-trans': m.resources_int_mindline_trans_hours,
  'int-gdb': null,
  'int-transfemscience': null,
  'int-wpath-soc8': null
};

export const resourceDescription = (key: ResourceKey): string => DESCRIPTION[key]();

export const resourceHours = (key: ResourceKey): string | null => HOURS[key]?.() ?? null;
