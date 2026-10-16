# ADR 0004: Analytics Projections and Idempotent Event Consumption

## Status
Accepted

## Context
Phase 4 established an at-least-once event stream (`lms.domain.events`) whose consumers are required to deduplicate by `eventId`. Phase 5 needs per-course, per-lesson, and per-day statistics (enrollments, completions, revenue) that will later back dashboards and the recommendations phase. Computing these on read from raw tables would couple reporting queries to transactional schema details and get slower as data grows.

## Decision
1. **Projections as a CQRS-style read model:** `CourseStats`, `LessonStats`, and `DailyStats` are FK-free tables keyed by `courseId`, `lessonId`, and UTC date respectively. They are written *only* by the analytics consumer and can be fully rebuilt from the topic, so they are derived data, not source of truth.
2. **Idempotent consumer:** `worker/analytics-consumer.ts` (`pnpm analytics`) runs a kafkajs consumer in group `analytics-consumer`, subscribed `fromBeginning`. Each event is applied inside one PostgreSQL transaction that also inserts a `ProcessedEvent` row (`unique(eventId, consumerGroup)`). A duplicate delivery hits the unique constraint (`P2002`, caught outside the transaction to avoid operating on an aborted transaction) or the pre-check and is skipped; projections are never double-counted.
3. **Event mapping:** `payment.succeeded` increments `CourseStats.revenueCents` and `DailyStats.revenueCents`; `course.enrolled` increments `CourseStats.enrollments` and `DailyStats.enrollments`; `lesson.completed` increments `LessonStats.completions`; `course.completed` increments `CourseStats.completions` and `DailyStats.completions`. Daily buckets are keyed by the `occurredAt` UTC date. Unknown event types are logged and marked processed so future event types do not stall the group.
4. **Rebuild procedure:** Stop the consumer, truncate the projections and the group's `ProcessedEvent` rows, delete the consumer group (or reset its offsets to earliest), and restart. The replay reconstructs identical state — verified end-to-end.
5. **Delivery contract:** Unchanged from ADR 0003: at-least-once with consumer-side dedupe; offsets are committed by kafkajs after each message handler resolves, and a crash between the projection transaction and the offset commit results in redelivery, which the dedupe table absorbs.

## Alternatives Considered
- **Compute aggregates on read (SQL GROUP BY):** rejected; couples reporting to transactional tables and degrades with volume.
- **Database triggers maintaining counters:** rejected; hides logic inside the database, runs in the writer's transaction (coupling and contention), and is far harder to rebuild.
- **Exactly-once semantics (Kafka transactions / transactional consumer):** rejected as in ADR 0003; dedupe table achieves the same observable result with less operational complexity.
- **Applying projections without dedupe (trusting offset commits):** rejected; crashes between processing and offset commit make double counting inevitable.

## Consequences
- **Positive:** Dashboards read small precomputed tables; replayability makes schema or logic changes in the consumer safe to roll out; the dedupe pattern generalizes to the recommendations consumer.
- **Negative:** Analytics are eventually consistent (lag = relay poll interval + consumer processing, seconds); replaying with a *new* consumer group without wiping projections would double count — rebuilds must wipe first; `ProcessedEvent` and `DailyStats` grow unbounded — retention/pruning is deferred, as with the outbox.
