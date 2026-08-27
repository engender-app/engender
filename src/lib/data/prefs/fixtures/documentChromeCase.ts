/* The shape of a document-chrome.json case, so the two tests that read it -
   documentChrome.test.ts and tests/app-html-chrome.test.ts - describe it
   once rather than each declaring their own idea of it. */

import type { ChromePreferences, DocumentChrome, SystemPreferences } from '../documentChrome.ts';

export interface ChromeCase {
  name: string;
  why?: string;
  prefs: ChromePreferences;
  system: SystemPreferences;
  expected: DocumentChrome;
}
