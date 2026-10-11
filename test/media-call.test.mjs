import test from 'node:test';
import assert from 'node:assert/strict';
import { inAppBrowserMessage, mediaErrorInfo, permissionInstructions, queryMediaPermission, requestMediaStream } from '../lib/media-permissions.js';
import { CALL_SETUP_TIMEOUT_MS, ICE_DISCONNECTED_GRACE_MS, ICE_RESTART_TIMEOUT_MS, getSelectedCandidateType, isCallSetupPhase, isFastPollingPhase, selectedCandidateType, setupTimeoutDelay, shouldRestartIce } from '../lib/call-state.js';

test('permission helper detects embedded browsers and gives browser-specific steps', () => {
  assert.match(inAppBrowserMessage('Instagram 300.0 Android'), /Chrome/i);
  assert.match(permissionInstructions('SamsungBrowser Android'), /Samsung Internet/);
  assert.match(permissionInstructions('iPhone Safari'), /Settings/);
  assert.match(permissionInstructions('Android Chrome'), /lock\/site icon/);
});

test('permission queries are optional and failures degrade cleanly', async () => {
  assert.equal(await queryMediaPermission({}, 'audio'), 'unsupported');
  assert.equal(await queryMediaPermission({ permissions: { query: async () => ({ state: 'granted' }) } }, 'video'), 'granted');
  assert.equal(await queryMediaPermission({ permissions: { query: async () => { throw new Error('unsupported'); } } }), 'unsupported');
});

test('media helper enforces secure context and maps device errors', async () => {
  const insecure = await requestMediaStream({ navigatorObject: {}, windowObject: { isSecureContext: false, location: { hostname: 'example.com' } } });
  assert.equal(insecure.ok, false);
  assert.match(insecure.message, /HTTPS/);
  assert.match(mediaErrorInfo({ name: 'NotReadableError' }).message, /busy/);
  assert.match(mediaErrorInfo({ name: 'NotFoundError' }).message, /nahi mila/);
  assert.match(mediaErrorInfo({ name: 'OverconstrainedError' }).message, /supported nahi/);
  assert.match(mediaErrorInfo({ name: 'NotAllowedError' }, 'Android Chrome').instructions, /lock\/site icon/);
});

test('video permission falls back to an audio-only stream', async () => {
  const requests = [];
  const nav = {
    userAgent: 'Android Chrome',
    permissions: { query: async () => ({ state: 'prompt' }) },
    mediaDevices: { getUserMedia: async (constraints) => {
      requests.push(constraints);
      if (constraints.video) throw Object.assign(new Error('camera denied'), { name: 'NotAllowedError' });
      return { getTracks: () => [] };
    } },
  };
  const result = await requestMediaStream({ video: true, navigatorObject: nav, windowObject: { isSecureContext: true } });
  assert.equal(result.ok, true);
  assert.equal(result.downgraded, true);
  assert.equal(requests.length, 2);
  assert.equal(requests[0].audio.autoGainControl, true);
  assert.equal(requests[1].video, false);
});

test('call-state helper defines bounded setup/recovery and extracts candidate type', async () => {
  assert.equal(CALL_SETUP_TIMEOUT_MS, 30000);
  assert.equal(setupTimeoutDelay(1000, 5000), 26000);
  assert.equal(setupTimeoutDelay(1000, 40000), 0);
  assert.equal(ICE_DISCONNECTED_GRACE_MS, 4000);
  assert.equal(ICE_RESTART_TIMEOUT_MS, 6000);
  assert.equal(isCallSetupPhase('calling'), true);
  assert.equal(isCallSetupPhase('connecting'), true);
  assert.equal(isCallSetupPhase('connected'), false);
  assert.equal(isFastPollingPhase('incoming'), true);
  assert.equal(isFastPollingPhase('connected'), true);
  assert.equal(isFastPollingPhase('failed'), false);
  assert.equal(shouldRestartIce('disconnected', false), true);
  assert.equal(shouldRestartIce('disconnected', true), false);
  const stats = [
    { id: 'pair', type: 'candidate-pair', selected: true, localCandidateId: 'local' },
    { id: 'local', type: 'local-candidate', candidateType: 'relay' },
  ];
  assert.equal(selectedCandidateType(stats), 'relay');
  assert.equal(await getSelectedCandidateType({ getStats: async () => new Map(stats.map((item) => [item.id, item])) }), 'relay');
});