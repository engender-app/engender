import { chromium } from 'playwright-core';

const browser = await chromium.launch({
  executablePath: '/usr/bin/chromium-browser',
  args: ['--no-sandbox']
});
try {
  const page = await browser.newPage();
  const response = await page.goto('https://app.gender-diary.barankiewicz.dev/', {
    waitUntil: 'domcontentloaded'
  });
  const result = await page.evaluate(async () => {
    const peer = new RTCPeerConnection({ iceServers: [] });
    try {
      peer.createDataChannel('probe');
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
        metaCsp: document.querySelector('meta[http-equiv="content-security-policy"]')?.content,
        iceState: peer.iceGatheringState,
        candidates: peer.localDescription.sdp.match(/a=candidate:[^\r\n]+/g) ?? []
      };
    } finally {
      peer.close();
    }
  });
  process.stdout.write(JSON.stringify({
    status: response.status(),
    headerCsp: response.headers()['content-security-policy'],
    ...result
  }, null, 2) + '\n');
} finally {
  await browser.close();
}
