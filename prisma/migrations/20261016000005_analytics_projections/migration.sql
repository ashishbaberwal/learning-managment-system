-- CreateTable
CREATE TABLE "public"."ProcessedEvent" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "consumerGroup" TEXT NOT NULL,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProcessedEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."CourseStats" (
    "courseId" TEXT NOT NULL,
    "enrollments" INTEGER NOT NULL DEFAULT 0,
    "completions" INTEGER NOT NULL DEFAULT 0,
    "revenueCents" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CourseStats_pkey" PRIMARY KEY ("courseId")
);

-- CreateTable
CREATE TABLE "public"."LessonStats" (
    "lessonId" TEXT NOT NULL,
    "completions" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LessonStats_pkey" PRIMARY KEY ("lessonId")
);

-- CreateTable
CREATE TABLE "public"."DailyStats" (
    "date" DATE NOT NULL,
    "enrollments" INTEGER NOT NULL DEFAULT 0,
    "completions" INTEGER NOT NULL DEFAULT 0,
    "revenueCents" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DailyStats_pkey" PRIMARY KEY ("date")
);

-- CreateIndex
CREATE INDEX "ProcessedEvent_consumerGroup_processedAt_idx" ON "public"."ProcessedEvent"("consumerGroup", "processedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ProcessedEvent_eventId_consumerGroup_key" ON "public"."ProcessedEvent"("eventId", "consumerGroup");

