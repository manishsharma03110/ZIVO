export const CHAT_CHANNEL = 'zivo-chat';
export const REALTIME_POLL_INTERVAL_MS = 20000;
export const HIDDEN_POLL_INTERVAL_MS = 7000;
export const FAST_POLL_INTERVAL_MS = 800;

export function pollingInterval({ attached, hidden, inCall, idleWait }) {
  if (hidden) return HIDDEN_POLL_INTERVAL_MS;
  if (inCall) return FAST_POLL_INTERVAL_MS;
  if (attached) return REALTIME_POLL_INTERVAL_MS;
  return idleWait;
}

export function createChannelStateHandler({ onAttached, onUnavailable }) {
  let state;
  return ({ current }) => {
    if (current === state) return;
    state = current;
    if (current === 'attached') onAttached();
    else onUnavailable();
  };
}

export function isMessageSignal(value) {
  if (!value || typeof value !== 'object') return false;
  const keys = Object.keys(value);
  return keys.length === 3 && keys.every((key) => key === 'type' || key === 'id' || key === 'at')
    && value.type === 'msg' && typeof value.id === 'string' && Number.isFinite(value.at);
}
