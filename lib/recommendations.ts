import { consumeOnce } from "@/lib/consumer";
import type { DomainEventEnvelope } from "@/lib/events";

export const RECOMMENDATIONS_CONSUMER_GROUP = "recommendations-consumer";

type EventPayload = {
    userId?: string;
    courseId?: string;
};

export async function applyRecommendationEvent(
    envelope: DomainEventEnvelope
): Promise<"applied" | "duplicate"> {
    return consumeOnce(
        RECOMMENDATIONS_CONSUMER_GROUP,
        envelope,
        async (tx) => {
            if (envelope.eventType !== "course.enrolled") {
                return;
            }

            const payload = (envelope.payload ?? {}) as EventPayload;

            if (!payload.userId || !payload.courseId) {
                return;
            }

            await tx.userCourse.upsert({
                where: {
                    userId_courseId: {
                        userId: payload.userId,
                        courseId: payload.courseId,
                    },
                },
                create: {
                    userId: payload.userId,
                    courseId: payload.courseId,
                },
                update: {},
            });

            const others = await tx.userCourse.findMany({
                where: {
                    userId: payload.userId,
                    courseId: { not: payload.courseId },
                },
                select: {
                    courseId: true,
                },
            });

            for (const other of others) {
                await tx.courseCoOccurrence.upsert({
                    where: {
                        courseId_relatedCourseId: {
                            courseId: other.courseId,
                            relatedCourseId: payload.courseId,
                        },
                    },
                    create: {
                        courseId: other.courseId,
                        relatedCourseId: payload.courseId,
                        count: 1,
                    },
                    update: {
                        count: { increment: 1 },
                    },
                });
                await tx.courseCoOccurrence.upsert({
                    where: {
                        courseId_relatedCourseId: {
                            courseId: payload.courseId,
                            relatedCourseId: other.courseId,
                        },
                    },
                    create: {
                        courseId: payload.courseId,
                        relatedCourseId: other.courseId,
                        count: 1,
                    },
                    update: {
                        count: { increment: 1 },
                    },
                });
            }
        }
    );
}
