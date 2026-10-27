# ---- frontend ----
FROM node:26-alpine AS web
RUN npm install -g pnpm@12.15.0
WORKDIR /app/frontend
COPY frontend/package.json frontend/pnpm-lock.yaml frontend/pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY frontend/ ./
RUN pnpm build

# ---- backend ----
FROM golang:1.27-alpine AS api
WORKDIR /src
COPY backend/go.mod backend/go.sum ./
RUN go mod download
COPY backend/ ./
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /out/sigma .

# ---- runtime ----
FROM alpine:3.20
RUN addgroup -S sigma && adduser -S sigma -G sigma \
    && mkdir -p /app/data && chown -R sigma:sigma /app
WORKDIR /app
COPY --from=api /out/sigma /app/sigma
COPY --from=web /app/frontend/dist /app/web
ENV STATIC_DIR=/app/web \
    DB_PATH=/app/data/sigma.db \
    PORT=9000
VOLUME ["/app/data"]
EXPOSE 9000
USER sigma
CMD ["/app/sigma"]
