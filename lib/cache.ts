import { cacheOperations } from "@/lib/metrics";
import { redis } from "@/lib/redis";

const KEY_PREFIX = "cache:";

export async function getOrSet<T>(
    key: string,
    ttlSeconds: number,
    loader: () => Promise<T>
): Promise<T> {
    try {
        const cached = await redis.get(KEY_PREFIX + key);

        if (cached !== null) {
            cacheOperations.inc({ result: "hit" });
            return JSON.parse(cached) as T;
        }
    } catch (error) {
        cacheOperations.inc({ result: "error" });
        console.error("Cache read failed, using loader:", error);
    }

    const value = await loader();
    cacheOperations.inc({ result: "miss" });

    try {
        await redis.set(
            KEY_PREFIX + key,
            JSON.stringify(value),
            "EX",
            ttlSeconds
        );
    } catch (error) {
        console.error("Cache write failed:", error);
    }

    return value;
}

export async function invalidate(...keys: string[]): Promise<void> {
    if (keys.length === 0) {
        return;
    }

    try {
        await redis.del(...keys.map((key) => KEY_PREFIX + key));
    } catch (error) {
        console.error("Cache invalidation failed:", error);
    }
}

export async function invalidatePrefix(prefix: string): Promise<void> {
    try {
        let cursor = "0";

        do {
            const [next, found] = await redis.scan(
                cursor,
                "MATCH",
                `${KEY_PREFIX}${prefix}*`,
                "COUNT",
                100
            );

            cursor = next;

            if (found.length > 0) {
                await redis.del(...found);
            }
        } while (cursor !== "0");
    } catch (error) {
        console.error("Cache prefix invalidation failed:", error);
    }
}

export async function invalidateCatalogueCache(): Promise<void> {
    await Promise.all([
        invalidate("courses:published"),
        invalidatePrefix("course:"),
    ]);
}
