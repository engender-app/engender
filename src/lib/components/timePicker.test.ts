import { describe, expect, it } from 'vitest';
import { drumIndex, drumStep, formatTime, parseTime } from './timePicker';

describe('parseTime', () => {
  it('reads a 24-hour HH:MM', () => {
    expect(parseTime('09:05')).toEqual({ hour: 9, minute: 5 });
    expect(parseTime('23:59')).toEqual({ hour: 23, minute: 59 });
    expect(parseTime(' 00:00 ')).toEqual({ hour: 0, minute: 0 });
  });

  it('takes a one-digit hour and a dot, the way a time is often written by hand', () => {
    expect(parseTime('9:30')).toEqual({ hour: 9, minute: 30 });
    expect(parseTime('9.30')).toEqual({ hour: 9, minute: 30 });
  });

  it('takes the digits alone, which is all a phone keypad may offer', () => {
    expect(parseTime('0745')).toEqual({ hour: 7, minute: 45 });
    expect(parseTime('745')).toEqual({ hour: 7, minute: 45 });
    expect(parseTime('2359')).toEqual({ hour: 23, minute: 59 });
  });

  it('refuses what is not a time of day', () => {
    for (const text of ['', '24:00', '12:60', '12:5', '12', '12345', '2460', 'noon', '12:30 pm', '-1:30']) {
      expect(parseTime(text), text).toBeNull();
    }
  });
});

describe('formatTime', () => {
  it('is the value an input type=time holds', () => {
    expect(formatTime(9, 5)).toBe('09:05');
    expect(formatTime(23, 0)).toBe('23:00');
  });
});

describe('drumIndex', () => {
  it('is the row nearest the band', () => {
    expect(drumIndex(0, 48, 24)).toBe(0);
    expect(drumIndex(23, 48, 24)).toBe(0);
    expect(drumIndex(25, 48, 24)).toBe(1);
    expect(drumIndex(48 * 7, 48, 24)).toBe(7);
  });

  it('stays on the drum through an overscroll at either end', () => {
    expect(drumIndex(-30, 48, 24)).toBe(0);
    expect(drumIndex(48 * 30, 48, 24)).toBe(23);
  });
});

describe('drumStep', () => {
  it('steps the spinbutton way: up is the next value', () => {
    expect(drumStep('ArrowUp', 5, 60)).toBe(6);
    expect(drumStep('ArrowDown', 5, 60)).toBe(4);
  });

  it('pages by ten and goes to either end', () => {
    expect(drumStep('PageUp', 5, 60)).toBe(15);
    expect(drumStep('PageDown', 15, 60)).toBe(5);
    expect(drumStep('Home', 30, 60)).toBe(0);
    expect(drumStep('End', 3, 24)).toBe(23);
  });

  it('holds at the ends rather than wrapping past what the drum shows', () => {
    expect(drumStep('ArrowUp', 23, 24)).toBe(23);
    expect(drumStep('ArrowDown', 0, 24)).toBe(0);
    expect(drumStep('PageUp', 55, 60)).toBe(59);
    expect(drumStep('PageDown', 4, 60)).toBe(0);
  });

  it('is null for a key that is not a step', () => {
    expect(drumStep('Enter', 3, 24)).toBeNull();
    expect(drumStep('ArrowLeft', 3, 24)).toBeNull();
  });
});
