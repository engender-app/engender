/* The layout's half of the document chrome (ADR-0009). The other half is
   the pre-paint script in src/app.html, driven against this same fixture by
   tests/app-html-chrome.test.ts - see documentChrome.ts's header for why
   the rule is written twice. */

import { describe, expect, it } from 'vitest';
import { documentChrome } from './documentChrome.ts';
import fixture from './fixtures/document-chrome.json';
import type { ChromeCase } from './fixtures/documentChromeCase.ts';

describe('documentChrome against the shared fixture', () => {
  for (const testCase of fixture as ChromeCase[]) {
    it(testCase.name, () => {
      expect(documentChrome(testCase.prefs, testCase.system)).toEqual(testCase.expected);
    });
  }
});
