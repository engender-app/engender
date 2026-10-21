/* Release-time warning for shipped reference content past its review limit
   (functional audit ticket 40). The list and the limits live in
   src/lib/reviewedContent.ts; this prints what is due.

   It warns and exits 0. A stale date asks for the source to be read again
   before the next release, and blocking a release over it would push
   people towards bumping the date without reading anything.

   Usage:
     node scripts/check-reviewed-content.mjs [--today YYYY-MM-DD] */
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runnerImport } from 'vite';
import { writeSummary } from './check-process.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));

/** The owners import each other without extensions and through `$lib`, the
    way the app does, so plain Node cannot load them. Vite's module runner
    resolves them the way the build does, without the SvelteKit plugin. */
async function loadGuard() {
  const { module } = await runnerImport(resolve(root, 'src/lib/reviewedContent.ts'), {
    configFile: false,
    root,
    logLevel: 'silent',
    resolve: { alias: { $lib: resolve(root, 'src/lib') } }
  });
  return /** @type {typeof import('../src/lib/reviewedContent.ts')} */ (module);
}

/** @param {{ area: string, item: string, kind: string, reviewedOn: string, dueOn: string | null }} entry @param {Record<string, number>} limits */
export function warningLine(entry, limits) {
  const due = entry.dueOn === null ? `"${entry.reviewedOn}" is not an ISO day` : `due ${entry.dueOn}`;
  return `${entry.area}, ${entry.item}: reviewed ${entry.reviewedOn}, ${due} (${entry.kind}, ${limits[entry.kind]} months). Read the source again, then update the date.`;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const today = args.includes('--today') ? args[args.indexOf('--today') + 1] : new Date().toISOString().slice(0, 10);
  const real = /^\d{4}-\d{2}-\d{2}$/.test(today ?? '') && new Date(`${today}T00:00:00Z`).toJSON()?.slice(0, 10) === today;
  if (!real) {
    console.error('Usage: node scripts/check-reviewed-content.mjs [--today YYYY-MM-DD]');
    process.exit(1);
  }
  const { REVIEWED_CONTENT, REVIEW_LIMIT_MONTHS, staleContent } = await loadGuard();
  const stale = staleContent(REVIEWED_CONTENT, today);
  for (const entry of stale) {
    const line = warningLine(entry, REVIEW_LIMIT_MONTHS);
    console.log(process.env.GITHUB_ACTIONS ? `::warning title=Reviewed content past its limit::${line}` : `warning: ${line}`);
  }
  console.log(`${stale.length} of ${REVIEWED_CONTENT.length} reviewed-content entries past their limit on ${today}.`);
  writeSummary([
    `### Reviewed content on ${today}`,
    '',
    stale.length ? stale.map((entry) => `- ${warningLine(entry, REVIEW_LIMIT_MONTHS)}`).join('\n') : `All ${REVIEWED_CONTENT.length} entries are within their limits.`
  ]);
}
