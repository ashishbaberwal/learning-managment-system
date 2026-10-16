import { Kafka, type Producer } from "kafkajs";
import { DOMAIN_EVENTS_TOPIC } from "@/lib/events";

export const DOMAIN_EVENTS_PARTITIONS = 3;

function brokers(): string[] {
    const brokerList = process.env.KAFKA_BROKER;

    if (!brokerList) {
        throw new Error("KAFKA_BROKER is not set");
    }

    return brokerList.split(",");
}

let producerPromise: Promise<Producer> | null = null;

export function getKafkaProducer(): Promise<Producer> {
    if (!producerPromise) {
        const kafka = new Kafka({
            clientId: "lms-outbox-relay",
            brokers: brokers(),
        });

        const producer = kafka.producer({ idempotent: true });

        producerPromise = producer.connect().then(() => producer).catch((error) => {
            producerPromise = null;
            throw error;
        });
    }

    return producerPromise;
}

export async function ensureDomainEventsTopic(): Promise<void> {
    const kafka = new Kafka({
        clientId: "lms-outbox-relay-admin",
        brokers: brokers(),
    });

    const admin = kafka.admin();

    await admin.connect();

    try {
        await admin.createTopics({
            topics: [
                {
                    topic: DOMAIN_EVENTS_TOPIC,
                    numPartitions: DOMAIN_EVENTS_PARTITIONS,
                    replicationFactor: 1,
                },
            ],
            waitForLeaders: true,
        });
    } finally {
        await admin.disconnect();
    }
}
