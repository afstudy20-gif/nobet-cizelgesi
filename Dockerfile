FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@latest --activate

# ── builder ───────────────────────────────────────────────────────────
FROM base AS builder
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/ ./packages/
COPY apps/web/package.json ./apps/web/
RUN pnpm install --frozen-lockfile
COPY apps/web/ ./apps/web/
RUN pnpm --filter @nobet/web db:generate
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm --filter @nobet/web build

# ── runner ────────────────────────────────────────────────────────────
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs

COPY --from=builder /app/apps/web/public ./apps/web/public
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/static ./apps/web/.next/static

USER nextjs
EXPOSE 3100
ENV PORT=3100
ENV HOSTNAME="0.0.0.0"

CMD ["node", "apps/web/server.js"]
