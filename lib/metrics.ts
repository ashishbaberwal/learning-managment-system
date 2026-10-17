import { createServer } from "node:http";
import { Counter, Gauge, Registry, collectDefaultMetrics } from "prom-client";
import { prisma } from "@/lib/db";
import { DOMAIN_EVENTS_TOPIC } from "@/lib/events";

const SERVICE = process.env.METRICS_SERVICE ?? "lms-web";

export const registry = new Registry();

registry.setDefaultLabels({ service: SERVICE });
collectDefaultMetrics({ register: registry });

export const cacheOperations = new Counter({
    name: "lms_cache_operations_total",
    help: "Cache operations by result",
    labelNames: ["result"] as const,
    registers: [registry],
});

export const rateLimitDecisions = new Counter({
    name: "lms_rate_limit_decisions_total",
    help: "Rate limit decisions by bucket and decision",
    labelNames: ["bucket", "decision"] as const,
    registers: [registry],
});

export const outboxPublished = new Counter({
    name: "lms_outbox_events_published_total",
    help: "Outbox events published to Kafka",
    registers: [registry],
});

export const videoJobsProcessed = new Counter({
    name: "lms_video_jobs_processed_total",
    help: "Video processing jobs handled by the worker",
    labelNames: ["result"] as const,
    registers: [registry],
});

export const processedEvents = new Counter({
    name: "lms_processed_events_total",
    help: "Domain events consumed, by consumer group and result",
    labelNames: ["group", "result"] as const,
    registers: [registry],
});

new Gauge({
    name: "lms_outbox_events",
    help: "Outbox events by status",
    labelNames: ["status"] as const,
    registers: [registry],
    async collect() {
        this.reset();

        try {
            const rows = await prisma.outboxEvent.groupBy({
                by: ["status"],
                _count: { _all: true },
            });

            for (const row of rows) {
                this.set({ status: row.status }, row._count._all);
            }
        } catch (error) {
            console.error("Outbox gauge collection failed:", error);
        }
    },
});

new Gauge({
    name: "lms_video_processing_jobs",
    help: "Video processing jobs by status",
    labelNames: ["status"] as const,
    registers: [registry],
    async collect() {
        this.reset();

        try {
            const rows = await prisma.videoProcessingJob.groupBy({
                by: ["status"],
                _count: { _all: true },
            });

            for (const row of rows) {
                this.set({ status: row.status }, row._count._all);
            }
        } catch (error) {
            console.error("Video job gauge collection failed:", error);
        }
    },
});

new Gauge({
    name: "lms_processed_events",
    help: "Processed events stored, by consumer group",
    labelNames: ["group"] as const,
    registers: [registry],
    async collect() {
        this.reset();

        try {
            const rows = await prisma.processedEvent.groupBy({
                by: ["consumerGroup"],
                _count: { _all: true },
            });

            for (const row of rows) {
                this.set({ group: row.consumerGroup }, row._count._all);
            }
        } catch (error) {
            console.error("Processed events gauge collection failed:", error);
        }
    },
});

export async function registerKafkaConsumerLag(groupId: string): Promise<void> {
    const { Kafka } = await import("kafkajs");
    const brokerList = process.env.KAFKA_BROKER;

    if (!brokerList) {
        throw new Error("KAFKA_BROKER is not set");
    }

    const kafka = new Kafka({
        clientId: `lms-metrics-${groupId}`,
        brokers: brokerList.split(","),
    });

    const admin = kafka.admin();

    await admin.connect();

    new Gauge({
        name: "lms_kafka_consumer_lag",
        help: "Kafka consumer lag per partition",
        labelNames: ["group", "partition"] as const,
        registers: [registry],
        async collect() {
            this.reset();

            try {
                const [latest, committed] = await Promise.all([
                    admin.fetchTopicOffsets(DOMAIN_EVENTS_TOPIC),
                    admin.fetchOffsets({
                        groupId,
                        topics: [DOMAIN_EVENTS_TOPIC],
                    }),
                ]);

                const committedByPartition = new Map<number, number>();

                for (const topic of committed) {
                    for (const partition of topic.partitions) {
                        committedByPartition.set(
                            partition.partition,
                            Number(partition.offset)
                        );
                    }
                }

                for (const partition of latest) {
                    const latestOffset = Number(
                        partition.high ?? partition.offset
                    );
                    const committedOffset =
                        committedByPartition.get(partition.partition) ?? -1;
                    const baseline = committedOffset < 0 ? 0 : committedOffset;

                    this.set(
                        {
                            group: groupId,
                            partition: String(partition.partition),
                        },
                        Math.max(0, latestOffset - baseline)
                    );
                }
            } catch (error) {
                console.error("Kafka lag gauge collection failed:", error);
            }
        },
    });
}

export function startMetricsServer(port: number): void {
    createServer(async (request, response) => {
        if (request.url !== "/metrics") {
            response.writeHead(404);
            response.end();
            return;
        }

        try {
            response.writeHead(200, {
                "Content-Type": registry.contentType,
            });
            response.end(await registry.metrics());
        } catch (error) {
            console.error("Metrics exposition failed:", error);
            response.writeHead(500);
            response.end();
        }
    }).listen(port, () => {
        console.log(`Metrics server listening on :${port} (service ${SERVICE})`);
    });
}
