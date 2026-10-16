# ADR 0005: Event-Driven Recommendations from Co-Occurrence

## Status
Accepted

## Context
Phase 6 adds personalized course recommendations. The event stream (ADR 0003) already carries `course.enrolled` events, and the projections pattern (ADR 0004) provides the dedupe/rebuild guarantees. Recommendations should derive from the stream as an independent read model rather than adding load to transactional queries or coupling to the analytics consumer.

## Decision
1. **Co-occurrence projection:** The `recommendations-consumer` group maintains `UserCourse` (which users are in which courses) and `CourseCoOccurrence` (directed pair counts) from `course.enrolled` events. On each enrollment the consumer records the user-course edge and increments pair counts in both directions against every other course the same user is in. Both tables are FK-free and fully rebuildable from the topic.
2. **Same consumption contract:** Dedupe via `ProcessedEvent` (`unique(eventId, consumerGroup)`) through the shared `consumeOnce` helper (ADR 0004); non-`course.enrolled` events are marked processed without projection writes.
3. **Read path with fallback tiers:** `getRecommendedCourses(userId)` ranks related courses by summed co-occurrence counts, excluding courses the user is enrolled in (source of truth: `Enrollment`). Shortfalls are filled from `CourseStats` popularity (analytics projection), then newest published courses. Served by `GET /api/recommendations` (401 anonymous) and a "Recommended for you" dashboard section with reason labels.
4. **Independent consumers:** Analytics and recommendations run as separate groups with separate offsets, so either can lag, fail, or be rebuilt without affecting the other.
5. **Rebuild procedure:** As ADR 0004 — wipe projections and the group's `ProcessedEvent` rows, delete the group, replay. Verified end-to-end (19-event replay rebuilt identical state; a second group-delete replay produced 19 duplicates and zero drift).

## Alternatives Considered
- **Read-time SQL aggregation over `Enrollment` joins:** rejected; couples the read path to transactional schema and cannot express stream-derived weights.
- **One consumer for analytics and recommendations:** rejected; a bug or rebuild in one would block the other, and their write patterns differ.
- **Weighted collaborative filtering (recency decay, embeddings):** deferred; count-based co-occurrence is the correct first step and the projection schema can evolve without pipeline changes.
- **Precomputed per-user recommendation rows:** rejected; write amplification (users x courses) for no benefit — read-time ranking over small tables is cheap at this scale.

## Consequences
- **Positive:** Recommendations update within seconds of an enrollment; same idempotency and replay guarantees as analytics; the pattern generalizes to future consumers (e.g., trending, notifications).
- **Negative:** Users with no stream history get fallback tiers rather than personalization until they enroll; co-occurrence is unweighted (no recency or popularity decay) — a future enhancement; pair rows grow quadratically in the worst case, acceptable at this scale.
