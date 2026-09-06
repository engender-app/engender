/* CARPET-06: an attached photo opens a viewer instead of doing nothing.
   Structural checks at the level a component's source can be held to -
   the behaviour itself (a real blob loaded, the sheet opening on click) is
   proved in a browser, not here (see entry-editor-unified-logging-hub.test.ts
   for the same style of check on this file). */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (path: string) => readFileSync(root + path, 'utf8');

describe('PhotoViewer', () => {
  const viewer = read('src/lib/components/PhotoViewer.svelte');

  it('opens through the shared Sheet, not a bespoke overlay', () => {
    expect(viewer).toContain("import Sheet from './Sheet.svelte'");
    expect(viewer).toMatch(/<Sheet open={photo !== null}/);
  });

  it('reads the full-resolution file, not the thumbnail', () => {
    expect(viewer).toContain("import { readPhoto } from '$lib/stores/photoFiles'");
    expect(viewer).not.toContain('readThumbnail');
  });
});

describe('EntryEditor attachment photos', () => {
  const editor = read('src/lib/components/EntryEditor.svelte');

  it('wraps every attachment-photo thumbnail in a .photo-view button', () => {
    // The three photo tiles a person can tap: a saved entry photo, one just
    // picked but not yet saved, and the procedure-recovery panel's own
    // photo - each its own instance because each reads from a different
    // shape (Photo vs NormalizedPhoto) and none may be missed.
    const occurrences = editor.match(/class="photo-view"/g) ?? [];
    expect(occurrences.length).toBe(3);
  });

  it("labels the button with photo_view_label, not photo_remove's or photo_star's", () => {
    const viewButtons = [...editor.matchAll(/<button class="photo-view"[^>]*aria-label={([^}]*)}/g)];
    expect(viewButtons.length).toBe(3);
    for (const [, ariaLabel] of viewButtons) {
      expect(ariaLabel).toBe('m.photo_view_label()');
    }
  });
});
