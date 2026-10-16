"use server";

import { requireAdmin } from "@/app/data/admin/require-admin"
import { invalidateCatalogueCache } from "@/lib/cache";
import { prisma } from "@/lib/db";
import { enqueueVideoProcessingJob } from "@/lib/rabbitmq";
import { ApiResponse } from "@/lib/types";
import { lessonSchema, LessonSchemaType } from "@/lib/zodSchemas";
import { revalidatePath } from "next/cache";

const STALE_PENDING_MS = 5 * 60 * 1000;


export async function updateLesson(values: LessonSchemaType, lessonId: string): Promise<ApiResponse> {
    await requireAdmin();

    try {
        const result = lessonSchema.safeParse(values);
        if (!result.success) {
            return {
                status: "error",
                message: "Invalid data",
            };
        }

        const existingLesson = await prisma.lesson.findUnique({
            where: {
                id: lessonId,
            },
            select: {
                id: true,
                videoKey: true,
            },
        });

        if (!existingLesson) {
            return {
                status: "error",
                message: "Lesson not found",
            };
        }

        const newVideoKey = result.data.videoKey;
        const videoChanged =
            !!newVideoKey && newVideoKey !== existingLesson.videoKey;

        const job = await prisma.$transaction(async (tx) => {
            await tx.lesson.update({
                where: {
                    id: lessonId,
                },
                data: {
                    title: result.data.name,
                    description: result.data.description,
                    thumbnailKey: result.data.thumbnailKey,
                    videoKey: newVideoKey,
                    ...(videoChanged
                        ? { videoProcessingStatus: "Pending" as const }
                        : {}),
                },
            });

            if (!videoChanged || !newVideoKey) {
                return null;
            }

            return tx.videoProcessingJob.create({
                data: {
                    lessonId,
                    sourceKey: newVideoKey,
                },
            });
        });

        if (job) {
            try {
                await enqueueVideoProcessingJob(job.id);
            } catch (error) {
                console.error(
                    "Failed to enqueue video processing job:",
                    job.id,
                    error
                );
            }
        }

        await invalidateCatalogueCache();

        return {
            status: 'success',
            message: 'Lesson updated successfully'
        }

    } catch {
        return {
            status: "error",
            message: "Failed to update lesson",
        };

    }

}

export async function retryVideoProcessing(
    lessonId: string,
    chapterId: string,
    courseId: string
): Promise<ApiResponse> {
    await requireAdmin();

    try {
        const lesson = await prisma.lesson.findUnique({
            where: {
                id: lessonId,
            },
            select: {
                id: true,
                videoKey: true,
                videoJobs: {
                    orderBy: { createdAt: "desc" },
                    take: 1,
                    select: {
                        id: true,
                        status: true,
                        updatedAt: true,
                    },
                },
            },
        });

        if (!lesson) {
            return {
                status: "error",
                message: "Lesson not found",
            };
        }

        const videoKey = lesson.videoKey;

        if (!videoKey) {
            return {
                status: "error",
                message: "This lesson has no video yet",
            };
        }

        const latestJob = lesson.videoJobs[0];

        if (latestJob && latestJob.status === "Processing") {
            return {
                status: "error",
                message: "Video is currently being processed",
            };
        }

        if (
            latestJob &&
            latestJob.status === "Pending" &&
            Date.now() - latestJob.updatedAt.getTime() < STALE_PENDING_MS
        ) {
            return {
                status: "error",
                message: "Video is already queued for processing",
            };
        }

        const job = await prisma.$transaction(async (tx) => {
            await tx.lesson.update({
                where: {
                    id: lessonId,
                },
                data: {
                    videoProcessingStatus: "Pending",
                },
            });

            if (latestJob) {
                return tx.videoProcessingJob.update({
                    where: {
                        id: latestJob.id,
                    },
                    data: {
                        status: "Pending",
                        attempts: 0,
                        lastError: null,
                        startedAt: null,
                        finishedAt: null,
                        sourceKey: videoKey,
                    },
                });
            }

            return tx.videoProcessingJob.create({
                data: {
                    lessonId,
                    sourceKey: videoKey,
                },
            });
        });

        try {
            await enqueueVideoProcessingJob(job.id);
        } catch (error) {
            console.error(
                "Failed to enqueue video processing job:",
                job.id,
                error
            );

            await prisma.$transaction([
                prisma.videoProcessingJob.update({
                    where: { id: job.id },
                    data: {
                        status: "Failed",
                        lastError: "Failed to enqueue video processing job",
                    },
                }),
                prisma.lesson.update({
                    where: { id: lessonId },
                    data: { videoProcessingStatus: "Failed" },
                }),
            ]);

            return {
                status: "error",
                message: "Failed to queue video processing. Please retry",
            };
        }

        revalidatePath(
            `/admin/courses/${courseId}/${chapterId}/${lessonId}`,
            "page"
        );

        return {
            status: "success",
            message: "Video processing has been queued",
        };
    } catch {
        return {
            status: "error",
            message: "Failed to queue video processing",
        };
    }
}