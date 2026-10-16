# ADR 0006: Redis Cache-Aside for Catalogue and Recommendation Reads

## Status
Accepted

## Context
Phase 7 adds Redis to the stack. `target.md` designates Redis for caching (rate limiting follows in Phase 8). The catalogue read paths — `getAllCourses` (public listing and dashboard) and `getIndeividualCourse` (course detail) — hit Postgres on every request even though course metadata changes only through admin mutations. The project design principle requires that core HTTP flows continue against Postgres when Redis is unavailable.

## Decision
1. **Cache-aside with fail-open:** `getOrSet(key, ttlSeconds, loader)` in `lib/cache.ts` reads the cache, falls back to the loader on miss, and writes the result back. Redis read/write failures (including corrupt cached JSON) are logged and swallowed — the loader result is always returned. Loader errors (e.g., `notFound()`) propagate and are never cached.
2. **Client configuration:** a single ioredis client in `lib/redis.ts` (`REDIS_URL`, default `redis://localhost:6379`), stored on `globalThis` in development to survive HMR (same pattern as `lib/db.ts`). `enableOfflineQueue: false` and `maxRetriesPerRequest: 1` make commands fail fast when Redis is down instead of hanging requests; an error listener prevents unhandled error events; the retry strategy reconnects automatically.
3. **Keyed entries:**
   - `cache:courses:published` (TTL 60s) — published course list
   - `cache:course:{slug}` (TTL 60s) — course detail including chapters and lessons
   - `cache:recs:{userId}:{limit}` (TTL 30s) — personalized recommendations
4. **Invalidation on admin mutations:** every course-mutating admin action (course create, metadata edit, chapter/lesson create/update/delete/reorder, course delete) calls `invalidateCatalogueCache()` — deleting the list key and SCAN-deleting the `course:` prefix. Recommendations are TTL-only (bounded staleness of at most 30s): they are per-user and refreshed by the event stream, so explicit invalidation would require per-user fan-out.
5. **Infrastructure:** `redis:7-alpine` with AOF persistence and a healthcheck in `docker-compose.yml`; cached keys survive container restarts.

## Alternatives Considered
- **Next.js `unstable_cache` / route-level caching:** rejected; less explicit invalidation control across admin server actions, and no shared cache with future consumers/workers.
- **In-process memory cache:** rejected; not shared across instances and lacks TTL/invalidation primitives.
- **Invalidating recommendations in the consumer:** deferred; would couple workers to the cache for at most 30s of extra freshness.
- **Caching correctness-sensitive reads (sessions, progress):** rejected; only catalogue and recommendation reads tolerate staleness.

## Consequences
- **Positive:** Verified end-to-end: a warm list read serves in ~0.2s; staleness and invalidation are provable (a direct DB title change stays invisible while cached, and becomes visible immediately after the mutation-path invalidation); with Redis stopped, `/courses` and `/api/recommendations` both still return 200 with errors logged; after restart the client reconnects and repopulates keys. No database schema changes; cache keys are derivable and bounded.
- **Negative:** Up to 60s (catalogue) / 30s (recommendations) staleness for writes that bypass the admin actions (e.g., direct SQL); recommendations intentionally ignore invalidation events; prefix invalidation uses SCAN, acceptable at this key volume.
