# Vendored from identity-platform-go

This directory is a **vendored subset** of
[`jedi-knights/identity-platform-go`](https://github.com/jedi-knights/identity-platform-go),
built around the upstream `api-gateway` service. It is not a git submodule
and not a Go module that depends on the upstream repo.

## What is vendored

Only the pieces required to build and run **`api-gateway`** alone:

| Path | Source |
|---|---|
| `Dockerfile` | upstream `/Dockerfile` (multi-stage Go build) |
| `go.work` | upstream `/go.work`, **trimmed** to the six modules below |
| `go.work.sum` | upstream `/go.work.sum` (kept verbatim — extra checksums are harmless) |
| `libs/errors/` | upstream `/libs/errors/` |
| `libs/httputil/` | upstream `/libs/httputil/` |
| `libs/jwtutil/` | upstream `/libs/jwtutil/` (required by api-gateway's JWT middleware) |
| `libs/logging/` | upstream `/libs/logging/` |
| `libs/testutil/` | upstream `/libs/testutil/` (transitively required by api-gateway tests) |
| `services/api-gateway/` | upstream `/services/api-gateway/` |

## What is NOT vendored

The upstream repo's other six services. `services/identity/` (vendored separately) covers identity-service; the others are not needed for touchline.

## Source revision

- **Upstream repo**: <https://github.com/jedi-knights/identity-platform-go>
- **Source SHA**: `48865905ef13c8c266a34f6a3efa157c29980ecd`
- **Vendored on**: 2026-06-13

## Build verification

```bash
docker buildx build --build-arg SERVICE_NAME=api-gateway \
  -t touchline-gateway:vendor-test services/gateway
docker run --rm touchline-gateway:vendor-test --help
```

The binary prints _"api-gateway is a production-grade HTTP reverse proxy..."_.

## Touchline configuration

Touchline drives the gateway through its own `gateway.yaml` (added in the
compose PR) rather than the upstream default. Notable choices for touchline:

- **Auth disabled** — Auth.js v5 cookies handle session validation; gateway
  JWT validation would conflict with the credentials flow.
- **CORS disabled** — touchline serves the UI and API actions from the same
  origin; CORS headers aren't needed.
- **Rate limiting enabled** — token bucket, keyed by source IP. Primary
  reason this gateway is in the stack (closes the OWASP A06 gap).
- **Compression enabled** — gzip on JSON / HTML responses.
- **Single catch-all route** — `/` proxies to the internal Next.js app.

## Re-vendoring

To pull a newer upstream revision, mirror the procedure in
`services/identity/VENDORED.md`. The two vendor trees are independent; you
can update either without touching the other.
