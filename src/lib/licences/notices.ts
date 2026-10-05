/* The shape of the licence notices the build writes into
   `virtual:licence-notices` (scripts/licence-notices.mjs). Texts are stored
   once and referred to by index: two hundred MIT packages share a handful of
   distinct texts once the copyright line is the only difference. */

export type NoticeEntry = { name: string; version: string; licence: string; texts: number[] };
export type NoticeSection = { id: 'app' | 'android' | 'fonts'; entries: NoticeEntry[] };
export type Notices = { texts: string[]; sections: NoticeSection[] };
