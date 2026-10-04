/* Keep the former 1600ms capture length after appearance. The final 200ms
   must be still and fully opaque; a gap longer than 250ms cannot establish
   continuous observation across the app's 240ms arrival motion. */
export const NOTICE_APPEAR_MS = 10000;
export const NOTICE_OBSERVE_MS = 1600;
export const NOTICE_SETTLE_MS = 200;
export const NOTICE_MAX_GAP_MS = 250;
export const NOTICE_KEY = '.kit-notice[data-protocol]';

/* Ticket 262: even smooth travel fails. The clock starts with the first
   visible frame; startup latency is bounded separately. */
/** @param {{ at: number, vt: boolean, boxes: Record<string, number>, ops: Record<string, number> }[]} samples */
export function measurementNoticeTravel(samples) {
  const key = samples.flatMap((frame) => Object.keys(frame.boxes)).find((name) => name.includes(NOTICE_KEY));
  if (!key) return ['measuring notice never appeared'];
  const first = samples.findIndex((frame) => (frame.ops[key] ?? 0) >= 0.1 && frame.boxes[key] != null);
  if (first === -1) return ['measuring notice never appeared'];
  const visible = samples.slice(first);
  if (visible[0].at > NOTICE_APPEAR_MS) return [`measuring notice did not appear within ${NOTICE_APPEAR_MS}ms`];
  if (visible.some((frame) => (frame.ops[key] ?? 0) < 0.1 || frame.boxes[key] == null))
    return ['measuring notice observation incomplete: notice became hidden'];
  if (visible[visible.length - 1].at - visible[0].at < NOTICE_OBSERVE_MS)
    return [`measuring notice observation incomplete: less than ${NOTICE_OBSERVE_MS}ms after appearance`];
  if (visible.some((frame, i) => i > 0 && frame.at - visible[i - 1].at > NOTICE_MAX_GAP_MS))
    return [`measuring notice observation incomplete: frame gap exceeds ${NOTICE_MAX_GAP_MS}ms`];
  const tops = visible.map((frame) => frame.boxes[key]);
  const travel = Math.max(...tops) - Math.min(...tops);
  const findings = travel > 3 ? [`measuring notice traveled ${Math.round(travel)}px after appearing`] : [];
  const tailStart = visible.findLastIndex((frame) => frame.at <= visible[visible.length - 1].at - NOTICE_SETTLE_MS);
  const tail = visible.slice(tailStart);
  const tailTops = tail.map((frame) => frame.boxes[key]);
  if (tail.some((frame) => frame.vt || (frame.ops[key] ?? 0) < 0.99 || frame.boxes[key] == null) ||
      Math.max(...tailTops) - Math.min(...tailTops) > 0.1)
    findings.push(`measuring notice did not settle for ${NOTICE_SETTLE_MS}ms`);
  return findings;
}
