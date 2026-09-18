/* The one video note file store the UI reads, set once at boot -
   voiceFiles.ts's arrangement, mirrored for video notes rather than reused:
   the two read different kinds of file even though both sit on the same
   underlying PhotoFileStore instance boot.svelte.ts constructs once, and a
   reader named for what it reads is what keeps a caller from playing one as
   the other. */

export { readVideoNote, setVideoFiles } from './voiceFiles';
