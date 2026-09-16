/* Real media for the scripts that drive playback (ticket 46).

   The demo journal's recordings are four thousand random bytes
   (data/demoAudioBytes.ts): enough to prove a recording is attached to an
   entry, and not audio any browser will decode. That was fine while
   playback was a native `<audio controls>` nobody screenshotted. It is not
   fine for a transport whose whole subject is a waveform and a playhead,
   which draw nothing without a file that actually plays.

   So the scripts import real files through the app's own file picker,
   generated here rather than committed: espeak-ng for a voice (the stand-in
   this repo already uses for a recorded read) and ffmpeg for the containers
   the app stores. Both are on the machine this runs on; neither is a
   dependency of the app.

   The files are cached under .claude/media-fixtures/ and regenerated only
   when missing, since a run of the gallery needs them twice - once for the
   current tree and once for the tree it is being compared against. */
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

/** What the voice fixture says. Ordinary and undramatic on purpose: it is
    read aloud in a screenshot somebody will look at closely. */
const PASSAGE =
  'This is what my voice sounds like today. I read the same short passage every month, and I keep them all.';

const run = (cmd, args) => execFileSync(cmd, args, { stdio: ['ignore', 'ignore', 'pipe'] });

/**
 * Generates (or reuses) the media the playback scripts import, and returns
 * absolute paths.
 *
 * @param {string} [dir] where to cache them
 */
export async function mediaFixtures(dir = resolve(here, '../.claude/media-fixtures')) {
  await mkdir(dir, { recursive: true });

  const voiceWav = `${dir}/voice.wav`;
  const voice = `${dir}/voice.webm`;
  const landscape = `${dir}/note-landscape.webm`;
  const portrait = `${dir}/note-portrait.webm`;

  if (!existsSync(voice)) {
    // -s 150 is espeak-ng's default pace; the passage lands at about nine
    // seconds, which is a real memo's length rather than a beep.
    run('espeak-ng', ['-v', 'en', '-s', '150', '-w', voiceWav, PASSAGE]);
    /* Opus in WebM: the container the app's own MediaRecorder produces, so
       the import path, the stored bytes and the decode are all the ones a
       recording made in the app would take. */
    run('ffmpeg', ['-y', '-i', voiceWav, '-c:a', 'libopus', '-b:a', '32k', voice]);
  }

  /* A video note is somebody's face, which nothing here can generate, so
     the fixture is an honest placeholder: a slow gradient that moves, so
     consecutive frames differ and a playhead has something to be measured
     against, with a tone under it. Eight seconds, well inside the 30 the
     app accepts, and small enough to be stored without the re-encode path
     (which is a recording concern and out of this ticket's scope). */
  const makeNote = (path, size) => {
    if (existsSync(path)) return;
    run('ffmpeg', [
      '-y',
      '-f', 'lavfi', '-i', `gradients=size=${size}:rate=25:duration=8:speed=0.08`,
      '-f', 'lavfi', '-i', 'sine=frequency=330:duration=8',
      '-c:v', 'libvpx-vp9', '-b:v', '300k', '-pix_fmt', 'yuv420p',
      '-c:a', 'libopus', '-b:a', '24k',
      '-t', '8',
      path
    ]);
  };
  makeNote(landscape, '480x270');
  makeNote(portrait, '270x480');

  return { voice, landscape, portrait };
}
