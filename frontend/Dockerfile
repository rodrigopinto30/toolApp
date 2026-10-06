# syntax=docker/dockerfile:1

FROM node:22-alpine AS base
ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /app
RUN chown node:node /app
USER node

# --- Dependencies (reproducible from package-lock.json) ----------------------
FROM base AS deps
COPY --chown=node:node package.json package-lock.json ./
RUN npm ci && mkdir .next

# --- Development: source code is mounted as a volume -------------------------
FROM deps AS dev
ENV NODE_ENV=development
EXPOSE 3000
CMD ["npm", "run", "dev", "--", "--hostname", "0.0.0.0", "--port", "3000"]

# --- Production build ---------------------------------------------------------
FROM deps AS builder
COPY --chown=node:node . .
RUN npm run build

# --- Minimal runtime: "standalone" output, no full node_modules --------------
FROM node:22-alpine AS runner
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
WORKDIR /app
# Code owned by root (read-only); only the Next.js cache is writable.
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
RUN mkdir -p .next/cache && chown node:node .next/cache
USER node
EXPOSE 3000
CMD ["node", "server.js"]
