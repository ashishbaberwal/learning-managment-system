import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { S3 } from "@/lib/S3Client";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { Readable } from "node:stream";
import {
    checkRateLimit,
    rateLimitHeaders,
    tooManyRequests,
} from "@/lib/rate-limit";

export const runtime = "nodejs";

export async function GET(
    request: Request,
    { params }: { params: Promise<{ lessonId: string; path: string[] }> }
) {
    const { lessonId, path } = await params;

    const session = await auth.api.getSession({
        headers: await headers(),
    });

    if (!session) {
        return new NextResponse("Unauthorized", { status: 401 });
    }

    const lesson = await prisma.lesson.findUnique({
        where: { id: lessonId },
        select: {
            videoKey: true,
            Chapter: { select: { courseId: true } },
        },
    });

    if (!lesson) {
        return new NextResponse("Not found", { status: 404 });
    }

    if (session.user.role !== "admin") {
        const enrollment = await prisma.enrollment.findUnique({
            where: {
                userId_courseId: {
                    userId: session.user.id,
                    courseId: lesson.Chapter.courseId,
                },
            },
            select: { status: true },
        });

        if (enrollment?.status !== "Active") {
            return new NextResponse("Not found", { status: 404 });
        }
    }

    const rateLimit = await checkRateLimit(
        `stream:user:${session.user.id}`,
        { limit: 120, windowMs: 60_000 }
    );

    if (!rateLimit.allowed) {
        return tooManyRequests(rateLimit);
    }

    const key = path.map((segment) => decodeURIComponent(segment)).join("/");

    const isHls = key.startsWith(`hls/${lessonId}/`);
    const isSource = lesson.videoKey !== null && lesson.videoKey === key;

    if (!isHls && !isSource) {
        return new NextResponse("Not found", { status: 404 });
    }

    const range = request.headers.get("range");

    try {
        const object = await S3.send(
            new GetObjectCommand({
                Bucket: env.S3_VIDEO_BUCKET_NAME,
                Key: key,
                Range: range ?? undefined,
            })
        );

        if (!object.Body) {
            return new NextResponse("Not found", { status: 404 });
        }

        const responseHeaders = new Headers();

        if (object.ContentType) {
            responseHeaders.set("Content-Type", object.ContentType);
        }

        if (object.ContentLength != null) {
            responseHeaders.set("Content-Length", String(object.ContentLength));
        }

        if (object.ContentRange) {
            responseHeaders.set("Content-Range", object.ContentRange);
        }

        responseHeaders.set("Accept-Ranges", "bytes");
        responseHeaders.set(
            "Cache-Control",
            key.endsWith(".m3u8")
                ? "private, max-age=60"
                : "private, max-age=3600"
        );

        for (const [name, value] of Object.entries(rateLimitHeaders(rateLimit))) {
            responseHeaders.set(name, value);
        }

        return new NextResponse(
            Readable.toWeb(object.Body as Readable) as ReadableStream,
            {
                status: object.ContentRange ? 206 : 200,
                headers: responseHeaders,
            }
        );
    } catch {
        return new NextResponse("Not found", { status: 404 });
    }
}
