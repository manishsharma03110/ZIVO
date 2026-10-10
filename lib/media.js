import { del, list } from '@vercel/blob';
import { memMedia, listLast, listTrimHead, kvSet } from './store';

export const MEDIA_TTL_MS = 24 * 60 * 60 * 1000;
// Text and call messages are kept for MESSAGE_TTL_DAYS (default 7). Set it to 0 to keep them until the 300-message limit.
const days = Number(process.env.MESSAGE_TTL_DAYS ?? 7);
export const MESSAGE_TTL_MS = Number.isFinite(days) && days > 0 ? days * 24 * 60 * 60 * 1000 : 0;
export const hasBlob = !!process.env.BLOB_READ_WRITE_TOKEN;

export async function deleteMedia(urls) {
  const real = urls.filter(Boolean);
  if (!real.length) return;
  const blobUrls = real.filter((u) => u.startsWith('http'));
  for (const u of real) {
    if (u.startsWith('/api/media?id=')) memMedia.delete(u.split('id=')[1]);
  }
  if (blobUrls.length && hasBlob) {
    try {
      await del(blobUrls);
    } catch (e) {
      console.error('blob delete failed', e);
    }
  }
}

// Remove messages older than the retention period (and their media) from storage.
// Messages are chronological, so the expired ones are always at the start of the list.
export async function purgeOldMessages() {
  if (!MESSAGE_TTL_MS) return 0;
  const cutoff = Date.now() - MESSAGE_TTL_MS;
  const all = await listLast('msgs', 300);
  let n = all.findIndex((m) => m.createdAt >= cutoff);
  if (n === -1) n = all.length;
  if (n > 0) {
    await deleteMedia(all.slice(0, n).map((m) => m.url));
    await listTrimHead('msgs', n);
  }
  return n;
}

export async function purgeExpiredMessageMedia(limit = 5) {
  if (!(await kvSet('expired-media-cleanup-lock', 1, { ex: 6 * 3600, nx: true }))) return 0;
  const now = Date.now();
  const expired = (await listLast('msgs', 300))
    .filter((m) => m.url && m.expiresAt && m.expiresAt < now)
    .slice(0, Math.max(1, Math.min(5, Math.floor(limit) || 5)));
  if (expired.length) await deleteMedia(expired.map((m) => m.url));
  return expired.length;
}

// Delete every file older than 24 hours (cron + fallback)
export async function deleteOldBlobs() {
  let removed = 0;
  if (hasBlob) {
    let cursor;
    do {
      const res = await list({ cursor, limit: 1000 });
      const old = res.blobs.filter((b) => Date.now() - new Date(b.uploadedAt).getTime() > MEDIA_TTL_MS);
      if (old.length) {
        await del(old.map((b) => b.url));
        removed += old.length;
      }
      cursor = res.hasMore ? res.cursor : undefined;
    } while (cursor);
  }
  for (const [id, m] of memMedia) {
    if (Date.now() - m.at > MEDIA_TTL_MS) {
      memMedia.delete(id);
      removed++;
    }
  }
  return removed;
}
