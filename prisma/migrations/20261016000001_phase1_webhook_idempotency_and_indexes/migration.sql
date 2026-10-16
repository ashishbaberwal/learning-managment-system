-- AlterTable
ALTER TABLE "public"."Enrollment" ADD COLUMN     "stripeSessionId" TEXT;

-- CreateTable
CREATE TABLE "public"."StripeWebhookEvent" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "payload" JSONB,

    CONSTRAINT "StripeWebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StripeWebhookEvent_eventId_key" ON "public"."StripeWebhookEvent"("eventId");

-- CreateIndex
CREATE INDEX "StripeWebhookEvent_eventType_processedAt_idx" ON "public"."StripeWebhookEvent"("eventType", "processedAt");

-- CreateIndex
CREATE INDEX "Course_status_createdAt_idx" ON "public"."Course"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Course_category_status_idx" ON "public"."Course"("category", "status");

-- CreateIndex
CREATE INDEX "Course_userId_idx" ON "public"."Course"("userId");

-- CreateIndex
CREATE INDEX "Chapter_courseId_position_idx" ON "public"."Chapter"("courseId", "position");

-- CreateIndex
CREATE INDEX "Lesson_chapterId_position_idx" ON "public"."Lesson"("chapterId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "Enrollment_stripeSessionId_key" ON "public"."Enrollment"("stripeSessionId");

-- CreateIndex
CREATE INDEX "Enrollment_courseId_status_idx" ON "public"."Enrollment"("courseId", "status");

-- CreateIndex
CREATE INDEX "Enrollment_status_createdAt_idx" ON "public"."Enrollment"("status", "createdAt");

-- CreateIndex
CREATE INDEX "LessonProgress_lessonId_idx" ON "public"."LessonProgress"("lessonId");

