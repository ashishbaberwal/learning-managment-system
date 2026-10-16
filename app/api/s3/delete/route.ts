import { requireAdmin } from "@/app/data/admin/require-admin";
import arcjet, {  fixedWindow } from "@/lib/arcjet";

import { env } from "@/lib/env";
import { S3 } from "@/lib/S3Client";
import { DeleteObjectCommand } from "@aws-sdk/client-s3";

import { NextResponse } from "next/server";
import { z } from "zod";

const deleteFileSchema = z.object({
    key: z.string().min(1, { message: "Object key is required" }),
});

const aj = arcjet.withRule(
    fixedWindow({
        mode: 'LIVE',
        window: '1m',
        max: 5
    })
);

export async function DELETE(request: Request) {

    const session = await requireAdmin();

    try {

        const decision = await aj.protect(request, {
            fingerprint: session?.user.id as string,
        });

        if (decision.isDenied()) {
            return NextResponse.json({ error: "dude not good" }, { status: 429 });
        }

        const validation = deleteFileSchema.safeParse(await request.json());

        if (!validation.success) {
            return NextResponse.json(
                { error: "Missing or invalid object key" },
                { status: 400 }

            );
        }

        const { key } = validation.data;

        const command = new DeleteObjectCommand({
            Bucket: env.NEXT_PUBLIC_S3_BUCKET_NAME_IMAGES,
            Key: key,
        });

        await S3.send(command);

        return NextResponse.json({ message: "File deleted Succesfully" },
            { status: 200 }
        );

    } catch{
        return NextResponse.json(
            { error: "Failed to delete file" },
            { status: 500 }

        );
    }
}