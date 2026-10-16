import { prisma } from "../lib/db";
import { transcodeToHls } from "./ffmpeg";
import { downloadObjectToFile, uploadFile } from "./s3";
import { mkdtemp, readdir, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export const MAX_ATTEMPTS = 3;
export const RETRY_DELAY_MS = 30_000;

export type JobOutcome = "completed" | "retry" | "failed" | "skipped";

function contentTypeFor(file: string): string {
    if (file.endsWith(".m3u8")) {
        return "application/vnd.apple.mpegurl";
    }
    if (file.endsWith(".ts")) {
        return "video/mp2t";
    }
    return "application/octet-stream";
}

async function uploadDirectory(dir: string, prefix: string): Promise<void> {
    const entries = await readdir(dir, { recursive: true });

    for (const entry of entries) {
        const filePath = path.join(dir, entry);
        const info = await stat(filePath);

        if (!info.isFile()) {
            continue;
        }

        const key = [prefix, entry.split(path.sep).join("/")].join("/");
        await uploadFile(key, filePath, contentTypeFor(entry));
    }
}

export async function processVideoJob(jobId: string): Promise<JobOutcome> {
    const job = await prisma.videoProcessingJob.findUnique({
        where: {
            id: jobId,
        },
    });

    if (!job || job.status === "Completed") {
        return "skipped";
    }

    await prisma.$transaction([
        prisma.videoProcessingJob.update({
            where: { id: jobId },
            data: {
                status: "Processing",
                startedAt: new Date(),
            },
        }),
        prisma.lesson.update({
            where: { id: job.lessonId },
            data: { videoProcessingStatus: "Processing" },
        }),
    ]);

    const workDir = await mkdtemp(path.join(os.tmpdir(), "video-job-"));

    try {
        const inputPath = path.join(
            workDir,
            `input${path.extname(job.sourceKey) || ".mp4"}`
        );
        const outputDir = path.join(workDir, "hls");

        await downloadObjectToFile(job.sourceKey, inputPath);
        await transcodeToHls(inputPath, outputDir);

        const prefix = `hls/${job.lessonId}`;
        await uploadDirectory(outputDir, prefix);

        await prisma.$transaction([
            prisma.videoProcessingJob.update({
                where: { id: jobId },
                data: {
                    status: "Completed",
                    outputKey: `${prefix}/master.m3u8`,
                    finishedAt: new Date(),
                    lastError: null,
                },
            }),
            prisma.lesson.update({
                where: { id: job.lessonId },
                data: { videoProcessingStatus: "Completed" },
            }),
        ]);

        return "completed";
    } catch (error) {
        const attempts = job.attempts + 1;
        const message = error instanceof Error ? error.message : String(error);

        if (attempts >= MAX_ATTEMPTS) {
            await prisma.$transaction([
                prisma.videoProcessingJob.update({
                    where: { id: jobId },
                    data: {
                        status: "Failed",
                        attempts,
                        lastError: message,
                        finishedAt: new Date(),
                    },
                }),
                prisma.lesson.update({
                    where: { id: job.lessonId },
                    data: { videoProcessingStatus: "Failed" },
                }),
            ]);

            return "failed";
        }

        await prisma.$transaction([
            prisma.videoProcessingJob.update({
                where: { id: jobId },
                data: {
                    status: "Pending",
                    attempts,
                    lastError: message,
                },
            }),
            prisma.lesson.update({
                where: { id: job.lessonId },
                data: { videoProcessingStatus: "Pending" },
            }),
        ]);

        return "retry";
    } finally {
        await rm(workDir, { recursive: true, force: true });
    }
}
