import { Redis } from '@upstash/redis';

const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
export const hasRedis = !!(url && token);
const redis = hasRedis ? new Redis({ url, token }) : null;

// In-memory fallback: ONLY for local development/tests. On Vercel every request can hit a different
// serverless instance, so memory would silently split the chat in two. In production it is refused.
export class StoreUnavailable extends Error {
  constructor() { super('Redis is not configured'); this.name = 'StoreUnavailable'; }
}
export const prodLike = () => !!(process.env.VERCEL || process.env.NODE_ENV === 'production') && process.env.ALLOW_MEMORY_STORE !== '1';
function guard() { if (!redis && prodLike()) throw new StoreUnavailable(); }

const mem = (globalThis.__chatMem ||= { kv: new Map(), lists: new Map(), media: new Map() });
export const memMedia = mem.media;

function alive(e) {
  return e && (!e.exp || e.exp > Date.now());
}

export async function kvGet(key) {
  guard();
  if (redis) return (await redis.get(key)) ?? null;
  const e = mem.kv.get(key);
  return alive(e) ? e.v : null;
}

// One round trip for several keys (cheaper than several GETs)
export async function kvMget(keys) {
  guard();
  if (redis) return (await redis.mget(...keys)).map((v) => v ?? null);
  return keys.map((k) => { const e = mem.kv.get(k); return alive(e) ? e.v : null; });
}

export async function kvSet(key, val, { ex, nx } = {}) {
  guard();
  if (redis) {
    const opts = {};
    if (ex) opts.ex = ex;
    if (nx) opts.nx = true;
    return redis.set(key, val, opts);
  }
  if (nx && alive(mem.kv.get(key))) return null;
  mem.kv.set(key, { v: val, exp: ex ? Date.now() + ex * 1000 : 0 });
  return 'OK';
}

// Atomic increment. The TTL is set when the counter is (re)created.
export async function kvIncr(key, ex) {
  guard();
  if (redis) {
    const n = await redis.incr(key);
    if (ex && n <= 1) await redis.expire(key, ex);
    return n;
  }
  const e = mem.kv.get(key);
  const n = (alive(e) ? e.v : 0) + 1;
  mem.kv.set(key, { v: n, exp: alive(e) ? e.exp : ex ? Date.now() + ex * 1000 : 0 });
  return n;
}

export async function kvDecr(key) {
  guard();
  if (redis) return redis.decr(key);
  const e = mem.kv.get(key);
  if (!alive(e)) return 0;
  e.v -= 1;
  return e.v;
}

export async function kvDel(key) {
  guard();
  if (redis) return redis.del(key);
  mem.kv.delete(key);
  return 1;
}

// Append a message and remember its id as the newest one, in a single atomic transaction
export async function listPush(key, val, max = 300, lastKey) {
  guard();
  if (redis) {
    const t = redis.multi().rpush(key, val).ltrim(key, -max, -1);
    if (lastKey) t.set(lastKey, val.id);
    await t.exec();
    return;
  }
  const l = mem.lists.get(key) || [];
  l.push(val);
  mem.lists.set(key, l.slice(-max));
  if (lastKey) mem.kv.set(lastKey, { v: val.id, exp: 0 });
}

// Messages are stored oldest-first, so expired ones are always a prefix: drop the first n
export async function listTrimHead(key, n) {
  guard();
  if (n <= 0) return;
  if (redis) { await redis.ltrim(key, n, -1); return; }
  const l = mem.lists.get(key) || [];
  mem.lists.set(key, l.slice(n));
}

export async function listLast(key, n) {
  guard();
  if (redis) return (await redis.lrange(key, -n, -1)) || [];
  return (mem.lists.get(key) || []).slice(-n);
}
