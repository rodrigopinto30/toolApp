# syntax=docker/dockerfile:1

FROM node:24-alpine AS base
ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /app
RUN chown node:node /app
USER node

FROM base AS deps
COPY --chown=node:node package.json package-lock.json .npmrc ./
RUN npm ci --no-audit \
    && sha256sum package-lock.json | cut -d ' ' -f 1 > node_modules/.lock-hash \
    && mkdir .next

FROM deps AS dev
ENV NODE_ENV=development
COPY --chmod=755 docker-entrypoint.dev.sh /usr/local/bin/toolapp-dev-entrypoint
EXPOSE 3000
ENTRYPOINT ["toolapp-dev-entrypoint"]
CMD ["npm", "run", "dev", "--", "--hostname", "0.0.0.0", "--port", "3000"]

FROM deps AS builder
COPY --chown=node:node . .
RUN npm run build

FROM node:24-alpine AS runner
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
WORKDIR /app
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
RUN mkdir -p .next/cache && chown node:node .next/cache
USER node
EXPOSE 3000
CMD ["node", "server.js"]
