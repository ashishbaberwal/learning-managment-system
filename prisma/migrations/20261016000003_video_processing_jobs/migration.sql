-- CreateEnum
CREATE TYPE "public"."VideoProcessingStatus" AS ENUM ('Pending', 'Processing', 'Completed', 'Failed');

-- AlterTable
ALTER TABLE "public"."Lesson" ADD COLUMN     "videoProcessingStatus" "public"."VideoProcessingStatus";

-- CreateTable
CREATE TABLE "public"."VideoProcessingJob" (
    "id" TEXT NOT NULL,
    "status" "public"."VideoProcessingStatus" NOT NULL DEFAULT 'Pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "sourceKey" TEXT NOT NULL,
    "outputKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "lessonId" TEXT NOT NULL,

    CONSTRAINT "VideoProcessingJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VideoProcessingJob_lessonId_idx" ON "public"."VideoProcessingJob"("lessonId");

-- CreateIndex
CREATE INDEX "VideoProcessingJob_status_createdAt_idx" ON "public"."VideoProcessingJob"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "public"."VideoProcessingJob" ADD CONSTRAINT "VideoProcessingJob_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "public"."Lesson"("id") ON DELETE CASCADE ON UPDATE CASCADE;

