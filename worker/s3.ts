import {
    GetObjectCommand,
    PutObjectCommand,
    S3Client,
} from "@aws-sdk/client-s3";
import { createReadStream, createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import type { Readable } from "node:stream";

const endpoint = process.env.AWS_ENDPOINT_URL_S3;
const bucket = process.env.NEXT_PUBLIC_S3_BUCKET_NAME_IMAGES;

if (!endpoint) {
    throw new Error("AWS_ENDPOINT_URL_S3 is not set");
}

if (!bucket) {
    throw new Error("NEXT_PUBLIC_S3_BUCKET_NAME_IMAGES is not set");
}

const s3 = new S3Client({
    region: "auto",
    endpoint,
    forcePathStyle: false,
});

export const videoBucket = bucket;

export async function downloadObjectToFile(
    key: string,
    filePath: string
): Promise<void> {
    const response = await s3.send(
        new GetObjectCommand({
            Bucket: videoBucket,
            Key: key,
        })
    );

    if (!response.Body) {
        throw new Error(`Object body is empty for key: ${key}`);
    }

    await pipeline(response.Body as Readable, createWriteStream(filePath));
}

export async function uploadFile(
    key: string,
    filePath: string,
    contentType: string
): Promise<void> {
    await s3.send(
        new PutObjectCommand({
            Bucket: videoBucket,
            Key: key,
            Body: createReadStream(filePath),
            ContentType: contentType,
        })
    );
}
