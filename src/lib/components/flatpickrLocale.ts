/* The one flatpickr locale the app mounts.

   flatpickr's Polish locale ships its months and weekdays capitalised -
   "Styczeń", "Niedziela" - and the app's own date formatting (dates.ts,
   plain Intl) writes them lowercase, per docs/ui-copy.md's rule that month
   and weekday names are lowercase. A picker whose popup said "Styczeń"
   under a screen saying "styczeń" would be two voices in one control, so
   the locale is copied and lower-cased once here and every picker mounts
   this one. */
import { Polish as capitalised } from 'flatpickr/dist/l10n/pl';
import type { CustomLocale } from 'flatpickr/dist/types/locale';
import { getLocale } from '$lib/paraglide/runtime';

const lowercased: CustomLocale = {
  ...capitalised,
  months: {
    longhand: capitalised.months.longhand.map((m) => m.toLowerCase()) as typeof capitalised.months.longhand,
    shorthand: capitalised.months.shorthand.map((m) => m.toLowerCase()) as typeof capitalised.months.shorthand
  },
  weekdays: {
    longhand: capitalised.weekdays.longhand.map((d) => d.toLowerCase()) as typeof capitalised.weekdays.longhand,
    shorthand: capitalised.weekdays.shorthand.map((d) => d.toLowerCase()) as typeof capitalised.weekdays.shorthand
  }
};

/** The locale for the current install: Polish, lower-cased, or undefined
    so flatpickr falls back to its English default. */
export function pickerLocale(): CustomLocale | undefined {
  return getLocale() === 'pl' ? lowercased : undefined;
}
