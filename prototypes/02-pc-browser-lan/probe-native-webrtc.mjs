import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';

const APP_URL = 'https://app.gender-diary.barankiewicz.dev/';
const privateIpv4 = /^(?:10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(?:1[6-9]|2\d|3[01])\.\d+\.\d+)$/;
const webviewEndpoint = process.argv.slice(2).find((argument) => !argument.startsWith('--'))
  ?? 'http://127.0.0.1:9223';
const tamperFingerprint = process.argv.includes('--tamper-fingerprint');
const pcBrowser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? '/usr/bin/chromium-browser',
  args: ['--no-sandbox']
});
let androidBrowser;
let pcPage;
let androidPage;
let offer;
let answer;

async function startPeer(page, role) {
  await page.evaluate((role) => {
    const peer = new RTCPeerConnection({ iceServers: [] });
    const state = { peer, received: [], channel: null, history: [], iceErrors: [] };
    window.__lanProbe = state;
    peer.addEventListener('iceconnectionstatechange', () => state.history.push(peer.iceConnectionState));
    peer.addEventListener('icecandidateerror', (event) => {
      state.iceErrors.push({ code: event.errorCode, text: event.errorText });
    });
    const attach = (channel) => {
      state.channel = channel;
      channel.onmessage = (event) => {
        state.received.push(event.data);
        if (role === 'android' && event.data === 'PC test payload') {
          channel.send('Android reply');
        }
      };
      if (role === 'pc') {
        channel.onopen = () => channel.send('PC test payload');
      }
    };
    if (role === 'pc') attach(peer.createDataChannel('lan-probe'));
    else peer.ondatachannel = (event) => attach(event.channel);
  }, role);
}

async function gather(page, mode, remote) {
  return page.evaluate(async ({ mode, remote }) => {
    const peer = window.__lanProbe.peer;
    if (mode === 'offer') {
      await peer.setLocalDescription(await peer.createOffer());
    } else {
      await peer.setRemoteDescription(remote);
      await peer.setLocalDescription(await peer.createAnswer());
    }
    if (peer.iceGatheringState !== 'complete') {
      await Promise.race([
        new Promise((resolve) => {
          peer.addEventListener('icegatheringstatechange', () => {
            if (peer.iceGatheringState === 'complete') resolve();
          });
        }),
        new Promise((resolve) => setTimeout(resolve, 20000))
      ]);
    }
    return {
      type: peer.localDescription.type,
      sdp: peer.localDescription.sdp,
      iceState: peer.iceGatheringState
    };
  }, { mode, remote });
}

async function route(page) {
  return page.evaluate(async () => {
    const { peer, received, history, iceErrors } = window.__lanProbe;
    const stats = await peer.getStats();
    const transport = [...stats.values()].find((entry) => entry.type === 'transport');
    const pair = stats.get(transport?.selectedCandidatePairId);
    const local = stats.get(pair?.localCandidateId);
    const remote = stats.get(pair?.remoteCandidateId);
    return {
      connection: peer.connectionState,
      ice: peer.iceConnectionState,
      received,
      history,
      iceErrors,
      local: local && { address: local.address, port: local.port, protocol: local.protocol, type: local.candidateType },
      remote: remote && { address: remote.address, port: remote.port, protocol: remote.protocol, type: remote.candidateType }
    };
  });
}

try {
  androidBrowser = await chromium.connectOverCDP(webviewEndpoint);
  androidPage = androidBrowser.contexts().flatMap((context) => context.pages())
    .find((page) => page.url().startsWith('https://localhost/'));
  if (!androidPage) throw new Error('No journal WebView page at https://localhost/');
  pcPage = await pcBrowser.newPage();
  const response = await pcPage.goto(APP_URL, { waitUntil: 'domcontentloaded' });
  assert.equal(response.status(), 200);

  await startPeer(pcPage, 'pc');
  await startPeer(androidPage, 'android');
  offer = await gather(pcPage, 'offer');
  answer = await gather(androidPage, 'answer', offer);
  // Keep only phone's private IPv4 candidates for this route check.
  answer.sdp = answer.sdp.replace(/^a=candidate:[^\r\n]+\r?\n/gm, (line) =>
    privateIpv4.test(line.trim().split(/\s+/)[4]) ? line : ''
  );
  if (tamperFingerprint) {
    answer.sdp = answer.sdp.replace(/(a=fingerprint:sha-256 )([0-9A-F])/, (_, prefix, digit) =>
      prefix + (digit === '0' ? '1' : '0')
    );
  }
  await pcPage.evaluate((description) => window.__lanProbe.peer.setRemoteDescription(description), answer);
  if (tamperFingerprint) {
    await new Promise((resolve) => setTimeout(resolve, 8000));
  } else {
    await pcPage.waitForFunction(() => window.__lanProbe.received.includes('Android reply'), null, { timeout: 30000 });
  }

  const result = {
    pcBrowser: pcBrowser.version(),
    tamperFingerprint,
    pcCsp: response.headers()['content-security-policy'],
    offerFingerprint: offer.sdp.match(/a=fingerprint:[^\r\n]+/)?.[0],
    answerFingerprint: answer.sdp.match(/a=fingerprint:[^\r\n]+/)?.[0],
    pcCandidates: offer.sdp.match(/a=candidate:[^\r\n]+/g) ?? [],
    androidCandidates: answer.sdp.match(/a=candidate:[^\r\n]+/g) ?? [],
    pc: await route(pcPage),
    android: await route(androidPage)
  };
  console.log(JSON.stringify(result, null, 2));
  if (tamperFingerprint) {
    assert.deepEqual(result.pc.received, []);
    assert.deepEqual(result.android.received, []);
  } else {
    assert.deepEqual(result.pc.received, ['Android reply']);
    assert.deepEqual(result.android.received, ['PC test payload']);
    assert.equal(result.pc.remote?.type, 'host');
    assert.match(result.pc.remote?.address ?? '', privateIpv4);
    assert.equal(result.pc.remote?.address, result.android.local?.address);
    assert.equal(result.pc.remote?.port, result.android.local?.port);
    assert.equal(result.pc.remote?.protocol, 'udp');
    assert.equal(result.android.remote?.protocol, 'udp');
    assert.ok(['host', 'prflx'].includes(result.android.remote?.type));
  }
} catch (error) {
  console.error(JSON.stringify({
    error: String(error),
    offerCandidates: offer?.sdp.match(/a=candidate:[^\r\n]+/g) ?? [],
    answerCandidates: answer?.sdp.match(/a=candidate:[^\r\n]+/g) ?? [],
    pc: pcPage && await route(pcPage).catch((failure) => String(failure)),
    android: androidPage && await route(androidPage).catch((failure) => String(failure))
  }, null, 2));
  throw error;
} finally {
  for (const page of [pcPage, androidPage]) {
    if (page && !page.isClosed()) {
      await page.evaluate(() => window.__lanProbe?.peer.close()).catch(() => {});
    }
  }
  await androidBrowser?.close();
  await pcBrowser.close();
}
