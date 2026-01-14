"use server";

import { requireAdmin } from "@/app/data/admin/require-admin";
import arcjet, {  fixedWindow } from "@/lib/arcjet";
import { prisma } from "@/lib/db";
import { ApiResponse } from "@/lib/types";
import { request } from "@arcjet/next";
import { revalidatePath } from "next/cache";

const aj = arcjet
    .withRule(
        fixedWindow({
            mode: "LIVE",
            window: "1m",
            max: 5,
        })
    );

export async function deleteCourse(courseId: string): Promise<ApiResponse> {
    const session = await requireAdmin();

    try {
        // Access request data that Arcjet needs when you call `protect()` similarly
        // to `await headers()` and `await cookies()` in `next/headers`
        const req = await request();
        const decision = await aj.protect(req, {
            fingerprint: session.user.id,
        });

        if (decision.isDenied()) {
            if (decision.reason.isRateLimit()) {
                return {
                    status: "error",
                    message: "You have been blocked due to rate limit",
                };
            } else {
                return {
                    status: "error",
                    message:
                        "You are a bot! if this is a mistake contact our support",
                };
            }
        }
        await prisma.course.delete({
            where: {
                id: courseId,
            },
        });

        revalidatePath("/admin/courses");

        return {
            status: "success",
            message: "Course deleted succesfully",
        };
    } catch {
        return {
            status: "error",
            message: "Failed to delete Courses!",
        };
    }
}
