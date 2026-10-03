import { describe, expect, it } from 'vitest';
import { sourceReturnTo, withSourceReturn } from './sourceRecord';

const at = (path: string) => new URL(`https://engender.test${path}`);

describe('sourceReturnTo', () => {
  it('honours a day the entry was opened from, and "today"', () => {
    expect(sourceReturnTo(at('/entry/new/20000?returnTo=%2Fday%2F20000'))).toBe('/day/20000');
    expect(sourceReturnTo(at('/entry/new/today?returnTo=%2Fday%2Ftoday'))).toBe('/day/today');
  });

  it('refuses a day path that is not one day, and other origins', () => {
    expect(sourceReturnTo(at('/entry/1?returnTo=%2Fday%2F1%2Fextra'))).toBeNull();
    expect(sourceReturnTo(at('/entry/1?returnTo=%2Fday%2Fabc'))).toBeNull();
    expect(sourceReturnTo(at('/entry/1?returnTo=%2F%2Fevil.test%2Fday%2F1'))).toBeNull();
  });

  it('round-trips through withSourceReturn', () => {
    const href = withSourceReturn('/entry/new/20000', at('/day/20000'));
    expect(sourceReturnTo(at(href))).toBe('/day/20000');
  });
});
