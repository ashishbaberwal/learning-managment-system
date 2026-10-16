import { getOrSet } from "@/lib/cache";
import { prisma } from "@/lib/db";
import "server-only";

export async function getAllCourses() {
    return getOrSet("courses:published", 60, async () => {
        const data = await prisma.course.findMany(
            {
                where:{
                    status:"Published",
                }, 
                orderBy:{
                    createdAt: "desc",
                },
                select:{
                    title: true,
                    price: true,
                    smallDescription: true,
                    slug: true,
                    fileKey: true,
                    id: true,
                    level: true,
                    duration: true,
                    category: true,
                }
            }
        )
        return data;
    });
}

export type PublicCourseType = Awaited<ReturnType<typeof getAllCourses>>[0];