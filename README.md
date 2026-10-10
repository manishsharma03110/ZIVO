# ZIVO Private Chat (Vercel free tier)

Sign in on the homepage (ZIVO login screen) with the 10-character access code (`CODE_A` / `CODE_B`) typed into the login field, then chat one-to-one (text, photos, video) and make voice/video calls.
Photos, videos and voice messages are deleted after 24 hours. Text and call messages are deleted after 7 days (`MESSAGE_TTL_DAYS`). After 1 minute without activity the user is logged out automatically.

## Deploy (Vercel)
1. Push this folder to GitHub and import it as a project in Vercel.
2. In the Vercel dashboard, go to Storage:
   - Add **Upstash Redis** from the Marketplace (free). The environment variables are connected automatically.
   - Create a **Blob** store (access: **Public**). `BLOB_READ_WRITE_TOKEN` is added automatically.
3. In Settings > Environment Variables, add the values from `.env.example`:
   `CODE_A`, `CODE_B` (two different codes, each exactly 10 characters: letters, numbers or a mix, no spaces), `NAME_A`, `NAME_B`, `SESSION_SECRET` (32+ random characters)
   and `CRON_SECRET` (required: without it the cleanup route is closed). Optional: `MESSAGE_TTL_DAYS`.
4. Redeploy.

## How it works
- WebSockets are not available on the Vercel free tier, so the chat refreshes by polling every 2.5 seconds (every 1 second during a call).
- Photos and videos upload directly from the browser to Blob (max 50 MB). Expired media is removed by a request-limited cleanup after successful login (up to five referenced files per six hours) and by the daily cron job (`vercel.json`), which also removes old text messages and sweeps unreferenced Blob files.
- Calls use WebRTC, browser to browser. The server only passes the offer/answer and a short heartbeat.
- If a call does not connect on strict networks (office or mobile NAT), add a TURN server (`TURN_URL`, `TURN_USERNAME`, `TURN_CREDENTIAL`).
- Idle logout: only sending or receiving messages, typing, voice typing, or a call resets the timer. The server cookie also expires after 2 minutes.
- Login rate limit: 10 wrong codes per IP in 10 minutes. Successful logins are not counted.

## Checking your configuration
`npm run check-env` reads `.env.local` and prints the status of SESSION_SECRET (32+ chars), CODE_A and CODE_B (exactly 10 characters each, different) and, on Vercel, Redis. It never prints the values. In production the login page shows a generic setup message and the exact reasons (names only) are written to the Vercel function logs.

## Tests
`npm test` (config, session, and API route tests; no extra packages needed).

## Local test
`npm install && CODE_A=a1 CODE_B=b2 SESSION_SECRET=long-random-string npm run dev`
(Without Redis/Blob, data is kept in memory. This is for testing only.)

## Search engine indexing
- Only the homepage (login page) can be indexed. Chat content is behind login, and `/api/` is blocked in robots.
- After deploying, set `SITE_URL=https://your-domain.com` in the Vercel environment (used for canonical URL, sitemap.xml and robots).
- Title and description are in `app/layout.js`; the favicon is `app/icon.svg`.

## Chat features
- UI: `app/page.js` + `app/globals.css`.
- Call events (voice/video call, outgoing/incoming, missed, declined, call back) appear in the chat timeline. The caller saves the event, so both people see it.
- Right-click / long-press / double-tap on a message: reactions, Reply, Copy, Delete. Replies are visible to both people; reactions and "Delete for me" exist only in your own browser.
- Incoming video calls can also be answered with "Swipe up to answer".
- Messages can be written in any language. Enter sends (it does not send while an input method is composing a word); Shift+Enter adds a new line.
- Voice typing: **press and hold** the mic in the message box, speak, release. The words appear in the box and can be edited before sending. A quick tap also works (tap to start, tap again to stop).
  With `STT_API_KEY` set (Vercel Environment Variables) the audio goes to `/api/transcribe` (a Vercel route handler; the key never reaches the browser) and Hindi + English can be mixed in one sentence, e.g. "Kal mujhe office jana hai and please remind me at 10 AM". Recordings are limited to 90 seconds and 20 requests per minute.
  Without a key the app falls back to the browser's speech recognition (Chrome, Edge or Safari over HTTPS): one language at a time, switched in the menu (Voice: English / Hindi).
- Edit profile (⋮ menu): photo, name and bio. Stored in Redis (the photo is a small 256 px image), shown to the other person within about 30 seconds.
- Menu (⋮): Edit profile, Voice call, Video call, Share app link, Log out. Long-press / right-click a message for Reply, Copy, Share, Copy image, Delete for me.
  "Share app link" shares only the website address (the system share sheet where available, otherwise it copies the link). There is deliberately no conversation link: the chat is private and has no shareable-link mechanism. Share / Copy image appear only where the browser supports them.
- Voice messages: tap the attach button, choose "Voice message", speak, then tap send (or cancel). Maximum 5 minutes.
  Recordings are WebM on Chrome/Edge/Firefox and M4A on Safari; very old Safari versions cannot play WebM.
- Ticks: one tick means sent; the double tick means the other person has opened the chat and seen the message.
- Day labels (Today, Yesterday, or the date) are shown between messages from different days.

## Screens and assets
- `app/components/SplashScreen.js`: loading screen (shown for about 2 seconds, then fades into login).
- `app/components/LoginScreen.js`: ZIVO login. "Continue with Google" and "Sign Up" are placeholders that show a short "coming soon" note.
- `public/zivo-logo.png`: ZIVO logo (transparent PNG). `public/login-hero.jpg`: login illustration (the headline is real text on top of it).
- The chat header has a direct Log out button (top right) instead of the 3-dot menu.
- Login field: exactly 10 characters, letters/numbers/mix, case-sensitive. The site can be added to a phone's home screen as "ZIVO" (manifest and icons are included).
