"use server";

import { requireAdmin } from "@/app/data/admin/require-admin"
import { prisma } from "@/lib/db";
import { enqueueVideoProcessingJob } from "@/lib/rabbitmq";
import { ApiResponse } from "@/lib/types";
import { lessonSchema, LessonSchemaType } from "@/lib/zodSchemas";


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