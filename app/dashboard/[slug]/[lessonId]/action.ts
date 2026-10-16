"use server";

import { requireUser } from "@/app/data/user/require-user";
import { prisma } from "@/lib/db";
import { ApiResponse } from "@/lib/types";
import { revalidatePath } from "next/cache";

export async function markLessonComplete(
    lessonId: string,
    slug: string
): Promise<ApiResponse> {
    const user = await requireUser();

    try {
        const lesson = await prisma.lesson.findUnique({
            where: {
                id: lessonId,
            },
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
            return {
                status: "error",
                message: "Lesson not found",
            };
        }

        const enrollment = await prisma.enrollment.findUnique({
            where: {
                userId_courseId: {
                    userId: user.id,
                    courseId: lesson.Chapter.courseId,
                },
            },
            select: {
                status: true,
            },
        });

        if (enrollment?.status !== "Active") {
            return {
                status: "error",
                message: "You are not enrolled in this course",
            };
        }

        await prisma.lessonProgress.upsert({
            where: {
                userId_lessonId: {
                    userId: user.id,
                    lessonId: lesson.id,
                },
            },
            update: {
                completed: true,
            },
            create: {
                lessonId: lesson.id,
                userId: user.id,
                completed: true,
            },
        });

        revalidatePath(`/dashboard/${slug}`);

        return {
            status: "success",
            message: "Progress updated",
        };
    } catch (error) {
        console.error("markLessonComplete failed:", error);
        return {
            status: "error",
            message: "Failed to mark lesson as complete",
        };
    }
}
