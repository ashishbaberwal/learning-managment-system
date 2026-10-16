import ffmpegPath from "ffmpeg-static";
import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const MAX_STDERR_LINES = 30;

if (!ffmpegPath) {
    throw new Error("ffmpeg binary is not available (ffmpeg-static)");
}

function run(args: string[]): Promise<void> {
    return new Promise((resolve, reject) => {
        const child = spawn(ffmpegPath as string, args);

        const stderrLines: string[] = [];

        child.stderr.on("data", (chunk: Buffer) => {
            stderrLines.push(chunk.toString());
            if (stderrLines.length > MAX_STDERR_LINES) {
                stderrLines.shift();
            }
        });

        child.on("error", (error) => reject(error));

        child.on("close", (code) => {
            if (code === 0) {
                resolve();
                return;
            }

            reject(
                new Error(
                    `ffmpeg exited with code ${code}:\n${stderrLines.join("")}`
                )
            );
        });
    });
}

async function hasAudioStream(inputPath: string): Promise<boolean> {
    return new Promise((resolve) => {
        const child = spawn(ffmpegPath as string, ["-i", inputPath]);

        let stderr = "";

        child.stderr.on("data", (chunk: Buffer) => {
            stderr += chunk.toString();
        });

        child.on("error", () => resolve(false));

        child.on("close", () => {
            resolve(/Audio:/.test(stderr));
        });
    });
}

export async function transcodeToHls(
    inputPath: string,
    outputDir: string
): Promise<void> {
    const audio = await hasAudioStream(inputPath);

    await mkdir(path.join(outputDir, "0"), { recursive: true });
    await mkdir(path.join(outputDir, "1"), { recursive: true });

    const args = [
        "-i",
        inputPath,
        "-filter_complex",
        "[0:v]split=2[v1][v2];[v1]scale=w=-2:h=480[v1out];[v2]scale=w=-2:h=720[v2out]",
        "-map",
        "[v1out]",
        "-c:v:0",
        "libx264",
        "-b:v:0",
        "800k",
        "-map",
        "[v2out]",
        "-c:v:1",
        "libx264",
        "-b:v:1",
        "2500k",
        "-preset",
        "veryfast",
        ...(audio
            ? [
                  "-map",
                  "a:0",
                  "-map",
                  "a:0",
                  "-c:a",
                  "aac",
                  "-b:a",
                  "128k",
              ]
            : []),
        "-f",
        "hls",
        "-hls_time",
        "6",
        "-hls_playlist_type",
        "vod",
        "-hls_segment_filename",
        path.join(outputDir, "%v", "segment_%03d.ts"),
        "-master_pl_name",
        "master.m3u8",
        "-var_stream_map",
        audio ? "v:0,a:0 v:1,a:1" : "v:0 v:1",
        path.join(outputDir, "%v", "index.m3u8"),
    ];

    await run(args);
}
