"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { tryCatch } from "@/hooks/try-catch";
import { Loader2, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useTransition } from "react";
import { toast } from "sonner";
import { retryVideoProcessing } from "./action";

export type VideoStatus = "Pending" | "Processing" | "Completed" | "Failed";

const STALE_PENDING_MS = 5 * 60 * 1000;

interface iAppProps {
    status: VideoStatus | null;
    attempts?: number;
    lastError?: string | null;
    jobUpdatedAt?: Date;
    lessonId: string;
    chapterId: string;
    courseId: string;
}

export function VideoProcessingStatus({
    status,
    attempts,
    lastError,
    jobUpdatedAt,
    lessonId,
    chapterId,
    courseId,
}: iAppProps) {
    const router = useRouter();
    const [pending, startTransition] = useTransition();

    const isActive = status === "Pending" || status === "Processing";

    useEffect(() => {
        if (!isActive) {
            return;
        }

        const interval = setInterval(() => router.refresh(), 5000);
        return () => clearInterval(interval);
    }, [isActive, router]);

    if (!status) {
        return null;
    }

    const isStalePending =
        status === "Pending" &&
        jobUpdatedAt !== undefined &&
        Date.now() - jobUpdatedAt.getTime() >= STALE_PENDING_MS;

    const canRetry = status === "Failed" || isStalePending;

    function onRetry() {
        startTransition(async () => {
            const { data: result, error } = await tryCatch(
                retryVideoProcessing(lessonId, chapterId, courseId)
            );

            if (error) {
                toast.error("An unexpected error occured. Please try again");
                return;
            }

            if (result.status === "success") {
                toast.success(result.message);
                router.refresh();
            } else {
                toast.error(result.message);
            }
        });
    }

    return (
        <div className="mb-6 flex flex-col gap-2 rounded-lg border p-4">
            <div className="flex flex-wrap items-center gap-3">
                <span className="text-sm font-medium">Video processing</span>

                {status === "Pending" && (
                    <Badge variant="secondary">Queued</Badge>
                )}

                {status === "Processing" && (
                    <Badge variant="secondary" className="gap-1">
                        <Loader2 className="size-3 animate-spin" />
                        Processing
                    </Badge>
                )}

                {status === "Completed" && (
                    <Badge className="border-transparent bg-emerald-600 text-white">
                        Ready
                    </Badge>
                )}

                {status === "Failed" && (
                    <Badge variant="destructive">Failed</Badge>
                )}

                {isActive && (
                    <span className="text-xs text-muted-foreground">
                        This page refreshes automatically.
                    </span>
                )}

                {status === "Completed" && (
                    <span className="text-xs text-muted-foreground">
                        HLS renditions are available for playback.
                    </span>
                )}

                {canRetry && (
                    <Button
                        variant="outline"
                        size="sm"
                        disabled={pending}
                        onClick={onRetry}
                    >
                        <RefreshCw className="size-3" />
                        {pending ? "Retrying..." : "Retry processing"}
                    </Button>
                )}
            </div>

            {status === "Failed" && (
                <p className="text-xs text-muted-foreground">
                    {typeof attempts === "number" && attempts > 0
                        ? `Attempts: ${attempts}. `
                        : null}
                    {lastError
                        ? `Last error: ${lastError.slice(0, 300)}`
                        : "No error details recorded."}
                </p>
            )}

            {isStalePending && (
                <p className="text-xs text-muted-foreground">
                    This job has been queued for a while without progress. You
                    can retry it.
                </p>
            )}
        </div>
    );
}
