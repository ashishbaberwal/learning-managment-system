import { env } from "@/lib/env";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { S3 } from "@/lib/S3Client";
import arcjet, { fixedWindow } from "@/lib/arcjet";
import { requireAdmin } from "@/app/data/admin/require-admin";

const readFileSchema = z.object({
    key: z.string().min(1, { message: "Object key is required" }).max(1024),
});

const aj = arcjet.withRule(
    fixedWindow({
        mode: "LIVE",
        window: "1m",
        max: 30,
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

        const validation = readFileSchema.safeParse(await request.json());

        if (!validation.success) {
            return NextResponse.json(
                { error: "Missing or invalid object key" },
                { status: 400 }
            );
        }

        const command = new GetObjectCommand({
            Bucket: env.S3_VIDEO_BUCKET_NAME,
            Key: validation.data.key,
        });

        const url = await getSignedUrl(S3, command, {
            expiresIn: 3600,
        });

        return NextResponse.json({ url });
    } catch {
        return NextResponse.json(
            { error: "Failed to generate presigned URL" },
            { status: 500 }
        );
    }
}
