export const CALL_SETUP_TIMEOUT_MS = 30000;
export const ICE_DISCONNECTED_GRACE_MS = 4000;
export const ICE_RESTART_TIMEOUT_MS = 6000;

export const isCallSetupPhase = (phase) => phase === 'calling' || phase === 'connecting';
export const isFastPollingPhase = (phase) => phase === 'incoming' || phase === 'calling' || phase === 'connecting' || phase === 'connected';
export const setupTimeoutDelay = (startedAt, now = Date.now()) => Math.max(0, CALL_SETUP_TIMEOUT_MS - (now - startedAt));

export const shouldRestartIce = (state, alreadyRestarted) => state === 'disconnected' && !alreadyRestarted;

export function selectedCandidateType(stats) {
  const entries = stats && typeof stats.values === 'function' ? Array.from(stats.values()) : Array.from(stats || []);
  const pair = entries.find((item) => item.type === 'candidate-pair' && (item.selected || (item.nominated && item.state === 'succeeded')));
  if (!pair) return '';
  const local = entries.find((item) => item.id === pair.localCandidateId);
  return local && local.candidateType || '';
}

export async function getSelectedCandidateType(pc) {
  try { return selectedCandidateType(await pc.getStats()); } catch { return ''; }
}