import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { rateLimitDecisions } from "@/lib/metrics";
import { redis } from "@/lib/redis";

const SLIDING_WINDOW_SCRIPT = `
local key = KEYS[1]
local now = tonumber(ARGV[1])
local windowMs = tonumber(ARGV[2])
local limit = tonumber(ARGV[3])
local member = ARGV[4]

redis.call('ZREMRANGEBYSCORE', key, 0, now - windowMs)

local count = redis.call('ZCARD', key)

if count >= limit then
    local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
    local retryAfterMs = windowMs
    if oldest[2] then
        retryAfterMs = (tonumber(oldest[2]) + windowMs) - now
    end
    return {0, count, retryAfterMs}
end

redis.call('ZADD', key, now, member)
redis.call('PEXPIRE', key, windowMs)
return {1, count + 1, 0}
`;

export type RateLimitResult = {
    allowed: boolean;
    limit: number;
    remaining: number;
    retryAfterMs: number;
};

export async function checkRateLimit(
    identifier: string,
    { limit, windowMs }: { limit: number; windowMs: number }
): Promise<RateLimitResult> {
    const now = Date.now();
    const bucket = identifier.split(":")[0];

    try {
        const [allowed, count, retryAfterMs] = (await redis.eval(
            SLIDING_WINDOW_SCRIPT,
            1,
            `ratelimit:${identifier}`,
            now,
            windowMs,
            limit,
            `${now}-${randomUUID()}`
        )) as [number, number, number];

        rateLimitDecisions.inc({
            bucket,
            decision: allowed === 1 ? "allowed" : "denied",
        });

        return {
            allowed: allowed === 1,
            limit,
            remaining: Math.max(0, limit - count),
            retryAfterMs,
        };
    } catch (error) {
        rateLimitDecisions.inc({ bucket, decision: "error" });
        console.error("Rate limit check failed, allowing request:", error);
        return { allowed: true, limit, remaining: limit, retryAfterMs: 0 };
    }
}

export function rateLimitHeaders(result: RateLimitResult): Record<string, string> {
    return {
        "X-RateLimit-Limit": String(result.limit),
        "X-RateLimit-Remaining": String(result.remaining),
    };
}

export function tooManyRequests(result: RateLimitResult): NextResponse {
    return NextResponse.json(
        { error: "Too many requests", retryAfterMs: result.retryAfterMs },
        {
            status: 429,
            headers: {
                ...rateLimitHeaders(result),
                "Retry-After": String(Math.ceil(result.retryAfterMs / 1000)),
            },
        }
    );
}
