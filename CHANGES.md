# Implementation notes

## Phase 3 — LiveKit calling

- **Changed:** Added server-only LiveKit token issuance with a 10-minute, call-room-only grant; access requires a valid session and an eligible participant. The callee is denied before answering, and expired ringing calls cannot issue tokens.
- **Changed:** Kept call ring/answer/end state in Redis, added metadata-only Ably call notifications, preserved the native provider rollback, enforced the 60-minute/2-minute solo cost limits, and added client reconnect, track cleanup, device controls and development-only stats handling.
- **Files:** `.env.example`, `app/api/call/token/route.js`, `app/api/call/route.js`, `app/api/me/route.js`, `app/page.js`, `lib/livekit.js`, `lib/livekit-server.js`, `lib/realtime.js`, `lib/realtime-server.js`, `lib/strings.js`, `test/livekit.test.mjs`.
- **Tests added:** Token-route authorization/disabled-provider/secret privacy, mocked token grant scope, callee 403 while ringing, caller/callee token access after answer, outsider 403, duration/solo rules, expired ring rejection and room/track cleanup. They make no external service calls.
- **Manual steps:** Configure LiveKit Cloud and add `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, and `LIVEKIT_URL` as server-only Vercel Production variables. Verify both users can call; set `CALL_PROVIDER=native` to roll back.
- **Validation status:** Not run in this environment. Run `npm test` and `npm run build`.

## Phase 4 — Voice-to-text audit

- **Audit:** Existing implementation already creates a recognition instance per browser start, resets sessions, avoids duplicate cumulative results, uses single-utterance mode with restart on mobile, exposes the `en-IN`/`hi-IN` toggle, gates calls, and obtains permission through the Phase 1 helper.
- **Changed:** Browser `no-speech` and unexpected `aborted` errors now show clear English messages and close/reset the session; intentional aborts during stop remain quiet.
- **Files:** `lib/voice.js`, `lib/strings.js`, `test/voice.test.mjs`.
- **Tests added:** New no-speech/aborted feedback and immediate-restart regression coverage.
- **Manual steps:** Test browser speech recognition on Android and desktop; test denied permission and unsupported-browser behavior.
- **Validation status:** Not run in this environment. Run `npm test`.

## Phase 5 — SEO and indexing

- **Audit:** `app/layout.js` already had metadata base, canonical URL, Open Graph, English document language, theme color, and the Google verification token. Robots allowed `/` and blocked `/api/`; the sitemap exposed only the root URL. The API response headers did not yet include `X-Robots-Tag`.
- **Changed:** `NEXT_PUBLIC_SITE_URL` now takes precedence for metadata, robots and sitemap URLs; Twitter card metadata was added; robots also disallows the prospective `/chat/` and `/private/` prefixes; authenticated sessions receive `noindex` metadata, and API responses receive `X-Robots-Tag: noindex, nofollow`. The Google verification token was retained. The existing splash tagline is now an H1 with the same text and CSS class, so it remains visually unchanged while appearing in the server-rendered markup.
- **Files:** `lib/seo.js`, `app/layout.js`, `app/robots.js`, `app/sitemap.js`, `app/components/SplashScreen.js`, `next.config.mjs`, `test/seo.test.mjs`.
- **Tests added:** Canonical/social metadata and verification presence, robots policy and sitemap origin/content, API noindex header, and source checks for the splash H1, English document language, and theme color.
- **Manual steps / decision needed:** The project has no separate public marketing route: `/` serves the login/chat application. Valid signed-in sessions get `noindex`, while the logged-out login page remains indexable. Existing title, description, and web manifest describe grocery delivery, while the README describes private chat. These claims were deliberately not rewritten pending confirmation of the real public product and copy. Confirm the product description before completing the public-page copy/SEO review.
- **Validation status:** Partial for the blockers above; not run in this environment. Run `npm test` and `npm run build`.

## Phase 6 — Additive polish

- **Visible changes (before → after):**
  - Offline/online events were silent → they now use the existing toast presentation and palette.
  - Blob upload showed only “Uploading…” → the same inline status can show percentage progress; failed uploads use an in-app toast instead of a browser alert. The local fallback upload path remains indeterminate.
  - Scrolling up had no quick return control → a 44px scroll-to-latest button appears only while away from the bottom.
  - Unsupported voice typing hid the microphone without explanation → an inline English status note is shown.
  - A route rendering error had no local recovery screen → an error boundary presents a short message and retry action.
  - Composer wrapping and scrollbar behavior were implicit → long words wrap and the scrollbar is thin and themed; Enter/Shift+Enter behavior is unchanged.
- **Files:** `app/page.js`, `app/error.js`, `app/globals.css`, `lib/strings.js`.
- **Tests added:** No UI/browser test harness is configured; voice error behavior is covered in `test/voice.test.mjs`.
- **Manual steps:** Check the 320px viewport, upload progress/failure, offline/online toast, scroll-to-latest, error retry, and reduced-motion preference.
- **Validation status:** Not run in this environment. Run `npm test` and `npm run build`.

## Phase 7 — Final review and operations

- **Security review:** The review identified that the ringing callee could obtain a LiveKit room token before accepting. Token authorization now permits only the caller during ringing and permits either participant after the call becomes active; expired ringing calls are also rejected. No other finding was returned by that review. The finding and its fix are recorded in `SECURITY-REVIEW.md`; API keys remain server-side and are not returned to clients.
- **Documentation:** README now explains LiveKit media routing and its lack of default end-to-end encryption, Ably's metadata-only signal, provider rollback, and the production site URL variable.
- **Files:** `README.md`, `MANUAL-STEPS.md`, `SECURITY-REVIEW.md`, plus the implementation and test files listed above.
- **Tests:** See Phases 3–6. No test or build command could be run in this environment.
- **Manual steps:** Follow `MANUAL-STEPS.md`; run `npm test`, `npm run build`, and `git status`.
