// Pure helpers for message identity. No React, no I/O, so they can be unit tested.
// A message's sender is ONLY ever message.from ('A' | 'B'), assigned by the server from the signed session cookie.

export const isUser = (u) => u === 'A' || u === 'B';
export const otherUser = (u) => (u === 'A' ? 'B' : 'A');

// Keeps the server's order (insertion order is authoritative; timestamps can tie), drops anything without a
// valid id or sender, and removes duplicate ids so a message can never be rendered twice.
export function normalizeMessages(list) {
  if (!Array.isArray(list)) return [];
  const seen = new Set();
  const out = [];
  for (const m of list) {
    if (!m || typeof m !== 'object' || typeof m.id !== 'string' || !isUser(m.from) || seen.has(m.id)) continue;
    seen.add(m.id);
    out.push(m);
  }
  return out;
}

export function setOptimisticStatus(list, cid, status) {
  return normalizeMessages(list.map((m) => m && m.cid === cid && m.id === 'pending:' + cid
    ? { ...m, status, pending: status === 'sending' }
    : m));
}

export function optimisticRetryLabel(message) {
  return message && message.id === 'pending:' + message.cid && message.status === 'failed' ? 'Retry' : null;
}

// Who wrote the message that a reply quotes ('A' | 'B' | null).
// New messages carry reply.from. Older messages only have reply.who, which was saved from the replier's point of view:
// 'You' meant the replier themself; anything else meant the other person. Both cases are exact, so no data migration is needed.
export function quotedAuthor(m) {
  const r = m && m.reply;
  if (!r || !isUser(m.from)) return null;
  if (isUser(r.from)) return r.from;
  return r.who === 'You' ? m.from : otherUser(m.from);
}
