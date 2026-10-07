/* Recordings, videos and photographs share the journal's file store.
   Boot installs and clears it through photoFiles.ts. */
export { readPhoto as readRecording, readPhoto as readVideoNote } from './photoFiles';
