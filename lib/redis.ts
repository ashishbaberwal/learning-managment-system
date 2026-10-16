import Redis from "ioredis";
import { env } from "@/lib/env";

const globalForRedis = global as unknown as { redis?: Redis };

export const redis =
    globalForRedis.redis ??
    new Redis(env.REDIS_URL, {
        maxRetriesPerRequest: 1,
        enableOfflineQueue: false,
        retryStrategy: (times) => Math.min(times * 200, 2000),
    });

redis.on("error", (error) => {
    console.error("Redis connection error:", error.message);
});

if (process.env.NODE_ENV !== "production") globalForRedis.redis = redis;
