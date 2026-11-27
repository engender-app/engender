import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  applyRename, findForms, fingerprint, keysToReview, lexiconProblem, matchCase, NOUN_SLOTS, renameMap, renameOccurrences, suggestForms, termUsage
} from '../../../scripts/lexicon-core.mjs';
import { readLexicon, writeLexicon } from '../../../scripts/strings.mjs';

const schemat = {
  'nom.sg': 'schemat', 'gen.sg': 'schematu', 'dat.sg': 'schematowi', 'acc.sg': 'schemat',
  'ins.sg': 'schematem', 'loc.sg': 'schemacie', 'voc.sg': 'schemacie',
  'nom.pl': 'schematy', 'gen.pl': 'schematów', 'dat.pl': 'schematom', 'acc.pl': 'schematy',
  'ins.pl': 'schematami', 'loc.pl': 'schematach', 'voc.pl': 'schematy'
};
const plan = Object.fromEntries(Object.entries(schemat).map(([slot, form]) =>
  [slot, form.replace('schemacie', 'planie').replace('schemat', 'plan')]));

function term(pl = schemat) {
  return { id: 'regimen', kind: 'noun', confirmed: false, note: '',
    en: { forms: { sg: 'regimen', pl: 'regimens' }, avoid: ['schedule'] }, pl: { forms: { ...pl }, avoid: ['kurac'] } };
}

function rename(text: string, before: Record<string, string>, after: Record<string, string>) {
  const occurrences = renameOccurrences(text, renameMap(before, after));
  return applyRename(text, occurrences, occurrences.map((o) => o.choices[0].text));
}

describe('lexicon matching', () => {
  it('matches whole words only, case-insensitively, outside placeholders', () => {
    expect(findForms('Schemat i schematy, {schemat}, nieschemat, schematu.', ['schemat', 'schematu']).map((f) => f.text))
      .toEqual(['Schemat', 'schematu']);
  });

  it('prefers the longer of two overlapping multi-word forms', () => {
    expect(findForms('Kamienie milowe i kamienie', ['kamienie', 'kamienie milowe']).map((f) => f.text))
      .toEqual(['Kamienie milowe', 'kamienie']);
  });

  it('keeps capitalisation', () => {
    expect([matchCase('Schemat', 'plan'), matchCase('SCHEMAT', 'plan'), matchCase('schemat', 'plan')])
      .toEqual(['Plan', 'PLAN', 'plan']);
  });
});

describe('lexicon rename', () => {
  it('rewrites every declined form to the same slot of the new term', () => {
    expect(rename('Dodaj schemat. Brak schematu. W schemacie {count} dni. Schematy.', schemat, plan))
      .toBe('Dodaj plan. Brak planu. W planie {count} dni. Plany.');
  });

  it('offers a choice where one old form fills slots that now differ', () => {
    const before = { 'nom.sg': 'osoba', 'acc.pl': 'osoby', 'nom.pl': 'osoby' };
    const after = { 'nom.sg': 'człowiek', 'acc.pl': 'ludzi', 'nom.pl': 'ludzie' };
    const [occurrence] = renameOccurrences('Osoby', renameMap(before, after));
    expect(occurrence.choices).toEqual([
      { text: 'Ludzi', slots: ['acc.pl'] }, { text: 'Ludzie', slots: ['nom.pl'] }
    ]);
  });

  it('counts an unchanged slot sharing the old form as one of the choices', () => {
    const map = renameMap({ 'gen.sg': 'dawki', 'nom.pl': 'dawki' }, { 'gen.sg': 'porcji', 'nom.pl': 'dawki' });
    expect(map.get('dawki')?.map((choice) => choice.text)).toEqual(['porcji', 'dawki']);
  });

  it('renames a fixed phrase only where it is written exactly', () => {
    const map = renameMap({ 'save:base': 'Save' }, { 'save:base': 'Keep' }, new Set(['save:base']));
    const text = 'Save. Tap Save to save it.';
    const occurrences = renameOccurrences(text, map);
    expect(applyRename(text, occurrences, occurrences.map((o) => o.choices[0].text))).toBe('Keep. Tap Keep to save it.');
  });

  it('touches nothing when no form changed', () => {
    expect(renameMap(schemat, schemat).size).toBe(0);
  });
});

describe('lexicon usage', () => {
  const records = [
    { key: 'a', en: 'Add a regimen', pl: 'Dodaj schemat' },
    { key: 'b', en: 'Regimens', pl: 'Kuracje' },
    { key: 'c', en: 'Other', pl: [{ match: { 'n=one': 'Jeden schemat', 'n=other': '{n} schematów' } }] },
    { key: 'd', en: 'Old regimen', pl: 'Stary schemat', change: 'removed' }
  ];

  it('lists keys, untranslated uses and avoided stems', () => {
    expect(termUsage(term(), records)).toEqual({
      keys: ['a', 'b', 'c'], untranslated: ['b'], avoided: [{ key: 'b', words: ['Kuracje'] }]
    });
  });

  it('drops a dismissed finding until its strings change', () => {
    const dismissed = { ...term(), ignore: { b: fingerprint('Regimens', 'Kuracje') } };
    expect(termUsage(dismissed, records)).toEqual({ keys: ['a', 'b', 'c'], untranslated: [], avoided: [] });
    const edited = records.map((r) => r.key === 'b' ? { ...r, pl: 'Kuracje i schematy' } : r);
    expect(termUsage(dismissed, edited).avoided).toEqual([{ key: 'b', words: ['Kuracje'] }]);
    expect(lexiconProblem({ terms: [dismissed] })).toBeNull();
    expect(lexiconProblem({ terms: [{ ...term(), ignore: ['b'] }] })).toBe('regimen: ignore maps keys to fingerprints.');
  });

  it('suggests catalogue words sharing the stem', () => {
    expect(suggestForms(['schemat'], ['Schemat, schematu i schemacie', 'schematu']))
      .toEqual([{ word: 'schematu', count: 2 }, { word: 'schemacie', count: 1 }, { word: 'schemat', count: 1 }]);
  });

  it('marks reviewed the keys of a term just confirmed or edited while confirmed', () => {
    const confirmed = { ...term(), confirmed: true };
    const keys = (saved: unknown[], draft: unknown[]) =>
      keysToReview({ terms: saved }, { terms: draft }, records).map((entry) => entry.key);
    expect(keysToReview({ terms: [term()] }, { terms: [confirmed] }, records)[0])
      .toEqual({ key: 'a', en: 'Add a regimen', pl: 'Dodaj schemat' });
    expect(keys([term()], [confirmed])).toEqual(['a', 'b', 'c']);
    expect(keys([confirmed], [confirmed])).toEqual([]);
    expect(keys([confirmed], [{ ...confirmed, note: 'edited' }])).toEqual(['a', 'b', 'c']);
    expect(keys([confirmed], [term()])).toEqual([]);
  });

  it('rejects a noun missing a case slot', () => {
    const broken = term();
    delete (broken.pl.forms as Record<string, string>)['loc.pl'];
    expect(lexiconProblem({ terms: [broken] })).toBe(`regimen: pl forms must be ${NOUN_SLOTS.pl.join(', ')}.`);
    expect(lexiconProblem({ terms: [term()] })).toBeNull();
  });
});

describe('lexicon file', () => {
  const roots: string[] = [];
  afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
  const fixture = () => {
    const root = mkdtempSync(join(tmpdir(), 'lexicon-'));
    roots.push(root);
    mkdirSync(join(root, 'messages'));
    return root;
  };

  it('starts empty and saves against the revision it read', () => {
    const root = fixture();
    const { revision, lexicon } = readLexicon(root);
    expect(lexicon).toEqual({ terms: [] });
    writeLexicon(root, { revision, lexicon: { terms: [term()] } });
    expect(JSON.parse(readFileSync(join(root, 'messages/lexicon.json'), 'utf8')).terms[0].id).toBe('regimen');
  });

  it('refuses a stale revision and an invalid lexicon', () => {
    const root = fixture();
    const { revision } = readLexicon(root);
    writeLexicon(root, { revision, lexicon: { terms: [term()] } });
    expect(() => writeLexicon(root, { revision, lexicon: { terms: [] } })).toThrow('Lexicon changed on disk');
    expect(() => writeLexicon(root, { revision: readLexicon(root).revision, lexicon: { terms: [{ id: 'X' }] } }))
      .toThrow('kebab-case');
  });
});
