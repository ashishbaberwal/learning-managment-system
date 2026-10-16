"use client";

import { useCallback, useEffect, useState } from "react";
import { FileRejection, useDropzone } from "react-dropzone";
import { Card, CardContent } from "../ui/card";
import { cn } from "@/lib/utils";
import {
    RenderEmptyState,
    RenderErrorState,
    RenderUploadedState,
    RenderUploadingState,
} from "./RenderState";
import { toast } from "sonner";
import { v4 as uuidv4 } from "uuid";
import { useConstructUrl } from "@/hooks/use-construct-url";

interface UploaderSatate {
    id: string | null;
    file: File | null;
    uploading: boolean;
    progress: number;
    key?: string;
    isDeleting: boolean;
    error: boolean;
    objectUrl?: string;
    fileType: "image" | "video";
}

interface iAppProps {
    value?: string;
    onChange?: (value: string) => void;
    fileTypeAccepted: "image" | "video";
}

export function Uploader({ onChange, value, fileTypeAccepted }: iAppProps) {
    const fileUrl = useConstructUrl(value || "");
    const [fileState, setFileState] = useState<UploaderSatate>({
        error: false,
        file: null,
        id: null,
        uploading: false,
        progress: 0,
        isDeleting: false,
        fileType: fileTypeAccepted,
        key: value,
        objectUrl:
            value && fileTypeAccepted === "image" ? fileUrl : undefined,
    });

    useEffect(() => {
        if (fileTypeAccepted !== "video" || !value) {
            return;
        }

        let cancelled = false;

        fetch("/api/s3/read", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ key: value }),
        })
            .then((response) =>
                response.ok
                    ? response.json()
                    : Promise.reject(new Error("Failed to load preview"))
            )
            .then(({ url }: { url: string }) => {
                if (!cancelled) {
                    setFileState((prev) =>
                        prev.objectUrl ? prev : { ...prev, objectUrl: url }
                    );
                }
            })
            .catch(() => undefined);

        return () => {
            cancelled = true;
        };
    }, [fileTypeAccepted, value]);

    const uploadFile = useCallback(async (file: File) => {
        
            setFileState((prev) => ({
                ...prev,
                uploading: true,
                progress: 0,
            }));

            try {
                //1.get presigned url

                const presignedResponse = await fetch("/api/s3/upload", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        fileName: file.name,
                        contentType: file.type,
                        size: file.size,
                        isImage: fileTypeAccepted === "image" ? true : false,
                    }),
                });

                if (!presignedResponse.ok) {
                    toast.error("failed to get presigned url");
                    setFileState((prev) => ({
                        ...prev,
                        uploading: false, //this was error i wasted my sufficient time
                        progress: 0,
                        error: true,
                    }));
                    return;
                }
                const { presignedUrl, key } = await presignedResponse.json();

                await new Promise<void>((resolve, reject) => {
                    const xhr = new XMLHttpRequest();

                    xhr.upload.onprogress = (event) => {
                        if (event.lengthComputable) {
                            const percentageCompleted =
                                (event.loaded / event.total) * 100;
                            setFileState((prev) => ({
                                ...prev,
                                progress: Math.round(percentageCompleted),
                            }));
                        }
                    };

                    xhr.onload = () => {
                        if (xhr.status === 200 || xhr.status === 204) {
                            setFileState((prev) => ({
                                ...prev,
                                progress: 100,
                                uploading: false,
                                key: key,
                            }));

                            onChange?.(key);

                            toast.success("File Uploaded successfully");
                            resolve();
                        } else {
                            reject(new Error("Upload failed..."));
                        }
                    };

                    xhr.onerror = () => {
                        reject(new Error("Upload Failed"));
                    };

                    xhr.open("PUT", presignedUrl);
                    xhr.setRequestHeader("Content-Type", file.type);
                    xhr.send(file);
                });
            } catch  {
                toast.error("Something went wrong");

                setFileState((prev) => ({
                    ...prev,
                    progress: 0,
                    uploading: false,
                    error: true,
                }));
            }
        
    }, [fileTypeAccepted, onChange]);

    

    const onDrop = useCallback(
        (acceptedFiles: File[]) => {
            // Do something with the files
            if (acceptedFiles.length > 0) {
                const file = acceptedFiles[0];

                if (
                    fileState.objectUrl &&
                    !fileState.objectUrl.startsWith("http")
                ) {
                    URL.revokeObjectURL(fileState.objectUrl);
                }

                setFileState({
                    file: file,
                    uploading: false,
                    progress: 0,
                    objectUrl: URL.createObjectURL(file),
                    error: false,
                    id: uuidv4(),
                    isDeleting: false,
                    fileType: fileTypeAccepted,
                });
                uploadFile(file);
            }
        },
        [fileState.objectUrl, uploadFile, fileTypeAccepted]
    );

    async function handleRemoveFile() {
        if (fileState.isDeleting || !fileState.objectUrl) {
            return;
        }

        try {
            setFileState((prev) => ({
                ...prev,
                isDeleting: true,
            }));

            const response = await fetch("/api/s3/delete", {
                method: "DELETE",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    key: fileState.key,
                    fileType: fileState.fileType,
                }),
            });

            if (!response.ok) {
                toast.error("failed to remove file from storage");

                setFileState((prev) => ({
                    ...prev,
                    isDeleting: true,
                    error: true,
                }));

                return;
            }

            if (
                fileState.objectUrl &&
                !fileState.objectUrl.startsWith("http")
            ) {
                URL.revokeObjectURL(fileState.objectUrl);
            }

            onChange?.("");

            setFileState(() => ({
                file: null,
                uploading: false,
                progress: 0,
                objectUrl: undefined,
                error: false,
                fileType: fileTypeAccepted,
                id: null,
                isDeleting: false,
            }));

            toast.success("file removed scucessfully");
        } catch {
            setFileState((prev) => ({
                ...prev,
                isDeleting: false,
                error: true,
            }));
        }
    }

    function rejectedFiles(fileRejection: FileRejection[]) {
        if (fileRejection.length) {
            const tooManyFiles = fileRejection.find(
                (rejection) => rejection.errors[0].code === "too-many-files"
            );

            const fileSizeToBig = fileRejection.find(
                (rejection) => rejection.errors[0].code === "file-too-large"
            );

            if (fileSizeToBig) {
                toast.error("File size exceeds the limit");
            }

            if (tooManyFiles) {
                toast.error("Too many files selected max files 1");
            }
        }
    }

    function renderContent() {
        if (fileState.uploading) {
            return (
                <RenderUploadingState
                    progress={fileState.progress}
                    file={fileState.file as File}
                />
            );
        }

        if (fileState.error) {
            return <RenderErrorState />;
        }

        if (fileState.objectUrl) {
            return (
                <RenderUploadedState
                    previewUrl={fileState.objectUrl}
                    handleRemoveFile={handleRemoveFile}
                    isDeleting={fileState.isDeleting}
                    fileType={fileState.fileType}
                />
            );
        }

        return <RenderEmptyState isDragActive={isDragActive} />;
    }

    useEffect(() => {
        return () => {
            if (
                fileState.objectUrl &&
                !fileState.objectUrl.startsWith("http")
            ) {
                URL.revokeObjectURL(fileState.objectUrl);
            }
        };
    }, [fileState.objectUrl]);

    const { getRootProps, getInputProps, isDragActive } = useDropzone({
        onDrop,
        accept:
            fileTypeAccepted === "video"
                ? { "video/*": [] }
                : { "image/*": [] },
        maxFiles: 1,
        multiple: false,

        maxSize: fileTypeAccepted === 'image' ? 5 * 1024 * 1024 : 5000 * 1024 * 1024, //5MB calcultaion
        onDropRejected: rejectedFiles,
        disabled: fileState.uploading || !!fileState.objectUrl,
    });

    return (
        <div>
            <Card
                {...getRootProps()}
                className={cn(
                    "relative border-2 border-dashed transition-colors duration-200 w-full h-64",
                    isDragActive
                        ? "border-primary bg-primary/10 border-solid"
                        : "border-border hover:border-primary"
                )}
            >
                <CardContent className="flex items-center justify-center h-full w-full p-4">
                    <input {...getInputProps()} />
                    {renderContent()}
                </CardContent>
            </Card>
        </div>
    );
}
