import { Rest } from 'ably';
import { CHAT_CHANNEL } from './realtime.js';

const TOKEN_TTL_MS = 10 * 60 * 1000;
const PUBLISH_TIMEOUT_MS = 700;

export async function createChatTokenRequest({ RestClient = Rest } = {}) {
  const key = process.env.ABLY_API_KEY;
  if (!key) return null;
  const client = new RestClient({ key, queryTime: false });
  return client.auth.createTokenRequest({
    ttl: TOKEN_TTL_MS,
    capability: { [CHAT_CHANNEL]: ['subscribe'] },
  });
}

export async function publishMessageSignal({ id, at }, { RestClient = Rest, timeoutMs = PUBLISH_TIMEOUT_MS } = {}) {
  const key = process.env.ABLY_API_KEY;
  if (!key) return false;

  let timeout;
  try {
    const client = new RestClient({ key, httpRequestTimeout: timeoutMs, httpOpenTimeout: timeoutMs });
    await Promise.race([
      client.channels.get(CHAT_CHANNEL).publish('msg', { type: 'msg', id, at }),
      new Promise((_, reject) => {
        timeout = setTimeout(() => reject(new Error('publish timeout')), timeoutMs);
      }),
    ]);
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

export async function scheduleMessageSignal(signal, { afterFn, publishFn = publishMessageSignal }) {
  const publishSafely = async () => {
    try {
      await publishFn(signal);
    } catch {
      // Realtime is best-effort; publishing must not change the message-send result.
    }
  };

  try {
    afterFn(publishSafely);
  } catch {
    await publishSafely();
  }
}
