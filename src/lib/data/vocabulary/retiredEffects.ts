import type { BuiltInPersonalEffectKey } from './builtins';

/* Built-ins the functional audit pruned (ticket 23). They stay in the
   catalogue (builtins.ts) and reconcile still seeds them, because a marker
   names its effect by key and an older archive may carry one: a retired
   effect somebody already marked keeps showing, and nobody is offered one
   fresh (effectPicker.ts's offeredEffectTypes). Its own module so the
   picker does not pull the whole catalogue into the editor's chunk (a
   type-only import is erased). This is not the person's own "hidden" flag,
   which they can turn back off; nothing turns this off.

   - Two tier-2 rows that repeat a tier-1 one in the same direction:
     "Fewer erections" (decreased_spontaneous_erections) and "Testicular
     atrophy" (decreased_testicular_volume).
   - Stereotype-coded rows: confidence going down on oestrogen and up on
     testosterone, and colour perception and spatial awareness offered on
     one side only.
   - cycle_cessation, which the cycle log already records as events. */
export const RETIRED_PERSONAL_EFFECT_KEYS: ReadonlySet<string> = new Set<BuiltInPersonalEffectKey>([
  'fewer_erections_feminizing',
  'testicular_atrophy_feminizing',
  'reduced_confidence_feminizing',
  'increased_confidence_masculinizing',
  'improved_color_perception_feminizing',
  'improved_spatial_awareness_feminizing',
  'cycle_cessation'
]);
