# Current LMS Architecture (Baseline Audit)

## 1. Overview

The Learning Management System (LMS) starts as a monolithic Next.js 15.5.9 (App Router) application using PostgreSQL (via Prisma), Better Auth for authentication, Stripe for payments, Tigris S3-compatible object storage for media, Resend for transactional OTP emails, and Arcjet for bot/WAF protection.

```text
+-------------------------------------------------------------------------+
|                           Client Browser                                |
|  - Public Catalogue (/courses, /courses/[slug])                         |
|  - Auth UI (/login, /verify-request)                                    |
|  - Student Dashboard (/dashboard, /dashboard/[slug]/[lessonId])         |
|  - Admin Dashboard (/admin, /admin/courses, /admin/courses/[id]/edit)   |
|  - Direct XHR PUT Upload to Tigris S3 & HTML5 <video> Playback          |
+-------------------+---------------------------------+-------------------+
                    |                                 |
      HTTPS / Server Actions / API             Direct PUT / Public GET
                    |                                 |
                    v                                 v
+---------------------------------------+   +-----------------------------+
|      Next.js 15.5.9 Monolith          |   |   Tigris S3 Object Storage  |
|                                       |   | (*.t3.storage.dev)          |
|  1. Edge/Node Middleware              |   | - Course thumbnails         |
|     - Arcjet detectBot (LIVE)         |   | - Lesson thumbnails         |
|     - Cookie check on /admin/*        |   | - Raw MP4 lesson videos     |
|                                       |   +-----------------------------+
|  2. Route Handlers (/app/api/*)       |                 ^
|     - /api/auth/[...all] (BetterAuth) |                 |
|     - /api/s3/upload (Presigned PUT)  |-----------------+
|     - /api/s3/delete (DeleteObject)   |   Presigned URL / DeleteObject
|     - /api/webhook/stripe             |
|                                       |
|  3. Server Actions & Data Layer       |
|     - Course/Chapter/Lesson CRUD      |
|     - enrollInCourseAction            |
|     - markLessonComplete              |
|     - Data fetchers (app/data/*)      |
+-------+---------------+---------------+
        |               |               \
  Prisma Client    Stripe SDK        Resend SDK
        |               |                 \
        v               v                  v
+---------------+ +---------------+ +---------------+
|  PostgreSQL   | |  Stripe API   | |  Resend API   |
|  Database     | |  (Checkout &  | |  (Email OTP)  |
|               | |   Webhooks)   | |               |
+---------------+ +---------------+ +---------------+
```

## 2. Technology Stack

- **Web Framework:** Next.js 15.5.9 (App Router), React 19
- **Database & ORM:** PostgreSQL + Prisma 6.15.0
- **Authentication:** Better Auth (`better-auth` with `emailOTP` and `admin` plugins)
- **Payments:** Stripe Checkout & Webhooks (`stripe` v20)
- **Object Storage:** AWS S3 SDK v3 (`@aws-sdk/client-s3`) against Tigris (`t3.storage.dev`)
- **Security:** Arcjet (`@arcjet/next`)

## 3. Baseline Limitations Identified in Phase 0 Audit

1. **Enrollment Pricing Bug:** `enrollInCourseAction` used a hardcoded Stripe Price ID (`price_1SpLdPSJPxGiEWXcnrlldmt9`) instead of `course.stripePriceId`, and called `stripe.checkout.sessions.create` inside a Prisma interactive transaction.
2. **Webhook Idempotency:** `/api/webhook/stripe` did not record processed Stripe `event.id` values, risking duplicate processing or unhandled 500 retry loops.
3. **Authorization & Validation Gaps:**
   - `markLessonComplete` did not verify active course enrollment and returned `status: "success"` inside its `catch` block.
   - `/api/s3/upload` did not enforce MIME type allowlists or server-side max file sizes.
   - Public course lookup (`getIndeividualCourse`) did not filter by `status: "Published"`.
4. **Synchronous Raw Video Delivery:** Lesson videos were uploaded as raw MP4 files directly to a public bucket without background transcoding, adaptive bitrate (HLS), or signed URL protection.
5. **No Event Streaming or Caching:** Analytics were computed via live `findMany`/`count` queries over raw tables without event-driven projections or Redis caching.
6. **Observability:** No Prometheus metrics, Grafana dashboards, or health/readiness endpoints existed.
