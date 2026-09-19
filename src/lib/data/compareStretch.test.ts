import { test, expect } from 'vitest';
import { compareStretchNoticeProps, compareStretchQuery, precedingWindow, stretchTooShortToCompare } from './compareStretch';
import { dateInputValueFromEpochDay, epochDayFromDateInputValue, todayEpochDay } from './epochDay';

const COPY = {
  title: () => 'Compare this stretch',
  openHint: () => 'Counts through today',
  tooShort: () => 'Not enough journal before this',
  noPrecedingData: () => 'Nothing logged before this',
  action: () => 'Open compare'
};

test('precedingWindow takes the same-length window immediately before a multi-day stretch', () => {
  expect(precedingWindow({ start: 100, end: 109 })).toEqual({ start: 90, end: 99 });
});

test('precedingWindow takes the one day before a one-day stretch', () => {
  expect(precedingWindow({ start: 100, end: 100 })).toEqual({ start: 99, end: 99 });
});

test('precedingWindow pairs a seven-day span with the immediately preceding seven days without overlap or an off-by-one day', () => {
  const stretch = { start: 100, end: 106 };
  const preceding = precedingWindow(stretch);
  expect(preceding).toEqual({ start: 93, end: 99 });
  expect(stretch.end - stretch.start + 1).toBe(7);
  expect(preceding.end - preceding.start + 1).toBe(7);
  expect(preceding.end).toBe(stretch.start - 1);
  expect(preceding.end < stretch.start).toBe(true);
});

test('precedingWindow preserves calendar-day count across leap day boundary', () => {
  const feb28 = epochDayFromDateInputValue('2024-02-28');
  const mar05 = epochDayFromDateInputValue('2024-03-05');
  expect(feb28).not.toBeNull();
  expect(mar05).not.toBeNull();
  const stretch = { start: feb28!, end: mar05! };
  expect(stretch.end - stretch.start + 1).toBe(7);
  const preceding = precedingWindow(stretch);
  expect(preceding.end - preceding.start + 1).toBe(7);
  expect(dateInputValueFromEpochDay(preceding.start)).toBe('2024-02-21');
  expect(dateInputValueFromEpochDay(preceding.end)).toBe('2024-02-27');
  expect(dateInputValueFromEpochDay(stretch.start)).toBe('2024-02-28');
});

test('precedingWindow preserves calendar-day count across DST spring and fall boundaries', () => {
  const mar26 = epochDayFromDateInputValue('2026-03-26')!;
  const apr01 = epochDayFromDateInputValue('2026-04-01')!;
  const springStretch = { start: mar26, end: apr01 };
  expect(springStretch.end - springStretch.start + 1).toBe(7);
  const springPreceding = precedingWindow(springStretch);
  expect(springPreceding.end - springPreceding.start + 1).toBe(7);
  expect(dateInputValueFromEpochDay(springPreceding.start)).toBe('2026-03-19');
  expect(dateInputValueFromEpochDay(springPreceding.end)).toBe('2026-03-25');

  const oct22 = epochDayFromDateInputValue('2026-10-22')!;
  const oct28 = epochDayFromDateInputValue('2026-10-28')!;
  const fallStretch = { start: oct22, end: oct28 };
  expect(fallStretch.end - fallStretch.start + 1).toBe(7);
  const fallPreceding = precedingWindow(fallStretch);
  expect(fallPreceding.end - fallPreceding.start + 1).toBe(7);
  expect(dateInputValueFromEpochDay(fallPreceding.start)).toBe('2026-10-15');
  expect(dateInputValueFromEpochDay(fallPreceding.end)).toBe('2026-10-21');
});

test('stretchTooShortToCompare is false once the preceding window reaches into the journal', () => {
  expect(stretchTooShortToCompare({ start: 100, end: 109 }, 90)).toBe(false);
  expect(stretchTooShortToCompare({ start: 100, end: 109 }, 99)).toBe(false);
});

test('stretchTooShortToCompare is true when the preceding window ends before the journal starts', () => {
  expect(stretchTooShortToCompare({ start: 100, end: 109 }, 100)).toBe(true);
  expect(stretchTooShortToCompare({ start: 100, end: 109 }, 500)).toBe(true);
});

test('stretchTooShortToCompare is true with no journal to measure against', () => {
  expect(stretchTooShortToCompare({ start: 100, end: 109 }, null)).toBe(true);
});

test('compareStretchQuery writes both sides as the same date-input strings the pickers use', () => {
  const today = todayEpochDay();
  const stretch = { start: today - 9, end: today };
  const preceding = precedingWindow(stretch);
  const query = compareStretchQuery(stretch, preceding);
  const params = new URL(`https://example.test${query}`).searchParams;
  expect(params.get('aStart')).toBe(dateInputValueFromEpochDay(stretch.start));
  expect(params.get('aEnd')).toBe(dateInputValueFromEpochDay(stretch.end));
  expect(params.get('bStart')).toBe(dateInputValueFromEpochDay(preceding.start));
  expect(params.get('bEnd')).toBe(dateInputValueFromEpochDay(preceding.end));
});

test('compareStretchNoticeProps on a ready, still-open stretch says it counts through today', () => {
  const props = compareStretchNoticeProps({ status: 'ready', href: '/compare?x' }, true, COPY);
  expect(props).toEqual({
    title: 'Compare this stretch',
    text: 'Counts through today',
    action: { label: 'Open compare', href: '/compare?x' }
  });
});

test('compareStretchNoticeProps on a ready, closed stretch has no hint to add', () => {
  const props = compareStretchNoticeProps({ status: 'ready', href: '/compare?x' }, false, COPY);
  expect(props.text).toBeUndefined();
  expect(props.action).toEqual({ label: 'Open compare', href: '/compare?x' });
});

test('compareStretchNoticeProps on a too-short stretch offers no action', () => {
  const props = compareStretchNoticeProps({ status: 'tooShort' }, true, COPY);
  expect(props).toEqual({ title: 'Compare this stretch', text: 'Not enough journal before this', action: undefined });
});

test('compareStretchNoticeProps on a stretch with nothing before it offers no action', () => {
  const props = compareStretchNoticeProps({ status: 'noPrecedingData' }, false, COPY);
  expect(props).toEqual({ title: 'Compare this stretch', text: 'Nothing logged before this', action: undefined });
});
