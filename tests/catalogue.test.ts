/* The catalogue serializer (phase 12 copy-tooling ticket 01): sorted keys so
   parallel branches stop colliding, `$schema` first, and the formatting the
   files already use. */
import { describe, expect, it } from 'vitest';
import { isSerialized, serializeCatalogue } from '../scripts/catalogue.mjs';

describe('serializeCatalogue', () => {
  it('puts $schema first and sorts the rest', () => {
    const text = serializeCatalogue({ zebra: 'z', $schema: 'x', apple: 'a', mango: 'm' });
    expect(Object.keys(JSON.parse(text))).toEqual(['$schema', 'apple', 'mango', 'zebra']);
  });

  it('sorts by code unit, so an underscore key sorts after a digit and before a letter', () => {
    const text = serializeCatalogue({ b_2: '', b2: '', b_a: '' });
    expect(Object.keys(JSON.parse(text))).toEqual(['b2', 'b_2', 'b_a']);
  });

  it('indents two spaces and ends with one newline', () => {
    expect(serializeCatalogue({ $schema: 'x', a: 'A' })).toBe('{\n  "$schema": "x",\n  "a": "A"\n}\n');
  });

  it('keeps a variant object as it was, key order inside included', () => {
    const variant = [{ declarations: ['input count'], match: { 'count=other': 'many', 'count=one': 'one' } }];
    const text = serializeCatalogue({ b: variant, a: 'A' });
    expect(JSON.parse(text).b).toEqual(variant);
    expect(Object.keys(JSON.parse(text).b[0].match)).toEqual(['count=other', 'count=one']);
  });
});

describe('isSerialized', () => {
  it('fails an unsorted catalogue, passes the same one after serializing', () => {
    const unsorted = '{\n  "$schema": "x",\n  "b": "B",\n  "a": "A"\n}\n';
    expect(isSerialized(unsorted)).toBe(false);
    expect(isSerialized(serializeCatalogue(JSON.parse(unsorted)))).toBe(true);
  });

  it('fails a sorted catalogue with a missing trailing newline', () => {
    expect(isSerialized('{\n  "a": "A"\n}')).toBe(false);
  });
});
