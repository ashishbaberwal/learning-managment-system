# Target LMS Architecture (Production-Oriented System Design)

## 1. High-Level Architecture

The LMS evolves from a simple CRUD monolith into a **Modular Monolith with Asynchronous Workers and Event-Driven Projections**. The Next.js application remains the single transactional entry point for HTTP traffic and Server Actions, while compute-heavy workloads (FFmpeg HLS transcoding) and decoupled read projections (Analytics and Course Recommendations) run asynchronously via RabbitMQ and Apache Kafka.

```text
                        +-----------------------------------+
                        |         Client Browser            |
                        |  Next.js UI + HLS.js Video Player |
                        +-----------------+-----------------+
                                          |
                                          v
+-----------------------------------------------------------------------------------+
|                        Next.js Modular Monolith (App Server)                      |
|                                                                                   |
|  +------------------+  +-------------------+  +--------------------------------+  |
|  | Auth & Security  |  | Course / Progress |  | Enrollment & Stripe Webhook    |  |
|  | - Better Auth    |  | - Catalogue       |  | - Dynamic Course Stripe Price  |  |
|  | - Arcjet + Redis |  | - Lesson Progress |  | - Idempotent Webhook Processor |  |
|  |   Rate Limiter   |  | - Signed Playback |  | - Transactional Outbox Writer  |  |
|  +------------------+  +-------------------+  +--------------------------------+  |
|           |                      |                             |                  |
|           +----------------------+-----------------------------+                  |
|                                  |                                                |
|                     +------------+------------+                                   |
|                     |                         |                                   |
|                     v                         v                                   |
|          +--------------------+     +-------------------+                         |
|          |   Redis (Cache &   |     |    PostgreSQL     |                         |
|          |   Rate Limiting)   |     |  (Source of Truth |                         |
|          | - Catalogue Cache  |     |   + Outbox Table  |                         |
|          | - Sliding Window   |     |   + VideoJob      |                         |
|          +--------------------+     |   + Analytics/Rec)|                         |
|                                     +---------+---------+                         |
+-----------------------------------------------|-----------------------------------+
                                                |
                         Outbox Relay / Publisher (Transactional Guarantees)
                                  /                           \
                                 v                             v
              +---------------------------------+   +-------------------------------+
              |      RabbitMQ (Job Broker)      |   |     Kafka (Event Stream)      |
              |  - video.transcode.queue        |   |  - lms.domain.events          |
              |  - video.transcode.retry (TTL)  |   |    (Partitioned by aggregate) |
              |  - video.transcode.dlq          |   +-------+---------------+-------+
              +----------------+----------------+           |               |
                               |                            v               v
                               v                    +---------------+ +-------------+
              +---------------------------------+   |   Analytics   | | Recommend.  |
              |   Video Worker (Node/TS/FFmpeg) |   |   Consumer    | |  Consumer   |
              |  - Bounded concurrency          |   | (Idempotent   | | (Rule/Pop.  |
              |  - Streams source from S3       |   |  Aggregates)  | |  Baseline)  |
              |  - Transcodes HLS (360p/720p/   |   +---------------+ +-------------+
              |    1080p) + Thumbnail           |
              |  - Uploads segments/manifests   |
              +----------------+----------------+
                               |
                               v
              +---------------------------------+   +-------------------------------+
              |   S3 / Tigris Object Storage    |   |     Observability Stack       |
              |  - Raw uploads & HLS manifests  |   |  - Prometheus (/api/metrics,  |
              |  - Presigned/authorized access  |   |    Worker, RabbitMQ, Kafka,   |
              +---------------------------------+   |    Redis, Postgres exporters) |
                                                    |  - Grafana Dashboards/Alerts  |
                                                    +-------------------------------+
```

## 2. Core Design Principles

1. **PostgreSQL as the Single Transactional Source of Truth:**
   All core domain mutations (`Course`, `Chapter`, `Lesson`, `Enrollment`, `LessonProgress`, `StripeWebhookEvent`, `VideoProcessingJob`, `OutboxEvent`) occur inside ACID transactions in PostgreSQL.
2. **Transactional Outbox Pattern:**
   Rather than dual-writing to PostgreSQL and RabbitMQ/Kafka inside a request handler (which risks lost messages on crash or phantom messages on DB rollback), domain mutations write an `OutboxEvent` or `VideoProcessingJob` row in the same database transaction. Background relays publish pending records with at-least-once delivery guarantees.
3. **Clear Separation Between Task Queues (RabbitMQ) and Event Streams (Kafka):**
   - **RabbitMQ** handles command-driven background jobs (`video.transcode`) where per-message routing, TTL-based exponential backoff retries, dead-letter queues (DLQ), and low `prefetch` concurrency control for CPU-bound FFmpeg tasks are critical.
   - **Kafka** handles immutable domain events (`course.enrolled`, `lesson.completed`, `course.completed`, `payment.succeeded`, etc.) where multiple independent consumer groups (`analytics-consumer`, `recommendation-consumer`) need ordered log consumption and historical replay.
4. **End-to-End Idempotency:**
   - Stripe webhooks deduplicate by `StripeWebhookEvent.eventId`.
   - Video jobs check `VideoProcessingJob` state and idempotency keys before transcoding.
   - Kafka consumers record `ProcessedEvent` (`eventId` + `consumerGroup`) inside the same transaction as projection updates.
5. **Graceful Degradation:**
   If Redis, RabbitMQ, or Kafka is temporarily unavailable, core student and admin HTTP flows in Next.js continue functioning against PostgreSQL.
