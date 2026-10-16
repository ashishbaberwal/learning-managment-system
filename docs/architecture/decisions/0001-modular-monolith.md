# ADR 0001: Keep a Modular Monolith and Extract Only Asynchronous Workers

## Status
Accepted

## Context
The existing LMS is built as a Next.js App Router monolith sharing a single Prisma schema and TypeScript codebase. We need to add background video transcoding, domain event streaming, analytics projections, and course recommendations. A common anti-pattern is splitting every domain (Auth, Courses, Payments, Progress) into separate HTTP/gRPC microservices.

## Decision
We keep the core LMS web application as a **Modular Monolith** and extract only independently scalable background processes:
1. **Video Transcoding Worker** (RabbitMQ + FFmpeg)
2. **Domain Event Consumers** (Kafka Analytics & Recommendation consumers)

## Consequences
- **Positive:** Preserves ACID transactions across users, courses, and enrollments; zero internal network serialization overhead for web requests; shared TypeScript types and Prisma schema; simple deployment on Vercel/Docker.
- **Negative:** Background workers share the Prisma schema definition and must coordinate database migrations carefully (backward-compatible expand/contract migrations).
