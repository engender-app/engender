/* A realistic ten-year Daylio export, generated rather than checked in.

   Sized from how people use the app, not from Engender's own benchmark:
   three logged moments a day for ten years (10,950 entries), most with a
   short note, one in twenty with a long reflection, a tenth carrying an
   HTML-formatted body, and about 30 activities. The backup's attachments
   are not generated (a test would have to hold hundreds of megabytes);
   `TEN_YEAR_ATTACHMENTS` is the count and size the budget is judged
   against instead. Deterministic: a small linear generator, no Math.random. */

import { daylioPayload, makeDaylioBackupFrom } from './daylio-backup';

export const TEN_YEAR_ENTRIES = 3 * 3650;
/** Photos a heavy user attaches over ten years, and what each is on disk. */
export const TEN_YEAR_ATTACHMENTS = { count: 1500, bytesEach: 600 * 1024 };

const WORDS = 'today felt quiet louder softer tired hopeful voice practice therapy walk sister friend work clinic appointment mirror dress morning evening slept badly well long call text rain sun garden cooked read stayed home went out nervous proud'.split(' ');
const ACTIVITIES = Array.from({ length: 30 }, (_, i) => `activity ${i + 1}`);

function sentence(seed: number, words: number): string {
  let state = seed * 2654435761 >>> 0;
  const out: string[] = [];
  for (let i = 0; i < words; i++) {
    state = (state * 1664525 + 1013904223) >>> 0;
    out.push(WORDS[state % WORDS.length]);
  }
  return out.join(' ');
}

function noteFor(i: number): string {
  if (i % 20 === 0) return sentence(i, 450); // a long reflection, about 2.7 KB
  if (i % 10 === 1) return `<p>${sentence(i, 25)}</p><ul><li>${sentence(i + 1, 4)}</li><li>${sentence(i + 2, 4)}</li></ul>`;
  if (i % 4 === 0) return '';
  return sentence(i, 20);
}

/** The rows as Daylio's CSV writes them, headed by its real column set. */
export function tenYearCsv(): string {
  const lines = ['full_date,date,weekday,time,mood,activities,note_title,note'];
  const start = Date.UTC(2016, 0, 1);
  for (let i = 0; i < TEN_YEAR_ENTRIES; i++) {
    const day = new Date(start + Math.floor(i / 3) * 86_400_000).toISOString().slice(0, 10);
    const note = noteFor(i).replace(/"/g, '""');
    const acts = [i % 30, (i * 7 + 3) % 30].map((n) => ACTIVITIES[n]).join(' | ');
    lines.push(`${day},x,x,${8 + (i % 3) * 5}:${String(i % 60).padStart(2, '0')},${['Rad', 'Good', 'Meh', 'Bad', 'Awful'][i % 5]},${acts},,"${note}"`);
  }
  return lines.join('\n');
}

/** The `backup.daylio` JSON text for the same journal. */
export function tenYearBackupJson(): string {
  const payload = daylioPayload();
  const start = Date.UTC(2016, 0, 1);
  payload.tags = ACTIVITIES.map((name, i) => ({ id: 100 + i, name, id_tag_group: 6, icon: 3, order: i, state: 0, createdAt: 1_600_000_000_000 }));
  payload.assets = [];
  payload.milestones = [];
  payload.dayEntries = Array.from({ length: TEN_YEAR_ENTRIES }, (_, i) => {
    const when = new Date(start + Math.floor(i / 3) * 86_400_000);
    const note = noteFor(i);
    return {
      id: i + 1,
      datetime: when.getTime() + (8 + (i % 3) * 5) * 3_600_000,
      year: when.getUTCFullYear(),
      month: when.getUTCMonth(),
      day: when.getUTCDate(),
      hour: 8 + (i % 3) * 5,
      minute: i % 60,
      timeZoneOffset: 3_600_000,
      mood: [1, 7, 9][i % 3],
      tags: [100 + (i % 30), 100 + ((i * 7 + 3) % 30)],
      assets: [],
      scaleValues: [],
      isFavorite: false,
      ...(note ? { note } : {})
    };
  });
  return JSON.stringify(payload);
}

/** The whole backup, as the importer receives it, minus attachments. */
export async function tenYearBackup(): Promise<Uint8Array> {
  const json = tenYearBackupJson();
  const base64 = Buffer.from(json, 'utf8').toString('base64').match(/.{1,76}/g)!.join('\n');
  return makeDaylioBackupFrom(base64);
}
