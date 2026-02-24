# Backend Files You Still Need (JSON + Server)

To make this a real UMN-only Omegle-style app with fewer security issues, you need a backend. Suggested structure:

## Core app files

- `.env.example` (document secrets and config)
- `server/package.json` (backend scripts + deps)
- `server/src/index.ts` (HTTP server bootstrap)
- `server/src/app.ts` (Express/Fastify app config)
- `server/src/routes/auth.ts` (send OTP, verify OTP, logout)
- `server/src/routes/match.ts` (join queue, next match, filters)
- `server/src/routes/moderation.ts` (report/block endpoints)
- `server/src/ws/signaling.ts` (WebSocket/WebRTC signaling)
- `server/src/middleware/auth.ts` (session auth)
- `server/src/middleware/rateLimit.ts` (OTP/chat/match throttling)
- `server/src/middleware/validate.ts` (schema validation)
- `server/src/lib/email.ts` (OTP email sending provider)
- `server/src/lib/redis.ts` (queue/presence/OTP temp storage)
- `server/src/lib/turn.ts` (short-lived TURN credentials)
- `server/src/lib/logger.ts` (redacted structured logs)

## JSON/config files

- `server/config/allowedEmailDomains.json` (server-side source of truth, e.g. `umn.edu`)
- `server/config/moderationRules.json` (blocked terms / rate rules / policy toggles)
- `server/config/matchmaking.json` (queue TTLs, reconnect timeout, max session length)

## Data / schema files

- `server/prisma/schema.prisma` or `server/db/migrations/*` (database schema)
- `server/src/db/queries/*.ts` (typed DB access)

## Infra / ops files

- `docker-compose.yml` (db + redis + app for local dev)
- `server/Dockerfile`
- `.github/workflows/ci.yml` (lint/test/security scan)
- `server/openapi.json` (optional but useful for clients and testing)
- `server/README.md` (local run instructions for signaling + room calls)

## Security-specific extras worth adding

- `server/src/security/csrf.ts`
- `server/src/security/contentScan.ts`
- `server/src/security/ipReputation.ts` (or provider adapter)
- `server/src/security/sessionStore.ts`
- `server/test/security/*.test.ts`

Client-side domain checks are helpful UX, but only the server-side allowlist actually enforces UMN-only access.
