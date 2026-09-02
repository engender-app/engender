/* What a stored recording is, for the player that has to declare it
   (phase 7 ticket 09).

   Every recording this app makes itself is `audio/webm;codecs=opus`
   (stores/voiceRecording.ts), so until now the player could name that and
   be right. An imported one is whatever the app it came from recorded:
   Daylio's Android build writes m4a, and its backups also carry ogg, amr
   and 3gp files. Handing those to an `<audio>` element as `audio/webm`
   asks the browser to decode a container the type says it is not, which
   it may refuse outright.

   Read from the stored name rather than from the bytes, because the name
   is where the answer already is: the import chose that extension by
   sniffing the file's own container (archive/daylioBackup.ts), and this
   app's own recordings are `.webm` by construction
   (voiceRecordings/names.ts). */

/* Exactly the extensions a recording in this app can be stored under: the
   `.webm` it records itself, the five containers the import sniffs out of
   an asset's own bytes, and `.3gp` and `.aac`, which reach it through a
   Daylio asset's file name when the bytes name no container
   (archive/daylioBackup.ts). Nothing speculative - an extension this app
   cannot produce would be a case that never runs. */
const BY_EXTENSION = new Map([
  ['.webm', 'audio/webm'],
  ['.m4a', 'audio/mp4'],
  ['.3gp', 'audio/3gpp'],
  ['.aac', 'audio/aac'],
  ['.mp3', 'audio/mpeg'],
  ['.ogg', 'audio/ogg'],
  ['.wav', 'audio/wav'],
  ['.amr', 'audio/amr']
]);

/** The MIME type to hand a player for this file name, or the empty string
    when the name says nothing recognisable. Empty is deliberate rather
    than a guess: a Blob with no type leaves the browser to sniff the
    bytes, which is a better answer than a type that is wrong. */
export function audioMimeOf(fileName: string): string {
  const match = /\.[a-z0-9]{2,5}$/i.exec(fileName);
  return (match && BY_EXTENSION.get(match[0].toLowerCase())) || '';
}
