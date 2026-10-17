import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { getRecommendedCourses } from "@/app/data/user/get-recommended-courses";
import {
    checkRateLimit,
    rateLimitHeaders,
    tooManyRequests,
} from "@/lib/rate-limit";

export async function GET() {
    const session = await auth.api.getSession({
        headers: await headers(),
    });

    if (!session) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const rateLimit = await checkRateLimit(
        `recommendations:user:${session.user.id}`,
        { limit: 30, windowMs: 60_000 }
    );

    if (!rateLimit.allowed) {
        return tooManyRequests(rateLimit);
    }

    const recommendations = await getRecommendedCourses(session.user.id);

    return NextResponse.json(
        { recommendations },
        { headers: rateLimitHeaders(rateLimit) }
    );
}
