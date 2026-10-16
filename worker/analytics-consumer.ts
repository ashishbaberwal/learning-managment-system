import { Kafka } from "kafkajs";
import { ANALYTICS_CONSUMER_GROUP, applyDomainEvent } from "../lib/analytics";
import { prisma } from "../lib/db";
import {
    DOMAIN_EVENTS_TOPIC,
    type DomainEventEnvelope,
} from "../lib/events";

async function main(): Promise<void> {
    const brokerList = process.env.KAFKA_BROKER;

    if (!brokerList) {
        throw new Error("KAFKA_BROKER is not set");
    }

    const kafka = new Kafka({
        clientId: "lms-analytics-consumer",
        brokers: brokerList.split(","),
    });

    const consumer = kafka.consumer({ groupId: ANALYTICS_CONSUMER_GROUP });

    await consumer.connect();
    await consumer.subscribe({
        topic: DOMAIN_EVENTS_TOPIC,
        fromBeginning: true,
    });

    console.log(
        `Analytics consumer started (group ${ANALYTICS_CONSUMER_GROUP})...`
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

            const result = await applyDomainEvent(envelope);

            console.log(
                `[p${partition}] ${envelope.eventType} ${envelope.eventId.slice(0, 8)} -> ${result}`
            );
        },
    });

    const shutdown = async (): Promise<void> => {
        console.log("Shutting down analytics consumer...");

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

main().catch(async (error) => {
    console.error("Analytics consumer failed to start:", error);
    await prisma.$disconnect();
    process.exit(1);
});
