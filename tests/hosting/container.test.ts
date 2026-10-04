import { createServer } from 'node:net';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { startContainer, templateCheckArgs } from './container.mjs';

describe('hosting container networking', () => {
  it('validates the TLS template without attaching a host network interface', () => {
    const args = templateCheckArgs('image', '/tmp/template', '/tmp/certs');
    expect(args.slice(0, 4)).toEqual(['run', '--rm', '--network', 'none']);
    expect(args).toContain('/tmp/template:/etc/nginx/conf.d/default.conf:ro,z');
    expect(args).toContain('/tmp/certs:/etc/ssl/engender:ro,z');
    expect(args.slice(-3)).toEqual(['image', 'nginx', '-t']);
  });

  it('uses available loopback ports without changing production serving rules', async () => {
    const root = mkdtempSync(join(tmpdir(), 'hosting-container-test-'));
    const occupied = createServer();
    await new Promise<void>((resolve) => occupied.listen(0, '127.0.0.1', resolve));
    const occupiedPort = (occupied.address() as { port: number }).port;
    let args: string[] = [];
    try {
      const hosted = await startContainer('image', '/tmp/current', root, (command: string, passed: string[]) => {
        expect(command).toBe('docker');
        args = passed;
        return 'container-id';
      });
      const port = new URL(hosted.origin).port;
      expect(hosted.containerId).toBe('container-id');
      expect(Number(port)).not.toBe(occupiedPort);
      expect(args.slice(0, 5)).toEqual(['run', '--rm', '-d', '--network', 'host']);
      expect(args).not.toContain('-p');
      expect(args).toContain('/tmp/current:/srv/engender:ro,z');
      const config = readFileSync(join(root, 'hosting.conf'), 'utf8');
      const production = readFileSync('deploy/self-host/container.conf', 'utf8');
      expect(config).toContain(`listen 127.0.0.1:${port};`);
      expect(config.replace(`listen 127.0.0.1:${port};`, 'listen 80;')).toBe(production);
      expect(args).toContain(`${root}/hosting.conf:/etc/nginx/conf.d/default.conf:ro,z`);
    } finally {
      await new Promise<void>((resolve) => occupied.close(() => resolve()));
      rmSync(root, { recursive: true, force: true });
    }
  });
});
