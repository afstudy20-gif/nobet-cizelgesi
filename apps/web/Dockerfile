# Static build of the Nöbet Çizelgesi web app, served by nginx.
# Local-first: no Node server, no database, no entrypoint script and no
# runtime environment variables — the container only ships static files.
# (Build context is the repo root; identical to the root Dockerfile.)

# ── builder ───────────────────────────────────────────────────────────
FROM node:20-alpine AS builder
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/ ./packages/
COPY apps/web/package.json ./apps/web/
RUN pnpm install --frozen-lockfile
COPY apps/web/ ./apps/web/
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm --filter @nobet/web build

# ── runner ────────────────────────────────────────────────────────────
FROM nginx:alpine AS runner
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/apps/web/out /usr/share/nginx/html
EXPOSE 3100
