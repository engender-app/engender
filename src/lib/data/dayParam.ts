import {
  dateInputValueFromEpochDay,
  epochDayFromDateInputValue,
  FIRST_EPOCH_DAY,
  localDateFromEpochDay
} from './epochDay';

export function parseDayParam(value: string | undefined, today: number): number | null {
  if (value === 'today') return today;
  if (!value) return null;

  let day: number;
  if (/^\d+$/.test(value)) {
    day = Number(value);
  } else if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    day = epochDayFromDateInputValue(value)!;
    if (dateInputValueFromEpochDay(day) !== value) return null;
  } else {
    return null;
  }

  return Number.isSafeInteger(day) && day >= FIRST_EPOCH_DAY && Number.isFinite(localDateFromEpochDay(day).getTime())
    ? day
    : null;
}
