/* Display names for the built-in vocabulary, looked up by key at display
   time (F25, and CONTEXT: Built-in). builtins.ts stores no text at all, so
   this is where a built-in gets its wording - and where it changes when the
   language does.

   Each map is typed against the key union builtins.ts derives from its own
   `as const` list, so adding a built-in without adding its message is a
   typecheck failure rather than a raw key on screen.

   This file imports paraglide, so nothing the Node tier touches may import
   it (ADR-0016). The seam is exact: builtins.ts is the data, this is the
   wording, and vocabulary.ts joins them for the screens. */

import { m } from '$lib/paraglide/messages';
import type {
  BuiltInDimensionKey,
  BuiltInPresetKey,
  BuiltInTagGroupKey,
  BuiltInTagKey,
  MilestoneTemplateKey
} from './builtins';

type Message = () => string;

const DIMENSION_NAME: Record<BuiltInDimensionKey, Message> = {
  euphoria_dysphoria: m.dim_euphoria_dysphoria,
  femininity: m.dim_femininity,
  masculinity: m.dim_masculinity,
  binary_nonbinary: m.dim_binary_nonbinary,
  agender_gendered: m.dim_agender_gendered
};

const DIMENSION_LOW: Record<BuiltInDimensionKey, Message> = {
  euphoria_dysphoria: m.dim_euphoria_dysphoria_low,
  femininity: m.dim_femininity_low,
  masculinity: m.dim_masculinity_low,
  binary_nonbinary: m.dim_binary_nonbinary_low,
  agender_gendered: m.dim_agender_gendered_low
};

const DIMENSION_HIGH: Record<BuiltInDimensionKey, Message> = {
  euphoria_dysphoria: m.dim_euphoria_dysphoria_high,
  femininity: m.dim_femininity_high,
  masculinity: m.dim_masculinity_high,
  binary_nonbinary: m.dim_binary_nonbinary_high,
  agender_gendered: m.dim_agender_gendered_high
};

const PRESET_NAME: Record<BuiltInPresetKey, Message> = {
  'p-btw': m.preset_p_btw,
  'p-nb': m.preset_p_nb
};

const TAG_GROUP_NAME: Record<BuiltInTagGroupKey, Message> = {
  gender: m.taggroup_gender,
  emotions: m.taggroup_emotions,
  activities: m.taggroup_activities
};

const TAG_LABEL: Record<BuiltInTagKey, Message> = {
  'g-soc-dys': m.tag_g_soc_dys,
  'g-body-dys': m.tag_g_body_dys,
  'g-soc-eu': m.tag_g_soc_eu,
  'g-body-eu': m.tag_g_body_eu,
  'g-transphobia': m.tag_g_transphobia,
  'g-gendered-ok': m.tag_g_gendered_ok,
  'g-misgendered': m.tag_g_misgendered,
  'e-happy': m.tag_e_happy,
  'e-calm': m.tag_e_calm,
  'e-anxious': m.tag_e_anxious,
  'e-sad': m.tag_e_sad,
  'e-hopeful': m.tag_e_hopeful,
  'e-tired': m.tag_e_tired,
  'a-work': m.tag_a_work,
  'a-friends': m.tag_a_friends,
  'a-family': m.tag_a_family,
  'a-exercise': m.tag_a_exercise,
  'a-therapy': m.tag_a_therapy,
  'a-shopping': m.tag_a_shopping,
  'a-selfcare': m.tag_a_selfcare
};

const TEMPLATE_NAME: Record<MilestoneTemplateKey, Message> = {
  hrt_start: m.tpl_hrt_start,
  transition_start: m.tpl_transition_start,
  coming_out: m.tpl_coming_out,
  first_appointment: m.tpl_first_appointment,
  name_change: m.tpl_name_change,
  marker_change: m.tpl_marker_change,
  surgery: m.tpl_surgery,
  first_public: m.tpl_first_public
};

/* Each lookup falls back to the key itself. A key with no message means a
   built-in was seeded by a build that knew it and is being read by one that
   doesn't - an archive from a newer version, or a downgrade. Showing the
   key is ugly; dropping the row would lose an entry's tag. */
function lookup<K extends string>(map: Record<K, Message>, key: string): string {
  return (map as Record<string, Message | undefined>)[key]?.() ?? key;
}

export const dimensionName = (key: string) => lookup(DIMENSION_NAME, key);
export const dimensionLow = (key: string) => lookup(DIMENSION_LOW, key);
export const dimensionHigh = (key: string) => lookup(DIMENSION_HIGH, key);
export const presetName = (key: string) => lookup(PRESET_NAME, key);
export const tagGroupName = (key: string) => lookup(TAG_GROUP_NAME, key);
export const tagLabel = (key: string) => lookup(TAG_LABEL, key);
export const milestoneTemplateName = (key: string) => lookup(TEMPLATE_NAME, key);
