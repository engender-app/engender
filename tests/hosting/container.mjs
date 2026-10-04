import { readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { join } from 'node:path';

/** @param {string} image @param {string} template @param {string} certs */
export function templateCheckArgs(image, template, certs) {
  return [
    'run', '--rm', '--network', 'none',
    '-v', `${template}:/etc/nginx/conf.d/default.conf:ro,z`,
    '-v', `${certs}:/etc/ssl/engender:ro,z`,
    image, 'nginx', '-t'
  ];
}

/**
 * @param {string} image
 * @param {string} current
 * @param {string} tempRoot
 * @param {(command: string, args: string[]) => string} run
 */
export async function startContainer(image, current, tempRoot, run) {
  const reservation = createServer();
  await new Promise((resolve, reject) => {
    reservation.once('error', reject);
    reservation.listen(0, '127.0.0.1', () => resolve(undefined));
  });
  const port = /** @type {import('node:net').AddressInfo} */ (reservation.address()).port;
  await new Promise((resolve) => reservation.close(resolve));

  /* Docker bridge changes cancel Chromium's queued module requests. Host
     networking adds no interface; nginx still binds only to loopback. */
  const config = join(tempRoot, 'hosting.conf');
  const production = readFileSync('deploy/self-host/container.conf', 'utf8');
  writeFileSync(config, production.replace('listen 80;', `listen 127.0.0.1:${port};`));
  const containerId = run('docker', [
    'run', '--rm', '-d', '--network', 'host',
    '-v', `${current}:/srv/engender:ro,z`,
    '-v', `${config}:/etc/nginx/conf.d/default.conf:ro,z`,
    image
  ]);
  return { containerId, origin: `http://127.0.0.1:${port}` };
}
