import { Kafka } from "kafkajs";
import { prisma } from "@/lib/db";
import { Prisma } from "@/lib/generated/prisma";
import { DOMAIN_EVENTS_TOPIC, type DomainEventEnvelope } from "@/lib/events";
import { processedEvents } from "@/lib/metrics";

export async function consumeOnce(
    consumerGroup: string,
    envelope: DomainEventEnvelope,
    apply: (tx: Prisma.TransactionClient) => Promise<void>
): Promise<"applied" | "duplicate"> {
    const existing = await prisma.processedEvent.findUnique({
        where: {
            eventId_consumerGroup: {
                eventId: envelope.eventId,
                consumerGroup,
            },
        },
        select: {
            id: true,
        },
    });

    if (existing) {
        processedEvents.inc({ group: consumerGroup, result: "duplicate" });
        return "duplicate";
    }

    try {
        await prisma.$transaction(async (tx) => {
            await tx.processedEvent.create({
                data: {
                    eventId: envelope.eventId,
                    consumerGroup,
                },
            });

            await apply(tx);
        });

        processedEvents.inc({ group: consumerGroup, result: "applied" });
        return "applied";
    } catch (error) {
        if (
            error instanceof Prisma.PrismaClientKnownRequestError &&
            error.code === "P2002"
        ) {
            processedEvents.inc({ group: consumerGroup, result: "duplicate" });
            return "duplicate";
        }

        processedEvents.inc({ group: consumerGroup, result: "error" });
        throw error;
    }
}

export async function startDomainEventConsumer(options: {
    clientId: string;
    groupId: string;
    handle: (
        envelope: DomainEventEnvelope,
        partition: number
    ) => Promise<string>;
}): Promise<void> {
    const brokerList = process.env.KAFKA_BROKER;

    if (!brokerList) {
        throw new Error("KAFKA_BROKER is not set");
    }

    const kafka = new Kafka({
        clientId: options.clientId,
        brokers: brokerList.split(","),
    });

    const consumer = kafka.consumer({ groupId: options.groupId });

    await consumer.connect();
    await consumer.subscribe({
        topic: DOMAIN_EVENTS_TOPIC,
        fromBeginning: true,
    });

    console.log(
        `${options.clientId} started (group ${options.groupId})...`
    );

    await consumer.run({
        eachMessage: async ({ message, partition }) => {
            const value = message.value?.toString();

            if (!value) {
                return;
            }

            let envelope: DomainEventEnvelope;

            try {
                envelope = JSON.parse(value) as DomainEventEnvelope;
            } catch {
                console.error(
                    "Discarding malformed event:",
                    value.slice(0, 200)
                );
                return;
            }

            const result = await options.handle(envelope, partition);

            console.log(
                `[p${partition}] ${envelope.eventType} ${envelope.eventId.slice(0, 8)} -> ${result}`
            );
        },
    });

    const shutdown = async (): Promise<void> => {
        console.log(`${options.clientId} shutting down...`);

        try {
            await consumer.disconnect();
        } catch {
            // consumer may already be disconnected
        }

        await prisma.$disconnect();
        process.exit(0);
    };

    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
}
