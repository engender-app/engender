/* The one message that asks the service worker to keep the PDF renderer's
   worker (phase 14 pre-release ticket 13; shell-assets.ts has why it is out
   of the install).

   Its own module rather than a line in sw-messages.ts on purpose. The page
   side is the lazily loaded document code, and a lazy chunk importing from
   sw-messages made Rollup split that module's constants away from
   shell-assets.ts's, which the OCR code and the update code had been sharing
   as one tiny chunk: one more file on the first-load graph, whose budget has
   one file of slack (check:first-load-budget). Here only the worker and the
   document code import it. */

/** Sent once the first document has built its worker. A message of its own,
    because the OCR ask would pull the scanner's 21 MB along with a 0.4 MB
    worker. */
export const CACHE_PDF_WORKER = 'engender:cache-pdf-worker';
