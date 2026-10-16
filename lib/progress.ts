import { prisma } from "@/lib/db";
import { domainEvents, type DomainEventInput } from "@/lib/events";

type CompleteLessonResult = { ok: true } | { ok: false; message: string };

export async function completeLesson(
    userId: string,
    lessonId: string
): Promise<CompleteLessonResult> {
    return prisma.$transaction(async (tx) => {
        const lesson = await tx.lesson.findUnique({
            where: { id: lessonId },
            select: {
                id: true,
                Chapter: {
                    select: {
                        courseId: true,
                    },
                },
            },
        });

        if (!lesson) {
            return { ok: false, message: "Lesson not found" };
        }

        const courseId = lesson.Chapter.courseId;

        const enrollment = await tx.enrollment.findUnique({
            where: {
                userId_courseId: {
                    userId,
                    courseId,
                },
            },
            select: {
                id: true,
                status: true,
            },
        });

        if (enrollment?.status !== "Active") {
            return {
                ok: false,
                message: "You are not enrolled in this course",
            };
        }

        const existingProgress = await tx.lessonProgress.findUnique({
            where: {
                userId_lessonId: {
                    userId,
                    lessonId,
                },
            },
            select: {
                completed: true,
            },
        });

        const progress = await tx.lessonProgress.upsert({
            where: {
                userId_lessonId: {
                    userId,
                    lessonId,
                },
            },
            update: {
                completed: true,
            },
            create: {
                lessonId,
                userId,
                completed: true,
            },
            select: {
                id: true,
            },
        });

        const firstCompletion = existingProgress?.completed !== true;
        const events: DomainEventInput[] = [];

        if (firstCompletion) {
            events.push({
                eventType: "lesson.completed",
                aggregateType: "lessonProgress",
                aggregateId: progress.id,
                partitionKey: userId,
                payload: {
                    userId,
                    lessonId,
                    courseId,
                },
            });

            const totalLessons = await tx.lesson.count({
                where: {
                    Chapter: {
                        courseId,
                    },
                },
            });

            const completedLessons = await tx.lessonProgress.count({
                where: {
                    userId,
                    completed: true,
                    lesson: {
                        Chapter: {
                            courseId,
                        },
                    },
                },
            });

            if (totalLessons > 0 && completedLessons === totalLessons) {
                events.push({
                    eventType: "course.completed",
                    aggregateType: "enrollment",
                    aggregateId: enrollment.id,
                    partitionKey: userId,
                    payload: {
                        userId,
                        courseId,
                        enrollmentId: enrollment.id,
                        completedLessons,
                        totalLessons,
                    },
                });
            }
        }

        if (events.length > 0) {
            await tx.outboxEvent.createMany({
                data: domainEvents(events),
            });
        }

        return { ok: true } as CompleteLessonResult;
    });
}
