import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'svelte/compiler';
import { expect, test } from 'vitest';

function svelteFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? svelteFiles(join(directory, entry.name))
      : entry.name.endsWith('.svelte') ? [join(directory, entry.name)] : []);
}

function textControls(source: string): { at: number; autocomplete: string | null }[] {
  const controls: { at: number; autocomplete: string | null }[] = [];
  function walk(value: unknown) {
    if (!value || typeof value !== 'object') return;
    const node = value as { type?: string; name?: string; start: number; attributes?: { type: string; name: string; start: number; end: number; value?: { type: string; data?: string }[] }[] };
    if (node.type === 'RegularElement' && (node.name === 'input' || node.name === 'textarea')) {
      const attribute = (name: string) => node.attributes?.find((attr) => attr.type === 'Attribute' && attr.name === name);
      const type = attribute('type');
      const staticType = type?.value?.[0]?.type === 'Text' ? type.value[0].data : null;
      const credential = staticType === 'password' || !!type && source.slice(type.start, type.end).includes('password');
      const text = node.name === 'textarea' || !staticType || ['text', 'search'].includes(staticType);
      // Conditional readonly controls can still accept content when editing.
      const readonly = attribute('readonly');
      const alwaysReadonly = readonly && source.slice(readonly.start, readonly.end) === 'readonly';
      if (text && !credential && !alwaysReadonly) {
        const autocomplete = attribute('autocomplete');
        controls.push({ at: node.start, autocomplete: autocomplete ? source.slice(autocomplete.start, autocomplete.end) : null });
      }
    }
    for (const child of Object.values(value)) if (child && typeof child === 'object') walk(child);
  }
  walk(parse(source, { modern: true }));
  return controls;
}

test('every editable journal text control has the web policy or its existing explicit off attribute', () => {
  const missing: string[] = [];
  let protectedControls = 0;
  for (const file of svelteFiles('src')) {
    const source = readFileSync(file, 'utf8');
    for (const control of textControls(source)) {
      if (!control.autocomplete || !/autocomplete\s*=\s*(?:['"]off['"]|\{journalTextAutocomplete\(\)\})/.test(control.autocomplete)) {
        missing.push(`${file}:${source.slice(0, control.at).split('\n').length}`);
      } else protectedControls++;
    }
  }
  expect(missing, 'Journal content must not enter browser form history or session restore').toEqual([]);
  expect(protectedControls).toBeGreaterThan(70);
});

test('the guard sees missing textarea and dynamic shared text controls without treating credentials or readonly pickers as journal text', () => {
  expect(textControls('<textarea></textarea><input type={kind} />')).toEqual([
    { at: 0, autocomplete: null }, { at: 21, autocomplete: null }
  ]);
  expect(textControls('<input type="password" autocomplete="current-password" /><input readonly type="text" />')).toEqual([]);
  expect(textControls('<input readonly={busy} type="text" />')).toEqual([{ at: 0, autocomplete: null }]);
});
