// @ts-nocheck
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';

import { createDeviceEvidenceWriter } from './device-evidence.mjs';

it('keeps evidence for late scenes and identifies every omitted finding', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'device-evidence-'));
  try {
    const scenes = Array.from({ length: 40 }, (_, i) => `scene-${i}`);
    const write = createDeviceEvidenceWriter(dir, scenes, 60);
    const cast = [0, 1, 2].map((i) => ({ data: Buffer.from(`frame-${i}`).toString('base64') }));
    const findings = [];
    for (const scene of scenes) {
      const pair = [{ frame: 1 }, { frame: 1 }];
      await write({ scene, profile: 'persona', theme: 'dark', pass: 1 }, pair, cast);
      findings.push(...pair);
      expect(pair[0].evidence.files).toHaveLength(3);
    }
    expect((await readdir(dir)).filter((name) => name.endsWith('.png'))).toHaveLength(180);
    expect(findings.filter((finding) => finding.evidence.omitted)).toHaveLength(20);
    expect(findings.every((finding) => finding.evidence.files || finding.evidence.omitted)).toBe(true);
    expect(await readFile(join(dir, findings.at(-2).evidence.files[1]), 'utf8')).toBe('frame-1');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

it('saves detector frames when cast includes frames of another size', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'device-evidence-'));
  try {
    const write = createDeviceEvidenceWriter(dir, ['scene'], 1);
    const cast = [0, 1, 2, 3].map((i) => ({ data: Buffer.from(`frame-${i}`).toString('base64') }));
    const finding = { frame: 1 };
    await write({ scene: 'scene', profile: 'persona', theme: 'dark', pass: 1 }, [finding], cast, [0, 2, 3]);
    expect(await readFile(join(dir, finding.evidence.files[1]), 'utf8')).toBe('frame-2');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
