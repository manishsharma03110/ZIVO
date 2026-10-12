export const CALL_MAX_DURATION_MS = 60 * 60 * 1000;
export const CALL_SOLO_GRACE_MS = 2 * 60 * 1000;
export const CALL_RING_TIMEOUT_MS = 60 * 1000;

export function liveKitConfigured(env = process.env) {
  return env.CALL_PROVIDER !== 'native'
    && !!env.LIVEKIT_API_KEY
    && !!env.LIVEKIT_API_SECRET
    && !!env.LIVEKIT_URL;
}

export function canJoinCall(call, user, now = Date.now()) {
  if (call?.status === 'ringing' && (!Number.isFinite(call.ts) || now - call.ts >= CALL_RING_TIMEOUT_MS)) return false;
  return !!call && (call.status === 'active' || (call.status === 'ringing' && call.from === user))
    && (call.from === user || call.to === user)
    && typeof call.id === 'string' && /^[A-Za-z0-9-]{8,64}$/.test(call.id);
}

export function liveKitRoomName(callId) {
  if (typeof callId !== 'string' || !/^[A-Za-z0-9-]{8,64}$/.test(callId)) return null;
  return 'zivo-call-' + callId;
}

export function callCostAction({ status, startedAt, now, selfPresent, peerPresent, soloSince }) {
  if (status !== 'active') return { action: 'none', soloSince: null };
  if (now - startedAt >= CALL_MAX_DURATION_MS) return { action: 'end', soloSince: null };
  if (selfPresent && peerPresent) return { action: 'none', soloSince: null };
  const since = soloSince || now;
  return now - since >= CALL_SOLO_GRACE_MS
    ? { action: 'end', soloSince: since }
    : { action: 'wait', soloSince: since };
}

export function cleanupLiveKitRoom(room, tracks = []) {
  if (room) {
    try {
      Promise.resolve(room.disconnect()).catch((error) => console.warn('Unable to disconnect LiveKit room', error));
    } catch (error) {
      console.warn('Unable to disconnect LiveKit room', error);
    }
  }
  for (const track of tracks) {
    try { track.stop(); } catch (error) { console.warn('Unable to stop local call track', error); }
  }
}
