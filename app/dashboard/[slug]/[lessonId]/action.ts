"use server";

import { requireUser } from "@/app/data/user/require-user";
import { completeLesson } from "@/lib/progress";
import { ApiResponse } from "@/lib/types";
import { revalidatePath } from "next/cache";

export async function markLessonComplete(
    lessonId: string,
    slug: string
): Promise<ApiResponse> {
    const user = await requireUser();

    try {
        const result = await completeLesson(user.id, lessonId);

        if (!result.ok) {
            return {
                status: "error",
                message: result.message,
            };
        }

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
