/* Ticket 10: the widget-picker prints each provider's description under
   the app's real group header, disguise on or off, and nothing flips it -
   unlike the placed widget's own header, the OS gives no disguised variant
   here. Guards the three descriptions against the words that would give
   the app away to anyone scrolling the picker. */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const GIVEAWAYS = /mood|misgender|doubt|journal/i;

describe('widget picker descriptions', () => {
  const xml = readFileSync('android/app/src/main/res/values/strings.xml', 'utf8');
  const descriptions = [...xml.matchAll(/name="widget_\w+_description">([^<]+)</g)].map((m) => m[1]);

  it('finds all three widget descriptions', () => {
    expect(descriptions).toHaveLength(3);
  });

  it('names none of the words the disguise is meant to hide', () => {
    for (const text of descriptions) {
      expect(text).not.toMatch(GIVEAWAYS);
    }
  });
});
