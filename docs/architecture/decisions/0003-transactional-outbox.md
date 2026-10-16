# ADR 0003: Transactional Outbox and Kafka Domain Events

## Status
Accepted

## Context
Phase 4 introduces domain events (`payment.succeeded`, `course.enrolled`, `lesson.completed`, `course.completed`) that feed the future analytics projections (Phase 5) and course recommendations (Phase 6). Publishing directly to Kafka inside request handlers would be a dual write: a crash between the database commit and the publish loses events, while a publish before commit emits phantom events on rollback.

## Decision
1. **Transactional outbox:** An `OutboxEvent` row is written in the *same* PostgreSQL transaction as the domain mutation. Payment activation writes `payment.succeeded` + `course.enrolled` in the Stripe webhook transaction (which also records the webhook idempotency row). Lesson progress writes `lesson.completed` (first completion only) and `course.completed` (when the in-transaction count of completed lessons equals the course's lesson count).
2. **Single topic, user-keyed partitions:** All events publish to `lms.domain.events` (3 partitions) with the Kafka message key set to the `userId`. Every event in this domain is user-scoped, so keying by user preserves per-user ordering while spreading different users across partitions. The envelope is `{ eventId, eventType, occurredAt, aggregateType, aggregateId, version, payload }`, where `eventId` is the outbox row id and doubles as the consumer dedupe key.
3. **Poll-based relay:** A standalone process (`worker/outbox-relay.ts`, `pnpm relay`) polls pending rows in `createdAt` order, publishes with an idempotent producer, then marks them `Published`. Failures increment `attempts`, record `lastError`, stop the current batch (to preserve per-key ordering), and back off before retrying.
4. **Delivery contract:** At-least-once. A crash between publish and mark produces a duplicate; consumers are required to deduplicate by `eventId` and apply projections idempotently (Phase 5/6).
5. **Broker:** Single-node KRaft Apache Kafka (`apache/kafka:3.9.1`) in `docker-compose.yml`; `kafkajs` client; `KAFKA_BROKER` environment variable.

## Alternatives Considered
- **Direct publish in the request handler:** rejected (lost/phantom events, as above).
- **Kafka transactions / exactly-once semantics:** rejected as overkill at this scale; at-least-once plus idempotent consumers gives the same correctness with far less operational complexity.
- **Debezium CDC on the outbox table:** rejected; adds a Connect cluster for no benefit over the poll-based relay here.

## Consequences
- **Positive:** No dual writes; events survive crashes and rollbacks; per-user ordering; replayable topic (consumers can reset offsets to rebuild projections); relay is stateless and horizontally scalable (duplicates are acceptable by contract).
- **Negative:** Publishing latency is bounded by the poll interval (~1s idle); `OutboxEvent` rows accumulate — a retention/pruning job is deferred; relay pauses all publishing during a broker outage (bounded by kafkajs retries + backoff), which is acceptable for these events.
