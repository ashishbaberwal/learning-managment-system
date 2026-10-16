-- CreateTable
CREATE TABLE "public"."UserCourse" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserCourse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."CourseCoOccurrence" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "relatedCourseId" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "CourseCoOccurrence_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UserCourse_courseId_idx" ON "public"."UserCourse"("courseId");

-- CreateIndex
CREATE UNIQUE INDEX "UserCourse_userId_courseId_key" ON "public"."UserCourse"("userId", "courseId");

-- CreateIndex
CREATE INDEX "CourseCoOccurrence_courseId_count_idx" ON "public"."CourseCoOccurrence"("courseId", "count");

-- CreateIndex
CREATE UNIQUE INDEX "CourseCoOccurrence_courseId_relatedCourseId_key" ON "public"."CourseCoOccurrence"("courseId", "relatedCourseId");

