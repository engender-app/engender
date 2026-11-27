/* Use opaque relative UUID names with a .webm extension in the shared
   photo store. The orphan sweep checks table references for ownership. A
   video note has one file. Do not store a derived poster (ADR-0010). */

export const videoFileName = (uuid: string): string => `${uuid}.webm`;
