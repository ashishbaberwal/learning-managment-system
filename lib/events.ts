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
