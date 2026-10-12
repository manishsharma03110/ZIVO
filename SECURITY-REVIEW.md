# Security review

Review scope: repository security posture for secret handling, LiveKit/Ably token scope, authentication and session revocation, response headers, CORS, and browser storage.

| Severity | Finding | Files involved | Status |
|---|---|---|---|
| HIGH | Before the fix, the callee could obtain a LiveKit room token while the call was still ringing, allowing it to join before answering. | `lib/livekit.js`, `app/api/call/token/route.js`, `test/livekit.test.mjs` | Fixed. Ringing-state access is limited to the caller; after the call becomes active, only its two participants are eligible. Expired ringing calls are rejected. Tests cover callee 403 before answer, participant tokens after answer, caller identity scoped to the Redis call, and outsider 403. |

No additional HIGH or MEDIUM findings were returned by the review. No LOW findings were returned.

The LiveKit API key and secret remain server-only. The token response contains only the token and public LiveKit URL, and the grant is restricted to the server-derived room. API responses include `X-Robots-Tag: noindex, nofollow`; existing origin policy does not add permissive CORS headers.
