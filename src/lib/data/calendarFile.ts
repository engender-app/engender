/* One .ics for one dated thing - an appointment, a surgery date, or a
   letter's unlock day (phase 10 redesign ticket 03, ADR-0067; ticket 18 puts
   this on screen through the share path deliver.ts already has). Pure and
   clock-free like every module at this seam: `nowEpochMs` arrives as an
   argument rather than a read of the clock, so the same input always
   produces the same text and a test can assert on it exactly.

   One event, never a series or a recurrence rule: a repeating slot is
   wallpaper on somebody else's calendar, which is ADR-0067's own reasoning
   for refusing a daily dose slot a mark, and why this ticket's scope
   excludes doses for the same reason.

   Floating local time throughout - no TZID, no UTC `Z` on DTSTART/DTEND -
   the same choice a device-bound date already makes everywhere else in this
   app: a date read off `epochDay` means the calendar day it names, wherever
   the file is opened, not an instant translated across a time zone.
   DTSTAMP is the one exception RFC 5545 makes: it records when the file was
   built rather than when the thing happens, and that property alone must be
   UTC. */

import { localDateFromEpochDay, timestampAtLocalTime } from './epochDay';

export type CalendarEventKind = 'appointment' | 'surgery' | 'letterUnlock';

/** One dated thing and the title it carries. Only an appointment may carry
    a time of day: this app never stores one (CONTEXT.md's own "Appointment"
    is a day, nothing more), so a caller can only have one to give at all
    where ticket 18's share sheet lets the person type it in. A surgery date
    and a letter's unlock day are always all-day. */
export type CalendarEventInput =
  | { kind: 'surgery' | 'letterUnlock'; epochDay: number; title: string; nowEpochMs: number }
  | { kind: 'appointment'; epochDay: number; time?: string; title: string; nowEpochMs: number };

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function icsDate(epochDay: number): string {
  const d = localDateFromEpochDay(epochDay);
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
}

function icsLocalDateTime(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

function icsUtcStamp(epochMs: number): string {
  const d = new Date(epochMs);
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
}

/** RFC 5545 §3.3.11 TEXT escaping - backslash first, so escaping a
    semicolon or comma never doubles an already-escaped backslash. Line
    folding is left undone on purpose: nothing here writes a title long
    enough to near the 75-octet limit, and every calendar app this file
    targets already tolerates an unfolded line. */
function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\r|\n/g, '\\n');
}

/** Stable rather than random, so the builder stays pure: a kind, the day
    and the instant it was built are already enough to make two calls
    collide only if they somehow ran at the same millisecond over the same
    day and kind, which never matters here since every file this produces
    is shared once and never updated in place. */
function uid(kind: CalendarEventKind, epochDay: number, nowEpochMs: number): string {
  return `${kind}-${epochDay}-${nowEpochMs}@dev.engender.app`;
}

/** One `.ics` text, CRLF-terminated throughout as RFC 5545 requires. */
export function buildCalendarEvent(input: CalendarEventInput): string {
  const { kind, epochDay, title, nowEpochMs } = input;
  const time = kind === 'appointment' ? input.time : undefined;

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//enGender//Calendar handoff//EN',
    'BEGIN:VEVENT',
    `UID:${uid(kind, epochDay, nowEpochMs)}`,
    `DTSTAMP:${icsUtcStamp(nowEpochMs)}`
  ];

  if (time === undefined) {
    lines.push(`DTSTART;VALUE=DATE:${icsDate(epochDay)}`);
  } else {
    lines.push(`DTSTART:${icsLocalDateTime(timestampAtLocalTime(epochDay, time))}`, 'DURATION:PT1H');
  }

  lines.push(`SUMMARY:${escapeIcsText(title)}`, 'END:VEVENT', 'END:VCALENDAR');

  return lines.join('\r\n') + '\r\n';
}
