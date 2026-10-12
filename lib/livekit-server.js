import { AccessToken } from 'livekit-server-sdk';
import { liveKitConfigured, liveKitRoomName } from './livekit.js';

export async function createLiveKitCredentials(callId, identity, { Token = AccessToken, env = process.env } = {}) {
  if (!liveKitConfigured(env)) return null;
  const room = liveKitRoomName(callId);
  if (!room || (identity !== 'A' && identity !== 'B')) return null;
  const token = new Token(env.LIVEKIT_API_KEY, env.LIVEKIT_API_SECRET, { identity, ttl: '10m' });
  token.addGrant({ roomJoin: true, room, canPublish: true, canSubscribe: true });
  return { token: await token.toJwt(), url: env.LIVEKIT_URL };
}
