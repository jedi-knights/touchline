# Vendored from identity-platform-go

This directory is a **vendored subset** of
[`jedi-knights/identity-platform-go`](https://github.com/jedi-knights/identity-platform-go),
not a git submodule and not a Go module that depends on the upstream repo.

## What is vendored

Only the pieces required to build and run **`identity-service`** alone:

| Path | Source |
|---|---|
| `Dockerfile` | upstream `/Dockerfile` (multi-stage Go build, picks the service via `SERVICE_NAME` arg) |
| `go.work` | upstream `/go.work`, **trimmed** to the four modules below |
| `go.work.sum` | upstream `/go.work.sum` (kept verbatim — extra checksums are harmless) |
| `libs/errors/` | upstream `/libs/errors/` |
| `libs/httputil/` | upstream `/libs/httputil/` |
| `libs/logging/` | upstream `/libs/logging/` |
| `services/identity-service/` | upstream `/services/identity-service/` |

## What is NOT vendored

The upstream repo's other six services (`auth-server`, `api-gateway`,
`authorization-policy-service`, `client-registry-service`,
`example-resource-service`, `token-introspection-service`) and the libs
they pull in (`jwtutil`, `testutil`).

Touchline only needs credential validation today — it keeps Auth.js v5
in front for session cookies. If a future need calls for OAuth2 token
issuance, vendor `auth-server` and its `libs/jwtutil` dependency at
that time.

## Source revision

- **Upstream repo**: <https://github.com/jedi-knights/identity-platform-go>
- **Source SHA**: `48865905ef13c8c266a34f6a3efa157c29980ecd`
- **Upstream message at vendor time**: `feat(api-gateway): add MCP tool-routing capability with Anthropic Claude decider`
- **Vendored on**: 2026-06-13

## Re-vendoring

To pull a newer upstream revision:

```bash
git clone https://github.com/jedi-knights/identity-platform-go /tmp/identity-platform-go
cd /tmp/identity-platform-go && git log -1 --format='%H'   # record the new SHA

# Overwrite the vendored files from this repo's root
rm -rf services/identity/{libs,services,go.work,go.work.sum,Dockerfile}
cp -R /tmp/identity-platform-go/Dockerfile services/identity/
cp /tmp/identity-platform-go/go.work services/identity/
cp /tmp/identity-platform-go/go.work.sum services/identity/
mkdir -p services/identity/libs services/identity/services
cp -R /tmp/identity-platform-go/libs/errors services/identity/libs/
cp -R /tmp/identity-platform-go/libs/httputil services/identity/libs/
cp -R /tmp/identity-platform-go/libs/logging services/identity/libs/
cp -R /tmp/identity-platform-go/services/identity-service services/identity/services/

# Re-trim go.work (see top of file) and update this VENDORED.md with the new SHA.
# Rebuild to verify:
docker buildx build --build-arg SERVICE_NAME=identity-service \
  -t touchline-identity:vendor-test services/identity
```

## Build verification

The vendored tree was confirmed to build cleanly via:

```bash
docker buildx build --build-arg SERVICE_NAME=identity-service \
  -t touchline-identity:vendor-test services/identity
docker run --rm touchline-identity:vendor-test --help
```

The binary prints `User Authentication and Identity Management Service`.

## Why this is vendored, not a submodule

- Touchline needs to evolve with the platform on its own cadence — the
  vendored snapshot is a deliberate, reviewable change.
- Container builds don't need internet access at build time once vendored.
- Diffing the upstream repo against `services/identity/` is the fastest
  way to see what touchline is running.
