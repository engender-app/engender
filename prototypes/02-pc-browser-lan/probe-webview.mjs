import { chromium } from 'playwright-core';

const endpoint = process.argv[2] ?? 'http://127.0.0.1:9223';
const browser = await chromium.connectOverCDP(endpoint);
try {
  const page = browser.contexts().flatMap((context) => context.pages())
    .find((page) => page.url().startsWith('https://localhost/'));
  if (!page) throw new Error('No journal WebView page at https://localhost/');

  const result = await page.evaluate(async () => {
    const peer = new RTCPeerConnection({ iceServers: [] });
    try {
      peer.createDataChannel('lan-permission-probe');
      await peer.setLocalDescription(await peer.createOffer());
      if (peer.iceGatheringState !== 'complete') {
        await Promise.race([
          new Promise((resolve) => {
            peer.addEventListener('icegatheringstatechange', () => {
              if (peer.iceGatheringState === 'complete') resolve();
            });
          }),
          new Promise((resolve) => setTimeout(resolve, 10000))
        ]);
      }
      return {
        secure: isSecureContext,
        userAgent: navigator.userAgent,
        iceState: peer.iceGatheringState,
        candidates: peer.localDescription.sdp.match(/a=candidate:[^\r\n]+/g) ?? []
      };
    } finally {
      peer.close();
    }
  });
  console.log(JSON.stringify(result, null, 2));
} finally {
  await browser.close();
}
