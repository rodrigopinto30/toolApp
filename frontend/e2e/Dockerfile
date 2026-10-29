# syntax=docker/dockerfile:1

FROM mcr.microsoft.com/playwright:v1.64.1-noble
RUN apt-get update \
    && apt-get install -y --no-install-recommends libnss3-tools \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app/e2e
COPY package.json package-lock.json .npmrc ./
RUN npm ci --no-audit && npm audit signatures
COPY --chmod=755 docker-entrypoint.sh /usr/local/bin/toolapp-e2e-entrypoint
ENTRYPOINT ["toolapp-e2e-entrypoint"]
CMD ["npx", "playwright", "test"]
