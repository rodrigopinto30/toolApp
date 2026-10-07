# syntax=docker/dockerfile:1

FROM python:3.12-slim AS base
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1
WORKDIR /app

# --- Dependencies in an isolated venv ----------------------------------------
FROM base AS builder
RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"
COPY requirements.txt .
RUN pip install -r requirements.txt

FROM base AS runtime
RUN groupadd --gid 10001 app \
    && useradd --uid 10001 --gid app --no-create-home --shell /usr/sbin/nologin app
COPY --from=builder /opt/venv /opt/venv
RUN mkdir -p /app/media && chown app:app /app/media
ENV PATH="/opt/venv/bin:$PATH"
EXPOSE 8000

FROM runtime AS dev
COPY requirements-dev.txt .
RUN pip install -r requirements-dev.txt
USER app
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload", "--reload-dir", "app", "--proxy-headers", "--forwarded-allow-ips", "*", "--no-access-log"]

FROM runtime AS prod
COPY alembic.ini ./
COPY migrations ./migrations
COPY app ./app
USER app
CMD ["sh", "-c", "exec gunicorn app.main:app -k uvicorn_worker.UvicornWorker -w ${WEB_CONCURRENCY:-2} -b 0.0.0.0:8000 --timeout ${GUNICORN_TIMEOUT:-30} --graceful-timeout 20 --keep-alive 5 --forwarded-allow-ips '*'"]
