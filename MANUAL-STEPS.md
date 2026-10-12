# Production setup and verification

## Accounts and services

- Vercel project for the Next.js app.
- Upstash Redis connected through the Vercel Marketplace.
- Vercel Blob store with the existing upload configuration.
- Ably application for metadata-only realtime notifications (optional).
- LiveKit Cloud project for calls (optional; native WebRTC remains the rollback).
- OpenAI speech-to-text access (optional; browser speech recognition remains the fallback).
- Google Search Console property for the production domain.

## Vercel Production environment variables

Configure these names in **Project → Settings → Environment Variables → Production**. Never expose the LiveKit or Ably API keys as `NEXT_PUBLIC_*` variables.

- Existing authentication/storage: `CODE_A`, `CODE_B`, `NAME_A`, `NAME_B`, `SESSION_SECRET`, `CRON_SECRET`, and the Vercel-managed Redis/Blob variables.
- Site metadata: `NEXT_PUBLIC_SITE_URL` set to the canonical HTTPS origin. `SITE_URL` is retained as a compatibility fallback.
- Optional realtime: `ABLY_API_KEY`. Removing this variable disables Ably and leaves adaptive polling available.
- Optional LiveKit calls: `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, `LIVEKIT_URL`. Set `CALL_PROVIDER=native` to force the existing native WebRTC implementation.
- Optional speech transcription: `STT_API_KEY`.
- Optional cleanup configuration: `MESSAGE_TTL_DAYS`; retain the existing cron schedule and `CRON_SECRET`.

Redeploy after changing Production variables. Do not put secrets in browser code or public variables.

## Region selection

Set the Vercel function region to the same region as the Upstash Redis database to reduce call/chat state latency. Use the LiveKit Cloud URL/region supplied by the LiveKit project; do not derive it from user location. Confirm the selected LiveKit region is available for the Vercel deployment before production rollout.

## Search Console

1. Verify the canonical production origin in Google Search Console.
2. Preserve the existing verification metadata in `app/layout.js`.
3. After deployment, inspect `/robots.txt` and `/sitemap.xml` at the canonical origin and submit the sitemap.
4. Confirm the product description and public-page copy before requesting indexing: current metadata and manifest describe grocery delivery, while the application and README describe a private chat.

## Rollback

- Calls: set `CALL_PROVIDER=native` in Vercel Production and redeploy.
- Realtime: remove `ABLY_API_KEY` and redeploy; adaptive polling remains active.
- LiveKit provider outage: remove the three `LIVEKIT_*` variables to disable LiveKit token issuance and retain the native call implementation.
