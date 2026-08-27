import { describe, expect, it, vi } from 'vitest';

import { findDeleteTarget, nextEditor, trySave } from './recordEditor.ts';

type Rec = { id: string; name: string };
type Draft = { id?: string; name: string };

const options = {
  blank: () => ({ name: '' }) as Draft,
  fromRecord: (r: Rec) => ({ id: r.id, name: r.name }) as Draft
};

describe('nextEditor', () => {
  it('builds a blank draft for a new record', () => {
    expect(nextEditor(options, null)).toEqual({ name: '' });
  });

  it('builds a draft from an existing record', () => {
    expect(nextEditor(options, { id: 'a', name: 'Alpha' })).toEqual({ id: 'a', name: 'Alpha' });
  });

  it('returns null when the record type has no editor at all', () => {
    expect(nextEditor<Rec, Draft>({}, null)).toBeNull();
    expect(nextEditor<Rec, Draft>({}, { id: 'a', name: 'Alpha' })).toBeNull();
  });
});

describe('trySave', () => {
  it('closes the editor when upsert succeeds', async () => {
    const upsert = vi.fn();
    expect(await trySave({ name: 'x' }, upsert)).toBe(true);
    expect(upsert).toHaveBeenCalledWith({ name: 'x' });
  });

  it('keeps the editor open when upsert reports invalid input', async () => {
    const upsert = vi.fn().mockReturnValue(false);
    expect(await trySave({ name: '' }, upsert)).toBe(false);
  });

  it('closes when there is nothing to persist (delete-only record types)', async () => {
    expect(await trySave<Draft>({ name: 'x' }, undefined)).toBe(true);
  });
});

describe('findDeleteTarget', () => {
  const records: Rec[] = [{ id: 'a', name: 'Alpha' }, { id: 'b', name: 'Beta' }];
  const findById = (id: string) => records.find((r) => r.id === id);

  it('looks the record up by the open editor draft id when called with no argument', () => {
    expect(findDeleteTarget(findById, { id: 'b', name: 'Beta (edited)' }, undefined)).toEqual({ id: 'b', name: 'Beta' });
  });

  it('returns null with no argument when the draft is new (no id yet)', () => {
    expect(findDeleteTarget<Rec, Draft>(findById, { name: 'new' }, undefined)).toBeNull();
  });

  it('returns null with no argument when there is no open editor', () => {
    expect(findDeleteTarget(findById, null, undefined)).toBeNull();
  });

  it('looks the record up by id when called with an id string, for a delete-only row', () => {
    expect(findDeleteTarget(findById, null, 'a')).toEqual({ id: 'a', name: 'Alpha' });
  });

  it('passes an explicit record straight through, for a row that already has it in hand', () => {
    const record = { id: 'c', name: 'Gamma' };
    expect(findDeleteTarget(findById, null, record)).toBe(record);
  });

  it('returns null when the id resolves to nothing', () => {
    expect(findDeleteTarget(findById, null, 'missing')).toBeNull();
  });
});
