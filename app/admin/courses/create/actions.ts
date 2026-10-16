"use server";

import { requireAdmin } from "@/app/data/admin/require-admin";
import arcjet, { fixedWindow } from "@/lib/arcjet";
import { invalidateCatalogueCache } from "@/lib/cache";

import { prisma } from "@/lib/db";
import { stripe } from "@/lib/stripe";
import { ApiResponse } from "@/lib/types";
import { courseSchema, CourseSchemaType } from "@/lib/zodSchemas";
import { request } from "@arcjet/next";

const aj = arcjet.withRule(
    fixedWindow({
        mode: "LIVE",
        window: "1m",
        max: 5,
    })
);

export async function CreateCourse(
    values: CourseSchemaType
): Promise<ApiResponse> {
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

        const validation = courseSchema.safeParse(values);
        if (!validation.success) {
            return {
                status: "error",
                message: "Invalid from data",
            };
        }

        const data = await stripe.products.create({
            name: validation.data.title,
            description: validation.data.smallDescription,
            default_price_data: {
                currency: "usd",
                unit_amount: Math.round(validation.data.price * 100),
            },
        });

        await prisma.course.create({
            data: {
                ...validation.data,
                userId: session?.user.id as string,
                stripePriceId: data.default_price as string,
            },
        });

        await invalidateCatalogueCache();

        return {
            status: "success",
            message: "Course created succesfully",
        };
    } catch (error) {
        console.error("CreateCourse Error:", error);
        return {
            status: "error",
            message: "Failed to create Course",
        };
    }
}
