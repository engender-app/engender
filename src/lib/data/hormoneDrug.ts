/* Identify estradiol and testosterone in free-text drug names. Lab timing,
   effect windows and cycle visibility share this decision. */

import { mentions, normalize } from './hormoneNameMatch';

export type HormoneDrug = 'estradiol' | 'testosterone';

/** Estradiol wins when a loosely typed field names both drugs. */
export function resolveHormoneDrug(drug: string): HormoneDrug | null {
  const text = normalize(drug);
  if (mentions(text, { names: ['estradiol'], abbreviations: ['e2'] })) return 'estradiol';
  if (mentions(text, { names: ['methyltestosteron', 'metylotestosteron'], abbreviations: [] })) return null;
  if (mentions(text, { names: ['testosteron'], abbreviations: ['t'] })) return 'testosterone';
  return null;
}
