import { describe, expect, it } from 'vitest';
import { answeredQuestions, debriefListItems } from './debriefNote';
import type { ChecklistItem, LabResult, SideEffect } from '../types';

function lab(epochDay: number, analyte: string, value: number, unit: string): LabResult {
  return {
    id: `lab-${epochDay}-${analyte}`,
    epochDay,
    analyte,
    value,
    unit,
    note: '',
    drawTime: null,
    provider: '',
    timing: null
  };
}

function effect(epochDay: number, name: string, severity: number | null): SideEffect {
  return { id: `se-${epochDay}-${name}`, epochDay, name, severity };
}

describe('debriefListItems', () => {
  it('is empty for two empty ranges', () => {
    expect(debriefListItems([], [])).toEqual([]);
  });

  it('formats a lab as analyte, value and unit', () => {
    expect(debriefListItems([lab(100, 'Estradiol', 45, 'pg/mL')], [])).toEqual([
      { epochDay: 100, text: 'Estradiol 45 pg/mL' }
    ]);
  });

  it('formats a side effect as name and severity out of 5, no word for the number', () => {
    expect(debriefListItems([], [effect(100, 'Headache', 3)])).toEqual([
      { epochDay: 100, text: 'Headache (3/5)' }
    ]);
  });

  it('formats a side effect left blank as just its name, no dangling parenthetical', () => {
    expect(debriefListItems([], [effect(100, 'Brain fog', null)])).toEqual([{ epochDay: 100, text: 'Brain fog' }]);
  });

  it('merges both kinds sorted by epoch day, earliest first', () => {
    const items = debriefListItems(
      [lab(120, 'Testosterone', 0.9, 'nmol/L'), lab(100, 'Estradiol', 45, 'pg/mL')],
      [effect(110, 'Nausea', 2)]
    );
    expect(items.map((i) => i.epochDay)).toEqual([100, 110, 120]);
  });

  it('keeps input order for two items on the same day', () => {
    const items = debriefListItems([lab(100, 'Estradiol', 45, 'pg/mL')], [effect(100, 'Headache', 3)]);
    expect(items.map((i) => i.text)).toEqual(['Estradiol 45 pg/mL', 'Headache (3/5)']);
  });
});

function item(id: string, content: string): ChecklistItem {
  return { id, content, checked: false, carriedForward: false };
}

describe('answeredQuestions', () => {
  const items = [item('a', 'Ask about the dose'), item('b', 'Ask about the referral'), item('c', 'Bloods')];

  it('is empty when nothing was typed', () => {
    expect(answeredQuestions(items, {})).toEqual([]);
  });

  it('pairs an answer with the question it was typed under', () => {
    expect(answeredQuestions(items, { b: 'She is writing it this week' })).toEqual([
      { question: 'Ask about the referral', answer: 'She is writing it this week' }
    ]);
  });

  it('keeps the list order rather than the order they were typed in', () => {
    const answers = { c: 'in a month', a: 'staying as it is' };
    expect(answeredQuestions(items, answers).map((pair) => pair.question)).toEqual([
      'Ask about the dose',
      'Bloods'
    ]);
  });

  it('drops a question advanced past without an answer, leaving nothing behind', () => {
    expect(answeredQuestions(items, { a: '', b: '   ' })).toEqual([]);
  });

  it('trims what was typed', () => {
    expect(answeredQuestions(items, { a: '  no change  ' })).toEqual([
      { question: 'Ask about the dose', answer: 'no change' }
    ]);
  });

  it('ignores an answer whose question is no longer on the list', () => {
    expect(answeredQuestions(items, { gone: 'said something' })).toEqual([]);
  });
});
