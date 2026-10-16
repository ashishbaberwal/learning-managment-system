import type { Prisma } from "@/lib/generated/prisma";

export const DOMAIN_EVENTS_TOPIC = "lms.domain.events";

export type DomainEventType =
    | "payment.succeeded"
    | "course.enrolled"
    | "lesson.completed"
    | "course.completed";

export type DomainEventInput = {
    eventType: DomainEventType;
    aggregateType: string;
    aggregateId: string;
    partitionKey: string;
    payload: Prisma.InputJsonObject;
};

export function domainEvents(
    events: DomainEventInput[]
): Prisma.OutboxEventCreateManyInput[] {
    return events.map((event) => ({
        ...event,
        topic: DOMAIN_EVENTS_TOPIC,
    }));
}

export const DOMAIN_EVENT_VERSION = 1;

export type DomainEventEnvelope = {
    eventId: string;
    eventType: string;
    occurredAt: string;
    aggregateType: string;
    aggregateId: string;
    version: number;
    payload: Prisma.JsonValue;
};

export function toDomainEventEnvelope(event: {
    id: string;
    eventType: string;
    createdAt: Date;
    aggregateType: string;
    aggregateId: string;
    payload: Prisma.JsonValue;
}): DomainEventEnvelope {
    return {
        eventId: event.id,
        eventType: event.eventType,
        occurredAt: event.createdAt.toISOString(),
        aggregateType: event.aggregateType,
        aggregateId: event.aggregateId,
        version: DOMAIN_EVENT_VERSION,
        payload: event.payload,
    };
}
