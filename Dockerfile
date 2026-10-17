FROM node:24-bookworm-slim AS base
RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*
RUN npm install -g pnpm@11.10.0
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --ignore-scripts

FROM base AS builder
ENV NEXT_TELEMETRY_DISABLED=1
ENV DATABASE_URL=postgresql://build:build@localhost:5432/build
ENV REDIS_URL=redis://localhost:6379
ENV BETTER_AUTH_SECRET=build-secret
ENV BETTER_AUTH_URL=http://localhost:3000
ENV AUTH_GITHUB_CLIENT_ID=build-github-client-id
ENV AUTH_GITHUB_SECRET=build-github-client-secret
ENV RESEND_API_KEY=re_build_placeholder
ENV ARCJET_KEY=ajkey_0123456789abcdef0123456789abcdef
ENV AWS_ACCESS_KEY_ID=build-access-key
ENV AWS_SECRET_ACCESS_KEY=build-secret-key
ENV AWS_ENDPOINT_URL_S3=https://s3.build.invalid
ENV AWS_ENDPOINT_URL_IAM=https://iam.build.invalid
ENV AWS_REGION=us-east-1
ENV STRIPE_SECRET_KEY=sk_test_build
ENV STRIPE_WEBHOOK_SECRET=whsec_build
ENV AMQP_URL=amqp://guest:guest@localhost:5672
ENV S3_VIDEO_BUCKET_NAME=build-videos
ENV NEXT_PUBLIC_S3_BUCKET_NAME_IMAGES=build-images
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm exec prisma generate && pnpm build

FROM base AS runner
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
EXPOSE 3000
CMD ["node", "server.js"]
