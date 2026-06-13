# syntax=docker/dockerfile:1.7

# ---- builder ----
FROM golang:1.26-alpine AS builder
WORKDIR /workspace

COPY go.mod go.sum ./
RUN go mod download

COPY cmd cmd
COPY internal internal

RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /app/service ./cmd

# ---- runtime ----
FROM alpine:3.21 AS runtime
RUN apk add --no-cache ca-certificates tzdata wget

COPY --from=builder /app/service /app/service

ENTRYPOINT ["/app/service"]
