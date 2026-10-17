# ADR 0008: Prometheus Metrics and Grafana Dashboards

## Status
Accepted

## Context
`target.md` designates Prometheus + Grafana for observability: scrape the web app, workers, and infrastructure (RabbitMQ, Kafka, Redis, Postgres), then dashboards/alerts. By this point the system has an async pipeline (outbox relay, Kafka consumers, video worker) whose failure modes are invisible from the outside: a stuck outbox, growing consumer lag, or failing jobs would only surface as user-visible staleness. Nothing exported metrics, and there was no time-series history of the cache and rate limiter added in Phases 7–8.

## Decision
1. **`prom-client` with a per-process registry** (`lib/metrics.ts`): every process exposes its own registry over a minimal Node HTTP server (`startMetricsServer`) on a fixed port, tagged with a `service` label from `METRICS_SERVICE` (default `lms-web`). The web app serves `/api/metrics` (Node runtime route); the relay, worker, and both consumers each start a metrics server after their dependencies connect.
2. **Application counters at the decision points:**
   - `lms_cache_operations_total{result}` — hit/miss/error, incremented in `lib/cache.ts`
   - `lms_rate_limit_decisions_total{bucket,decision}` — allowed/denied/error, incremented in `lib/rate-limit.ts`
   - `lms_processed_events_total{group,result}` — applied/duplicate/error, incremented in `consumeOnce`
   - `lms_outbox_events_published_total` — relay publishes
   - `lms_video_jobs_processed_total{result}` — completed/retry/malformed/requeue
3. **State gauges collected at scrape time** via async registry collect callbacks (DB-backed truth, no drift): `lms_outbox_events{status}`, `lms_video_processing_jobs{status}`, `lms_processed_events{group}`.
4. **Kafka consumer lag** (`registerKafkaConsumerLag`): each consumer registers a gauge computed per scrape from `fetchTopicOffsets` (log-end offsets) minus committed offsets from `fetchOffsets`; no committed offset counts as zero, so a fresh group shows the full backlog. Registration failures are logged and non-fatal.
5. **Ports:** web `:3000/api/metrics`, relay `:9464`, worker `:9465`, analytics consumer `:9466`, recommendations consumer `:9467`. `api/metrics` is exempted from the middleware matcher — Arcjet `detectBot` would otherwise 403 the `Prometheus` user agent.
6. **Infrastructure exporters in compose:** `kbudde/rabbitmq-exporter` (management API), `danielqsj/kafka-exporter`, `oliver006/redis_exporter`, `prometheuscommunity/postgres-exporter` (Neon `DATABASE_URL`). Kafka gains an `INTERNAL` listener (`kafka:29092`) for the in-network exporter while host processes keep `localhost:9092`.
7. **Prometheus + Grafana in compose:** Prometheus scrapes all nine targets via `host.docker.internal` for the host-run services; Grafana is provisioned file-based (datasource + `LMS Overview` dashboard, ~13 panels covering pipeline flow, event stream, web app, and infrastructure) with anonymous viewer access on `:3001`.

## Alternatives Considered
- **OpenTelemetry Collector / full tracing:** heavier than needed; metrics + structured logs cover the current failure modes, and OTel can be layered on later without changing instrumentation points.
- **Pushgateway for workers:** rejected; all workers are long-running, so direct scraping is simpler and gives staleness semantics for free.
- **prom-client `register.metrics()` in a shared route without per-service servers:** rejected; workers are separate processes and need their own endpoints.
- **Committing Grafana dashboards by UI export:** rejected; file provisioning keeps dashboards in git and reproducible.

## Consequences
- **Positive:** Verified end-to-end: the web counter moved exactly with traffic (30 recommendation calls → 1 cache miss + 29 hits, 30 allowed + 1 denied); all nine Prometheus targets report `up`; consumer lag gauges read 0 for both groups after replay; the provisioned dashboard is queryable in Grafana with live data (cache ops, lag, Node heap per service, Redis memory).
- **Negative:** Metrics are per-process and reset on restart, and Prometheus targets are host-scoped — fine for one dev machine, but production would use service discovery and persistent storage. The `lms-web` job scrapes the dev server; a stopped dev server marks that target down (expected). Alerting rules are stubbed by Grafana's alerting UI only; no Alertmanager yet.
