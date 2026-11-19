FROM node:22-alpine AS builder

WORKDIR /app
RUN npm install -g pnpm

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* tsconfig.base.json ./
COPY packages/core/package.json ./packages/core/
COPY packages/adapters/package.json ./packages/adapters/
COPY apps/api/package.json ./apps/api/

RUN pnpm install --frozen-lockfile=false

COPY packages/core ./packages/core
COPY packages/adapters ./packages/adapters
COPY apps/api ./apps/api

RUN pnpm --filter @ai-tutor/core run build && \
    pnpm --filter @ai-tutor/adapters run build && \
    pnpm --filter @ai-tutor/api run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN npm install -g pnpm

COPY --from=builder /app ./

EXPOSE 3000
CMD ["pnpm", "--filter", "@ai-tutor/api", "start"]
