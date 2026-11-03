# syntax=docker/dockerfile:1.7
# Multi-stage build producing a small Next.js standalone image (linux/amd64 + linux/arm64).

FROM node:22-bookworm-slim AS deps
WORKDIR /app
# Build tools are only a fallback if no prebuilt better-sqlite3 binary exists for the platform.
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-bookworm-slim AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:22-bookworm-slim AS runner
WORKDIR /app
ARG APP_VERSION=dev
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=777 \
    HOSTNAME=0.0.0.0 \
    DATA_DIR=/data \
    APP_VERSION=${APP_VERSION}

LABEL org.opencontainers.image.title="NestFund" \
      org.opencontainers.image.description="Personal finance dashboard for budgeting, expense tracking, savings goals and long-term investing" \
      org.opencontainers.image.source="https://github.com/mwmiao/NestFund" \
      org.opencontainers.image.version="${APP_VERSION}"

COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
COPY --from=builder --chown=node:node /app/public ./public
# Native SQLite driver (copied explicitly so the .node binary is always present).
COPY --from=builder --chown=node:node /app/node_modules/better-sqlite3 ./node_modules/better-sqlite3
COPY --from=builder --chown=node:node /app/node_modules/bindings ./node_modules/bindings
COPY --from=builder --chown=node:node /app/node_modules/file-uri-to-path ./node_modules/file-uri-to-path

RUN mkdir -p /data/uploads && chown -R node:node /data
VOLUME ["/data"]
USER node
EXPOSE 777

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||777)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
