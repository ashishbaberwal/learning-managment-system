"use server";

import { requireAdmin } from "@/app/data/admin/require-admin";
import arcjet, {  fixedWindow } from "@/lib/arcjet";
import { invalidateCatalogueCache } from "@/lib/cache";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { S3 } from "@/lib/S3Client";
import { ApiResponse } from "@/lib/types";
import { DeleteObjectsCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";
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

async function deleteKeys(bucket: string, keys: string[]) {
    for (let i = 0; i < keys.length; i += 1000) {
        const batch = keys.slice(i, i + 1000);

        if (batch.length === 0) {
            continue;
        }

        const result = await S3.send(
            new DeleteObjectsCommand({
                Bucket: bucket,
                Delete: {
                    Objects: batch.map((Key) => ({ Key })),
                    Quiet: true,
                },
            })
        );

        if (result.Errors && result.Errors.length > 0) {
            throw new Error(
                `Failed to delete ${result.Errors.length} S3 object(s)`
            );
        }
    }
}

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

        const course = await prisma.course.findUnique({
            where: {
                id: courseId,
                userId: session.user.id,
            },
            select: {
                id: true,
                fileKey: true,
                chapter: {
                    select: {
                        lessons: {
                            select: {
                                id: true,
                                thumbnailKey: true,
                                videoKey: true,
                            },
                        },
                    },
                },
            },
        });

        if (!course) {
            return {
                status: "error",
                message: "Course not found",
            };
        }

        const lessons = course.chapter.flatMap((chapter) => chapter.lessons);

        const publicKeys = [
            course.fileKey,
            ...lessons.map((lesson) => lesson.thumbnailKey),
        ].filter((key): key is string => Boolean(key));

        const videoKeys = lessons
            .map((lesson) => lesson.videoKey)
            .filter((key): key is string => Boolean(key));

        await deleteKeys(env.NEXT_PUBLIC_S3_BUCKET_NAME_IMAGES, publicKeys);
        await deleteKeys(env.S3_VIDEO_BUCKET_NAME, videoKeys);

        for (const lesson of lessons) {
            let continuationToken: string | undefined;

            do {
                const listed = await S3.send(
                    new ListObjectsV2Command({
                        Bucket: env.S3_VIDEO_BUCKET_NAME,
                        Prefix: `hls/${lesson.id}/`,
                        ContinuationToken: continuationToken,
                    })
                );

                const hlsKeys = (listed.Contents ?? [])
                    .map((object) => object.Key)
                    .filter((key): key is string => Boolean(key));

                await deleteKeys(env.S3_VIDEO_BUCKET_NAME, hlsKeys);

                continuationToken = listed.IsTruncated
                    ? listed.NextContinuationToken
                    : undefined;
            } while (continuationToken);
        }

        await prisma.course.delete({
            where: {
                id: course.id,
                userId: session.user.id,
            },
        });

        revalidatePath("/admin/courses");
        await invalidateCatalogueCache();

        return {
            status: "success",
            message: "Course deleted successfully",
        };
    } catch (error) {
        console.error("deleteCourse failed:", error);
        return {
            status: "error",
            message: "Failed to delete Course!",
        };
    }
}
