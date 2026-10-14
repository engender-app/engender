/* Serve disposable releases through the actual production nginx snippets.
   Mount the owned directory at its own path so absolute release symlinks work. */
import { createServer } from 'node:net';
import { chmodSync, cpSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

export async function startPdfServer(temporary, current, baseline) {
  const reservation = createServer();
  await new Promise(resolveListen => reservation.listen(0, '127.0.0.1', resolveListen));
  const port = reservation.address().port;
  await new Promise(resolveClose => reservation.close(resolveClose));
  chmodSync(temporary, 0o755);
  const snippets = join(temporary, 'snippets');
  mkdirSync(snippets);
  cpSync('deploy/nginx/journal-headers.conf', join(snippets, 'engender-journal-headers.conf'));
  writeFileSync(join(snippets, 'site.conf'), baseline
    ? execFileSync('git', ['show', `${baseline}:deploy/nginx/journal-site.conf`])
    : readFileSync('deploy/nginx/journal-site.conf'));
  writeFileSync(join(temporary, 'server.conf'), `server {
    listen 127.0.0.1:${port};
    root ${current};
    access_log ${temporary}/requests.log;
    include snippets/site.conf;
  }\n`);
  const runtime = process.env.CONTAINER_RUNTIME ?? 'podman';
  const container = execFileSync(runtime, ['run', '--rm', '-d', '--network', 'host',
    '-v', `${temporary}:${temporary}:z`, '-v', `${temporary}/server.conf:/etc/nginx/conf.d/default.conf:ro,z`,
    '-v', `${snippets}:/etc/nginx/snippets:ro,z`, process.env.NGINX_IMAGE ?? 'docker.io/library/nginx:1.28-alpine'], { encoding: 'utf8' }).trim();
  const origin = `http://127.0.0.1:${port}`;
  try {
    const deadline = Date.now() + 10000;
    while (Date.now() < deadline) {
      try { if ((await fetch(origin + '/release.json')).ok) return {
        origin, port, container,
        requests: path => readFileSync(join(temporary, 'requests.log'), 'utf8').split('\n').filter(line => line.includes(`GET ${path} HTTP`)),
        close: () => execFileSync(runtime, ['rm', '-f', container], { stdio: 'ignore' })
      }; } catch {}
      await new Promise(resolveWait => setTimeout(resolveWait, 50));
    }
    throw new Error('Disposable PDF nginx server did not become ready');
  } catch (error) {
    execFileSync(runtime, ['rm', '-f', container], { stdio: 'ignore' });
    throw error;
  }
}
