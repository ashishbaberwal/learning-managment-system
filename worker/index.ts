import { prisma } from "../lib/db";
import {
    VIDEO_QUEUE,
    enqueueVideoProcessingRetry,
    getVideoProcessingChannel,
} from "../lib/rabbitmq";
import { RETRY_DELAY_MS, processVideoJob } from "./process-video-job";
import type { ConsumeMessage } from "amqplib";

function parseJobId(message: ConsumeMessage): string | null {
    try {
        const parsed = JSON.parse(message.content.toString()) as {
            jobId?: unknown;
        };

        if (typeof parsed.jobId === "string" && parsed.jobId.length > 0) {
            return parsed.jobId;
        }

        return null;
    } catch {
        return null;
    }
}

async function main(): Promise<void> {
    const channel = await getVideoProcessingChannel();

    await channel.prefetch(1);

    console.log("Worker started, waiting for video.processing jobs...");

    await channel.consume(
        VIDEO_QUEUE,
        async (message) => {
            if (!message) {
                return;
            }

            const jobId = parseJobId(message);

            if (!jobId) {
                console.error(
                    "Discarding malformed job message:",
                    message.content.toString().slice(0, 500)
                );
                channel.nack(message, false, false);
                return;
            }

            console.log(`Processing job ${jobId}...`);

            try {
                const outcome = await processVideoJob(jobId);

                if (outcome === "retry") {
                    try {
                        await enqueueVideoProcessingRetry(
                            jobId,
                            RETRY_DELAY_MS
                        );
                        console.log(
                            `Job ${jobId} scheduled for retry in ${RETRY_DELAY_MS / 1000}s`
                        );
                    } catch (error) {
                        console.error(
                            `Failed to schedule retry for job ${jobId}, requeueing:`,
                            error
                        );
                        channel.nack(message, false, true);
                        return;
                    }
                } else {
                    console.log(`Job ${jobId} finished with outcome: ${outcome}`);
                }

                channel.ack(message);
            } catch (error) {
                console.error(
                    `Unexpected error while processing job ${jobId}, requeueing:`,
                    error
                );
                channel.nack(message, false, true);
            }
        },
        { noAck: false }
    );

    const shutdown = async (): Promise<void> => {
        console.log("Shutting down worker...");

        try {
            await channel.close();
        } catch {
            // channel may already be closed
        }

        await prisma.$disconnect();
        process.exit(0);
    };

    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
}

main().catch(async (error) => {
    console.error("Worker failed to start:", error);
    await prisma.$disconnect();
    process.exit(1);
});
