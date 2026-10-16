import "server-only";
import { getOrSet } from "@/lib/cache";
import { prisma } from "@/lib/db";

export async function getRecommendedCourses(userId: string, limit = 4) {
    return getOrSet(`recs:${userId}:${limit}`, 30, async () => {
        const [enrollments, userCourses] = await Promise.all([
            prisma.enrollment.findMany({
                where: { userId, status: { in: ["Active", "Pending"] } },
                select: { courseId: true },
            }),
            prisma.userCourse.findMany({
                where: { userId },
                select: { courseId: true },
            }),
        ]);

        const excluded = new Set(enrollments.map((e) => e.courseId));
        const scores = new Map<string, number>();

        if (userCourses.length > 0) {
            const pairs = await prisma.courseCoOccurrence.findMany({
                where: {
                    courseId: { in: userCourses.map((c) => c.courseId) },
                },
                orderBy: { count: "desc" },
            });

            for (const pair of pairs) {
                if (excluded.has(pair.relatedCourseId)) {
                    continue;
                }
                scores.set(
                    pair.relatedCourseId,
                    (scores.get(pair.relatedCourseId) ?? 0) + pair.count
                );
            }
        }

        const candidates: {
            courseId: string;
            score: number;
            reason: string;
        }[] = [...scores.entries()]
            .sort((a, b) => b[1] - a[1])
            .slice(0, limit)
            .map(([courseId, score]) => ({
                courseId,
                score,
                reason: "Students in your courses also enrolled",
            }));

        if (candidates.length < limit) {
            const taken = new Set([
                ...excluded,
                ...candidates.map((c) => c.courseId),
            ]);
            const trending = await prisma.courseStats.findMany({
                where: {
                    enrollments: { gt: 0 },
                    courseId: { notIn: [...taken] },
                },
                orderBy: { enrollments: "desc" },
                take: limit - candidates.length,
            });

            for (const t of trending) {
                candidates.push({
                    courseId: t.courseId,
                    score: t.enrollments,
                    reason: "Popular with other students",
                });
            }
        }

        if (candidates.length < limit) {
            const taken = new Set([
                ...excluded,
                ...candidates.map((c) => c.courseId),
            ]);
            const fresh = await prisma.course.findMany({
                where: {
                    status: "Published",
                    id: { notIn: [...taken] },
                },
                orderBy: { createdAt: "desc" },
                take: limit - candidates.length,
                select: { id: true },
            });

            for (const f of fresh) {
                candidates.push({
                    courseId: f.id,
                    score: 0,
                    reason: "New on the platform",
                });
            }
        }

        const details = await prisma.course.findMany({
            where: { id: { in: candidates.map((c) => c.courseId) } },
            select: {
                id: true,
                title: true,
                price: true,
                smallDescription: true,
                slug: true,
                fileKey: true,
                level: true,
                duration: true,
                category: true,
            },
        });
        const byId = new Map(details.map((d) => [d.id, d]));

        return candidates.flatMap((candidate) => {
            const course = byId.get(candidate.courseId);
            return course ? [{ ...candidate, course }] : [];
        });
    });
}

export type RecommendedCourse = Awaited<
    ReturnType<typeof getRecommendedCourses>
>[number];
