-- CreateEnum
CREATE TYPE "public"."OutboxStatus" AS ENUM ('Pending', 'Published');

-- CreateTable
CREATE TABLE "public"."OutboxEvent" (
    "id" TEXT NOT NULL,
    "topic" TEXT NOT NULL DEFAULT 'lms.domain.events',
    "eventType" TEXT NOT NULL,
    "aggregateType" TEXT NOT NULL,
    "aggregateId" TEXT NOT NULL,
    "partitionKey" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "public"."OutboxStatus" NOT NULL DEFAULT 'Pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedAt" TIMESTAMP(3),

    CONSTRAINT "OutboxEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OutboxEvent_status_createdAt_idx" ON "public"."OutboxEvent"("status", "createdAt");

-- CreateIndex
CREATE INDEX "OutboxEvent_aggregateType_aggregateId_idx" ON "public"."OutboxEvent"("aggregateType", "aggregateId");

