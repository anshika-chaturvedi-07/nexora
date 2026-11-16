# ---- 1. Build the website -------------------------------------------------
FROM node:22-alpine AS web
WORKDIR /web
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --legacy-peer-deps
COPY frontend/ ./
RUN npm run build

# ---- 2. Python runtime: API + built website --------------------------------
FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 \
    NEXORA_WEB_DIST=/app/web
WORKDIR /app
COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY backend/ ./
# Generate the synthetic dataset at build time so the container starts instantly
RUN python -m nexora.data.generate
COPY --from=web /web/dist /app/web

EXPOSE 8000
CMD ["sh", "-c", "uvicorn nexora.api:app --host 0.0.0.0 --port ${PORT:-8000}"]
