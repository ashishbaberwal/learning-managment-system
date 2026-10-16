"use client";

import { useConstructUrl } from "@/hooks/use-construct-url";
import Hls from "hls.js";
import { BookIcon } from "lucide-react";
import { useEffect, useRef } from "react";

interface iAppProps {
    lessonId: string;
    videoKey: string | null;
    thumbnailKey: string | null;
    hlsKey: string | null;
}

export function LessonVideoPlayer({
    lessonId,
    videoKey,
    thumbnailKey,
    hlsKey,
}: iAppProps) {
    const videoRef = useRef<HTMLVideoElement>(null);

    const thumbnailUrl = useConstructUrl(thumbnailKey ?? "");
    const hlsUrl = hlsKey ? `/api/lessons/${lessonId}/stream/${hlsKey}` : "";
    const videoUrl = videoKey
        ? `/api/lessons/${lessonId}/stream/${videoKey}`
        : "";

    useEffect(() => {
        const video = videoRef.current;

        if (!video) {
            return;
        }

        if (hlsKey) {
            if (video.canPlayType("application/vnd.apple.mpegurl")) {
                video.src = hlsUrl;
                return;
            }

            if (Hls.isSupported()) {
                const hls = new Hls();
                hls.loadSource(hlsUrl);
                hls.attachMedia(video);
                return () => hls.destroy();
            }
        }

        if (videoKey) {
            video.src = videoUrl;
        }
    }, [hlsKey, videoKey, hlsUrl, videoUrl]);

    if (!videoKey) {
        return (
            <div className="aspect-video bg-muted rounded-lg flex flex-col items-center justify-center">
                <BookIcon className="size-16 text-muted-primary mx-auto mb-4" />
                <p className="text-muted-foreground">
                    This lesson does not have any video yet
                </p>
            </div>
        );
    }

    return (
        <div className="aspect-video bg-black rounded-lg relative overflow-hidden">
            <video
                ref={videoRef}
                src={undefined}
                className="w-full h-full object-cover"
                controls
                poster={thumbnailKey ? thumbnailUrl : undefined}
            >
                Your browser does not support the video tag
            </video>
        </div>
    );
}
