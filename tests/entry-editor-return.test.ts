/* Phase 14 pre-release ticket 03: the entry editor's Save keeps its own
   accessible name, the date line clears the header, and delete and save
   return to where the entry was opened from. Structural half; the rendered
   half is tests/entry-editor-return.mjs. */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('..', import.meta.url));
const editor = readFileSync(root + 'src/lib/components/EntryEditor.svelte', 'utf8');

describe('entry editor Save, date and delete', () => {
  it('keeps the live region out of the Save button so the button is named by its text', () => {
    const open = editor.indexOf('data-save\n');
    const close = editor.indexOf('</button>', open);
    expect(open).toBeGreaterThan(0);
    const button = editor.slice(open, close);
    expect(button).not.toContain('role="status"');
    expect(button).not.toContain('aria-live');
    expect(editor).toMatch(/<span class="visually-hidden" role="status" data-save-status>/);
  });

  it('draws the date line as the header subtitle, not a paragraph spaced by hand', () => {
    expect(editor).toContain('subtitle={dateLine}');
    expect(editor).not.toContain('class="editor-date"');
  });

  it('makes the disabling fieldset the screen itself, so the screen rules reach its blocks', () => {
    const open = editor.match(/<fieldset[^>]*class="screen editor"[^>]*>/)?.[0] ?? '';
    expect(open).toContain('disabled={saving}');
    expect(open).toContain('inert={saving}');
    expect(editor).not.toContain('class="editor-fields"');
  });

  it('moves to trash with a Restore action and says so when the delete fails', () => {
    const start = editor.indexOf('async function confirmDelete');
    const body = editor.slice(start, editor.indexOf('</script>', start));
    expect(body).toContain('m.entry_trashed_toast()');
    expect(body).toContain('m.trash_restore()');
    expect(body).toContain('restoreEntry(id)');
    expect(body).toContain('m.entry_delete_failed()');
    expect(body).not.toContain("goto('/')");
  });

  it('leaves through one function: the list it came from, else the place saving chose', () => {
    const body = editor.slice(editor.indexOf('navigate: async (destination)'), editor.indexOf('let entryDraft'));
    expect(body).toContain('listReturnTo(page.url)');
    expect(body).toContain('smartBackSettled(target)');
    expect(body).toContain('replaceRoute(destination)');
    expect(editor).toContain('const leave = session.leave;');
    expect(editor).toContain('await session.save()');
    expect(editor).not.toContain('goBackToSource');
  });

  it('opens an entry with its list named, from every list that shows entries', () => {
    for (const file of ['src/lib/components/kit/DayEntry.svelte']) {
      expect(readFileSync(root + file, 'utf8')).toContain('withListReturn(');
    }
  });
});
