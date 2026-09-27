// @ts-nocheck
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';

/** Spread reserved slots across scenes before repeat findings use remaining slots. */
export function createDeviceEvidenceWriter(outDir, sceneNames, cap) {
  const reserved = new Set(sceneNames.filter((_, i) =>
    Math.floor((i + 1) * cap / sceneNames.length) > Math.floor(i * cap / sceneNames.length)
  ));
  const savedScenes = new Set();
  let extras = 0;

  return async ({ scene, profile, theme, pass }, findings, cast, castIndices = cast.map((_, i) => i)) => {
    for (const [findingIndex, finding] of findings.entries()) {
      const firstForScene = reserved.has(scene) && !savedScenes.has(scene);
      if (!firstForScene && (!savedScenes.has(scene) || extras >= cap - reserved.size)) {
        finding.evidence = { omitted: reserved.has(scene)
          ? 'evidence slots reserved for other scenes'
          : `scene has no slot within ${cap}-triple evidence limit` };
        continue;
      }

      const i = finding.frame;
      const end = finding.toFrame !== undefined ? finding.toFrame + 1 : i + 1;
      const frames = [i - 1, i, end].map((index) => cast[castIndices[index]]);
      if (frames.some((frame) => !frame)) {
        finding.evidence = { omitted: 'evidence frame unavailable' };
        continue;
      }

      const stem = `${scene}-${profile}-${theme}-p${pass}-${String(i).padStart(3, '0')}-f${findingIndex}`;
      const files = ['a', 'b', 'c'].map((suffix) => `${stem}${suffix}.png`);
      for (let index = 0; index < 3; index++)
        await writeFile(join(outDir, files[index]), Buffer.from(frames[index].data, 'base64'));
      finding.evidence = { files };
      if (firstForScene) savedScenes.add(scene);
      else extras++;
    }
  };
}
