import { test, expect } from 'vitest';
import { compareStretchNoticeProps, compareStretchQuery, precedingWindow, stretchTooShortToCompare } from './compareStretch';
import { dateInputValueFromEpochDay, todayEpochDay } from './epochDay';

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
