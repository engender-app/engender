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

  it('gives the date line no negative top margin', () => {
    const rule = editor.match(/\.editor-date \{[^}]*\}/)?.[0] ?? '';
    expect(rule).not.toBe('');
    expect(rule).not.toMatch(/margin:[^;]*calc\(-1/);
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

  it('returns an opened entry to where it came from on save and delete', () => {
    const body = editor.slice(editor.indexOf('function goBackToSource'), editor.indexOf('async function saveEntry'));
    expect(body).toContain("smartBack('/')");
  });
});
