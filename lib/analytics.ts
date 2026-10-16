import { consumeOnce } from "@/lib/consumer";
import type { DomainEventEnvelope } from "@/lib/events";

export const ANALYTICS_CONSUMER_GROUP = "analytics-consumer";

type EventPayload = {
    courseId?: string;
    lessonId?: string;
    amountTotal?: number;
};

function eventDay(occurredAt: string): Date {
    return new Date(`${occurredAt.slice(0, 10)}T00:00:00.000Z`);
}

export async function applyDomainEvent(
    envelope: DomainEventEnvelope
): Promise<"applied" | "duplicate"> {
    return consumeOnce(ANALYTICS_CONSUMER_GROUP, envelope, async (tx) => {
        const payload = (envelope.payload ?? {}) as EventPayload;
        const day = eventDay(envelope.occurredAt);

        switch (envelope.eventType) {
            case "course.enrolled": {
                if (!payload.courseId) {
                    return;
                }
                await tx.courseStats.upsert({
                    where: { courseId: payload.courseId },
                    create: { courseId: payload.courseId, enrollments: 1 },
                    update: { enrollments: { increment: 1 } },
                });
                await tx.dailyStats.upsert({
                    where: { date: day },
                    create: { date: day, enrollments: 1 },
                    update: { enrollments: { increment: 1 } },
                });
                return;
            }
            case "payment.succeeded": {
                if (!payload.courseId) {
                    return;
                }
                const amount = payload.amountTotal ?? 0;
                await tx.courseStats.upsert({
                    where: { courseId: payload.courseId },
                    create: {
                        courseId: payload.courseId,
                        revenueCents: amount,
                    },
                    update: { revenueCents: { increment: amount } },
                });
                await tx.dailyStats.upsert({
                    where: { date: day },
                    create: { date: day, revenueCents: amount },
                    update: { revenueCents: { increment: amount } },
                });
                return;
            }
            case "lesson.completed": {
                if (!payload.lessonId) {
                    return;
                }
                await tx.lessonStats.upsert({
                    where: { lessonId: payload.lessonId },
                    create: {
                        lessonId: payload.lessonId,
                        completions: 1,
                    },
                    update: { completions: { increment: 1 } },
                });
                return;
            }
            case "course.completed": {
                if (!payload.courseId) {
                    return;
                }
                await tx.courseStats.upsert({
                    where: { courseId: payload.courseId },
                    create: { courseId: payload.courseId, completions: 1 },
                    update: { completions: { increment: 1 } },
                });
                await tx.dailyStats.upsert({
                    where: { date: day },
                    create: { date: day, completions: 1 },
                    update: { completions: { increment: 1 } },
                });
                return;
            }
            default:
                console.log(
                    `Analytics: skipping unknown event type ${envelope.eventType}`
                );
        }
    });
}
