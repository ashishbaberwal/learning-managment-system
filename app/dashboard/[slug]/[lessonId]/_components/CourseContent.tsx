"use client";
import { LessonContentType } from "@/app/data/course/get-lesson-content";

import { RenderDescription } from "@/components/rich-text-editor/RenderDescription";
import { Button } from "@/components/ui/button";
import { tryCatch } from "@/hooks/try-catch";
import { CheckCircle } from "lucide-react";
import { useTransition } from "react";
import { markLessonComplete } from "../action";
import { toast } from "sonner";
import { useConfetti } from "@/hooks/use-confetti";
import { LessonVideoPlayer } from "./LessonVideoPlayer";

interface iAppProps {
    data: LessonContentType;
}

export function CourseContent({ data }: iAppProps) {
    const { triggerConfetti } = useConfetti();

    const [pending, startTransition] = useTransition();

    function onSubmit() {
        startTransition(async () => {
            const { data: result, error } = await tryCatch(
                markLessonComplete(data.id, data.Chapter.Course.slug)
            );

            if (error) {
                toast.error("An unexpeected error occured.Please try agaain");
                return;
            }

            if (result.status === "success") {
                toast.success(result.message);
                triggerConfetti();
            } else if (result.status === "error") {
                toast.error(result.message);
            }
        });
    }

    return (
        <div className="flex flex-col h-full bg-background pl-6">
            <LessonVideoPlayer
                videoKey={data.videoKey}
                thumbnailKey={data.thumbnailKey}
                hlsKey={data.videoJobs[0]?.outputKey ?? null}
            />
            <div className="py-4 border-b">
                {data.lessonProgress.length > 0 ? (
                    <Button variant="outline" className="bg-green-500/10 text-green-500 hover:text-green-600">
                        <CheckCircle className="size-4 mr-2 text-green-500" />
                        Completed
                    </Button>
                ) : (
                    <Button
                        variant="outline"
                        onClick={onSubmit}
                        disabled={pending}
                    >
                        <CheckCircle className="size-4 mr-2 text-green-500 " />
                        Mark as complete
                    </Button>
                )}
            </div>
            <div className="space-y-3 pt-3">
                <h1 className="text-3xl font-bold tracking-tight text-foreground">
                    {data.title}
                </h1>
                {data.description && (
                    <RenderDescription json={JSON.parse(data.description)} />
                )}
            </div>
        </div>
    );
}
