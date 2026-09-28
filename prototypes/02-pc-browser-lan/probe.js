const role = new URL(location.href).searchParams.get('role');
const other = role === 'pc' ? 'android' : 'pc';
const result = document.querySelector('#result');
const peer = new RTCPeerConnection({ iceServers: [] });

function report(message, extra = {}) {
  result.textContent += `\n${message}`;
  fetch('/event', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ role, message, ...extra })
  }).catch(() => {});
}

report('Browser context', { secure: isSecureContext, userAgent: navigator.userAgent });
peer.addEventListener('icecandidateerror', (event) => {
  report('ICE candidate error', { code: event.errorCode, text: event.errorText });
});
peer.addEventListener('iceconnectionstatechange', () => {
  report(`ICE state: ${peer.iceConnectionState}`);
});

async function signal(description) {
  await fetch(`/signal?role=${role}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(description)
  });
}

async function waitForOther() {
  for (let attempt = 0; attempt < 120; attempt++) {
    const description = await fetch(`/signal?role=${role}`).then((response) => response.json());
    if (description) return description;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`No ${other} signal`);
}

async function gather() {
  if (peer.iceGatheringState !== 'complete') {
    await new Promise((resolve) => {
      peer.addEventListener('icegatheringstatechange', () => {
        if (peer.iceGatheringState === 'complete') resolve();
      });
    });
  }
  report('Local fingerprint', {
    fingerprint: peer.localDescription.sdp.match(/a=fingerprint:[^\r\n]+/)?.[0],
    candidates: peer.localDescription.sdp.match(/a=candidate:[^\r\n]+/g) ?? []
  });
  await signal(peer.localDescription);
}

async function route() {
  const stats = await peer.getStats();
  const selected = [...stats.values()].find((entry) => entry.type === 'transport')?.selectedCandidatePairId;
  const pair = stats.get(selected);
  report('Selected route', {
    local: stats.get(pair?.localCandidateId),
    remote: stats.get(pair?.remoteCandidateId)
  });
}

function channelReady(channel) {
  channel.onopen = () => {
    report('Data channel open');
    route();
    if (role === 'pc') channel.send('PC test payload');
  };
  channel.onmessage = (event) => {
    report(`Received: ${event.data}`);
    if (role === 'android') channel.send('Android reply');
  };
  channel.onclose = () => report('Data channel closed');
}

peer.ondatachannel = (event) => channelReady(event.channel);

try {
  if (role === 'pc') {
    channelReady(peer.createDataChannel('probe'));
    await peer.setLocalDescription(await peer.createOffer());
    await gather();
    const answer = await waitForOther();
    report('Remote fingerprint', { fingerprint: answer.sdp.match(/a=fingerprint:[^\r\n]+/)?.[0] });
    await peer.setRemoteDescription(answer);
  } else if (role === 'android') {
    const offer = await waitForOther();
    report('Remote fingerprint', { fingerprint: offer.sdp.match(/a=fingerprint:[^\r\n]+/)?.[0] });
    await peer.setRemoteDescription(offer);
    await peer.setLocalDescription(await peer.createAnswer());
    await gather();
  } else {
    throw new Error('Specify ?role=pc or ?role=android');
  }
} catch (error) {
  report(`Failed: ${error.message}`);
}
