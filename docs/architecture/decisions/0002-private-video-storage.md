# ADR 0002: Private Video Storage with Authenticated Streaming

## Status
Accepted

## Context
Lesson videos (raw MP4 uploads and worker-generated HLS outputs) were stored in the public bucket alongside thumbnails and course images. Anyone holding an object URL could stream any lesson video, regardless of enrollment or payment. Phase 3 introduces private playback: only authenticated admins and students with an `Active` enrollment for the lesson's course may fetch video bytes.

## Decision
1. **Dedicated private bucket:** Lesson videos and HLS outputs live in a separate private bucket (`S3_VIDEO_BUCKET_NAME`, e.g. `lms-videos`). Public assets (course/lesson thumbnails, images) remain in the existing public bucket. Upload presigning, deletion, and the video worker all route by content type to the correct bucket.
2. **Authenticated same-origin streaming route:** Playback goes through `GET /api/lessons/[lessonId]/stream/[...path]`. The route requires a session (401 otherwise), checks `Active` enrollment for the lesson's course (admins bypass; non-enrolled gets 404 to avoid resource enumeration), and only serves keys within an allowlist: the lesson's exact `videoKey` or the `hls/{lessonId}/` prefix. `Range` requests are passed through (206) for seeking.
3. **Relative HLS URLs:** The master playlist references renditions relatively, so hls.js resolves every playlist/segment against the same streaming route. No CORS configuration or per-segment signing is needed on the video bucket.
4. **Admin previews via presigned reads:** The admin uploader previews uploaded videos through an admin-only presigned-GET route (`/api/s3/read`) rather than direct bucket access.
5. **Middleware exemption:** `api/lessons` is excluded from the Arcjet middleware matcher; authorization is enforced inside the route. Bot-detection heuristics must not interrupt media playback, and the route performs its own per-request auth check.

## Alternatives Considered
- **Presigned GET URLs per object:** A playlist with dozens of segments would require dozens of presigned URLs or client-side URL rewriting, and any URL remains shareable for its TTL. Rejected in favor of a per-request authorization check.
- **Public bucket with unguessable keys (status quo):** No authorization at all; rejected as the vulnerability being fixed.

## Consequences
- **Positive:** No publicly fetchable video URLs; revocation of enrollment (or refund/expiry) takes effect on the next request; bucket layout stays hidden; a single origin for playback.
- **Negative:** Video bytes transit the Next.js server (bandwidth and CPU cost; acceptable at current scale — a CDN with signed URLs/cookies is the natural future step); each request adds session + enrollment lookups (indexed, sub-millisecond); the route must remain excluded from edge bot rules.

## Migration Notes
- Existing objects were copied to the private bucket and verified (size + ETag) before the public copies were deleted; the worker re-processed one previously failed lesson end-to-end against the new bucket.
