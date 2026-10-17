import { prisma } from "../lib/db";
import { toDomainEventEnvelope } from "../lib/events";
import { ensureDomainEventsTopic, getKafkaProducer } from "../lib/kafka";
import { outboxPublished, startMetricsServer } from "../lib/metrics";

const BATCH_SIZE = 50;
const IDLE_INTERVAL_MS = 1000;
const ERROR_BACKOFF_MS = 5000;
const METRICS_PORT = 9464;

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

let shuttingDown = false;

async function main(): Promise<void> {
    const producer = await getKafkaProducer();

    await ensureDomainEventsTopic();

    startMetricsServer(METRICS_PORT);

    console.log("Outbox relay started, publishing to lms.domain.events...");

    while (!shuttingDown) {
        const events = await prisma.outboxEvent.findMany({
            where: { status: "Pending" },
            orderBy: { createdAt: "asc" },
            take: BATCH_SIZE,
        });

        if (events.length === 0) {
            await sleep(IDLE_INTERVAL_MS);
            continue;
        }

        let failed = false;

        for (const event of events) {
            if (shuttingDown) {
                break;
            }

            try {
                await producer.send({
                    topic: event.topic,
                    messages: [
                        {
                            key: event.partitionKey,
                            value: JSON.stringify(toDomainEventEnvelope(event)),
                            headers: { eventType: event.eventType },
                        },
                    ],
                });

                await prisma.outboxEvent.update({
                    where: { id: event.id },
                    data: { status: "Published", publishedAt: new Date() },
                });

                outboxPublished.inc();
            } catch (error) {
                failed = true;
                console.error(
                    `Failed to publish outbox event ${event.id}:`,
                    error
                );
                await prisma.outboxEvent
                    .update({
                        where: { id: event.id },
                        data: {
                            attempts: { increment: 1 },
                            lastError: String(error),
                        },
                    })
                    .catch(() => undefined);
                break;
            }
        }

        if (failed) {
            await sleep(ERROR_BACKOFF_MS);
        }
    }

    await producer.disconnect();
    await prisma.$disconnect();
}

const shutdown = (): void => {
    console.log("Shutting down outbox relay...");
    shuttingDown = true;
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

main().catch(async (error) => {
    console.error("Outbox relay failed to start:", error);
    await prisma.$disconnect();
    process.exit(1);
});
