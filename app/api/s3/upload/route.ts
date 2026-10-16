
import { env } from '@/lib/env';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { S3 } from '@/lib/S3Client';
import arcjet, {  fixedWindow } from '@/lib/arcjet';
import { requireAdmin } from '@/app/data/admin/require-admin';

const IMAGE_CONTENT_TYPES = [
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif",
] as const;

const VIDEO_CONTENT_TYPES = [
    "video/mp4",
    "video/webm",
    "video/quicktime",
] as const;

const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
const MAX_VIDEO_SIZE = 5000 * 1024 * 1024;

const fileUploadSchmea = z.object({
    fileName: z.string().min(1, { message: "File is required" }).max(255),
    contentType: z.string().min(1, { message: "Content Type is required" }),
    size: z.number().int().positive({ message: "Size is required" }),
    isImage: z.boolean(),

});

const aj = arcjet.withRule(
    fixedWindow({
        mode: 'LIVE',
        window: '1m',
        max: 5,
    })
);


export async function POST(request: Request) {
    const session = await requireAdmin();


    try {

        const decision = await aj.protect(request, {
            fingerprint: session?.user.id as string,
        });

        if (decision.isDenied()) {
            return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
        }

        const body = await request.json();

        const validation = fileUploadSchmea.safeParse(body);

        if (!validation.success) {
            return NextResponse.json({
                error: 'Inavlid request body'
            }, { status: 400 })
        }

        const { fileName, contentType, size } = validation.data

        const isImageType = (IMAGE_CONTENT_TYPES as readonly string[]).includes(contentType);
        const isVideoType = (VIDEO_CONTENT_TYPES as readonly string[]).includes(contentType);

        if (!isImageType && !isVideoType) {
            return NextResponse.json({
                error: 'Unsupported file type'
            }, { status: 400 })
        }

        const maxSize = isImageType ? MAX_IMAGE_SIZE : MAX_VIDEO_SIZE;

        if (size > maxSize) {
            return NextResponse.json({
                error: 'File exceeds the maximum allowed size'
            }, { status: 400 })
        }

        const safeFileName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-200);

        const uniqueKey = `${uuidv4()}-${safeFileName}`

        const bucket = isImageType
            ? env.NEXT_PUBLIC_S3_BUCKET_NAME_IMAGES
            : env.S3_VIDEO_BUCKET_NAME;

        const command = new PutObjectCommand({
            Bucket: bucket,
            ContentType: contentType,
            ContentLength: size,
            Key: uniqueKey
        });

        const presignedUrl = await getSignedUrl(S3, command, {
            expiresIn: 360, //url expires in 6 minutes
        });

        const response = {
            presignedUrl,
            key: uniqueKey,
        };

        return NextResponse.json(response);


    } catch {
        return NextResponse.json(
            { error: "Failed to generate presigned URL" },
            { status: 500 }

        );
    }
}