# ADR 0007: Redis Sliding-Window Rate Limiting for API Routes

## Status
Accepted

## Context
`target.md` designates Redis for "Cache & Rate Limiting" with a sliding-window limiter alongside Arcjet. Arcjet runs at the middleware layer (bot detection, shield) and as per-action `fixedWindow` rules on auth-adjacent server actions (e.g., course creation, 5/min). The API route handlers that serve data and video bytes — the HLS stream proxy and the recommendations endpoint — are excluded from middleware and had no rate limiting, so a single authenticated client could hammer recommendation queries or pull unbounded video bandwidth. Fixed windows additionally permit 2x bursts across window edges.

## Decision
1. **Redis sliding-window limiter** in `lib/rate-limit.ts`: `checkRateLimit(identifier, { limit, windowMs })` implements the sliding window with a Redis sorted set (score = timestamp) inside a single Lua script — prune expired entries, count, admit or reject atomically. Denials return the precise `retryAfterMs` until the oldest entry slides out.
2. **Fail-open:** any Redis error (including cold-start races) is logged and the request is allowed, consistent with the ADR 0006 degradation principle. Rate limiting must never take down authenticated flows.
3. **Applied at the handler layer**, after auth and authorization checks but before expensive work:
   - `GET /api/recommendations` — 30 requests/min per user
   - `GET /api/lessons/[lessonId]/stream/[...path]` — 120 requests/min per user (HLS segments are bursty; a 4-second-segment stream consumes roughly 15 req/min, so playback is unaffected while the limit protects bandwidth)
4. **Per-user buckets** (`recommendations:user:{id}`, `stream:user:{id}`) derived from the authenticated session. Rejections return 429 with `Retry-After` and `X-RateLimit-Limit/Remaining`; allowed responses also carry the `X-RateLimit-*` headers.
5. **Two layers, distinct jobs:** Arcjet at the edge for bot/shield/signup protection; Redis sliding window for per-user fairness on data and bandwidth. The limiter shares the Redis instance and degradation contract with the cache but is otherwise independent.

## Alternatives Considered
- **Arcjet `fixedWindow` everywhere:** rejected for API routes — window-edge bursts, a third-party round trip per request, and middleware-excluded routes cannot use it without restructuring.
- **Token bucket:** viable, but sliding window gives exact "requests in the last N seconds" semantics and a precise `Retry-After`.
- **Separate Redis instance for limiter keys:** rejected; same availability contract and no isolation benefit at this scale.
- **Fail-closed:** rejected by the degradation principle; a Redis outage should not lock users out.

## Consequences
- **Positive:** Verified end-to-end: the algorithm admits exactly `limit` requests, denies with correct `retryAfterMs`, and admits again after the window slides; an HTTP burst produced exactly 30x200 then 429s with headers; per-user isolation confirmed (one user's rejection does not affect another); stream requests served with decreasing remaining counts; with Redis stopped, requests still return 200 (fail-open, error logged). Keys contain no PII and expire with the window via `PEXPIRE`.
- **Negative:** Fail-open means a Redis outage temporarily disables limiting — accepted trade-off. All sessions of one user share a bucket (intended). Lua keeps the check to one round trip, but it remains a per-request Redis call; acceptable alongside the cache and cheap relative to the work it guards.
