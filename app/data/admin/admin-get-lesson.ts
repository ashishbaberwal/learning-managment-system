import "server-only";
import { notFound } from "next/navigation";
import { requireAdmin } from "./require-admin";
import { prisma } from "@/lib/db";

export async function adminGetLesson(id:string) {
    await requireAdmin();

    const data = await prisma.lesson.findUnique({
        where: {
            id:id,
        },
        select: {
            title: true,
            videoKey: true,
            thumbnailKey: true,
            description: true,
            id: true,
            position: true,
            videoProcessingStatus: true,
            videoJobs: {
                orderBy: { createdAt: "desc" },
                take: 1,
                select: {
                    status: true,
                    attempts: true,
                    lastError: true,
                    updatedAt: true,
                },
            },
        },
    });

    if(!data){
        return notFound();
    }
    return data;
}

export type AdminLessonType = Awaited<ReturnType<typeof adminGetLesson>>;