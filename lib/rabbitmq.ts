import amqp from "amqplib";
import type { ChannelModel, ConfirmChannel } from "amqplib";

const VIDEO_QUEUE = "video.processing";
const VIDEO_DLQ = "video.processing.dlq";

let channelPromise: Promise<ConfirmChannel> | null = null;

async function connect(): Promise<ConfirmChannel> {
    const url = process.env.AMQP_URL;

    if (!url) {
        throw new Error("AMQP_URL is not set");
    }

    const connection: ChannelModel = await amqp.connect(url);

    connection.on("error", (error) => {
        console.error("RabbitMQ connection error:", error);
    });

    connection.on("close", () => {
        channelPromise = null;
    });

    const channel = await connection.createConfirmChannel();

    channel.on("error", (error) => {
        console.error("RabbitMQ channel error:", error);
    });

    channel.on("close", () => {
        channelPromise = null;
    });

    await channel.assertQueue(VIDEO_DLQ, { durable: true });
    await channel.assertQueue(VIDEO_QUEUE, {
        durable: true,
        deadLetterExchange: "",
        deadLetterRoutingKey: VIDEO_DLQ,
    });

    return channel;
}

export function getVideoProcessingChannel(): Promise<ConfirmChannel> {
    if (!channelPromise) {
        channelPromise = connect().catch((error) => {
            channelPromise = null;
            throw error;
        });
    }

    return channelPromise;
}

export async function enqueueVideoProcessingJob(jobId: string): Promise<void> {
    const channel = await getVideoProcessingChannel();

    await new Promise<void>((resolve, reject) => {
        channel.publish(
            "",
            VIDEO_QUEUE,
            Buffer.from(JSON.stringify({ jobId })),
            {
                persistent: true,
                contentType: "application/json",
                messageId: jobId,
            },
            (error) => {
                if (error) {
                    reject(error);
                    return;
                }
                resolve();
            }
        );
    });
}
