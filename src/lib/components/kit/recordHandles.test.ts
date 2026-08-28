import { describe, expect, it } from 'vitest';

import { recordHandles, recordHandleSlug } from './recordHandles.ts';

describe('recordHandles', () => {
  it('names all three of a record sheet’s handles off one slug', () => {
    expect(recordHandles('size-record')).toEqual({
      save: 'data-save-size-record',
      delete: 'data-delete-size-record',
      confirm: 'data-confirm-delete-size-record'
    });
  });

  it('refuses a slug that already carries the vocabulary’s own words', () => {
    expect(() => recordHandles('save-size-record')).toThrow();
    expect(() => recordHandles('data-size-record')).toThrow();
  });

  it('refuses a slug that is not a bare kebab-case name', () => {
    expect(() => recordHandles('Size Record')).toThrow();
    expect(() => recordHandles('size_record')).toThrow();
    expect(() => recordHandles('')).toThrow();
  });
});

describe('recordHandleSlug', () => {
  it('reads the slug back out of a generated handle', () => {
    expect(recordHandleSlug('data-save-size-record')).toBe('size-record');
    expect(recordHandleSlug('data-delete-size-record')).toBe('size-record');
    expect(recordHandleSlug('data-confirm-delete-size-record')).toBe('size-record');
  });

  it('prefers the longest prefix, so a confirm handle is never read as a delete one', () => {
    // 'data-confirm-delete-lab' starts with neither 'data-save-' nor
    // 'data-delete-', but a naive scan for '-delete-' would leave 'lab'
    // attributed to a slug called 'confirm'.
    expect(recordHandleSlug('data-confirm-delete-lab')).toBe('lab');
  });

  it('gives back null for a handle no record sheet generates', () => {
    expect(recordHandleSlug('data-confirm-reset')).toBeNull();
    expect(recordHandleSlug('data-add-feeling')).toBeNull();
    expect(recordHandleSlug('data-save')).toBeNull();
  });
});

describe('the generated vocabulary', () => {
  it('round-trips every prefix', () => {
    const handles = recordHandles('wear-session');
    for (const handle of Object.values(handles)) expect(recordHandleSlug(handle)).toBe('wear-session');
  });
});
