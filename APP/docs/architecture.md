# SekerChat Architecture

This document is the architectural source of truth for the current application. Environment-specific commands remain in the environment and deployment runbooks.

## North star

SekerChat remains a modular monolith. React provides the client, NestJS owns business rules, PostgreSQL is the business source of truth, and MinIO stores objects. Realtime delivery, bot calls, thumbnails, image analysis, and notifications are retryable effects; none of them may redefine whether a business write succeeded.

The main workspace keeps four stable product regions: `server栏 / 频道栏 / 消息栏 / 信息栏`.

## Runtime boundaries

- Production runs on Synology with frontend, backend, PostgreSQL, and MinIO.
- Development runs entirely on the local machine and local Docker data services.
- Production data can only flow outward through an export copied to local development; development code never writes to production data services.
- The production backend is currently a single active instance. Any in-memory coordination that depends on this assumption must state it explicitly and must not be used for durable business state.

## Module direction

```text
HTTP / WebSocket adapters
        ↓
Application services
        ↓
Domain rules and narrow ports
        ↓
Prisma repositories / MinIO gateway / external adapters
```

Business modules may publish through narrow ports. They must not depend on the complete Realtime service, another module's controller, or infrastructure implementation details.

## Data and event rules

1. PostgreSQL is authoritative for messages, membership, server/channel state, uploads, subscriptions, and durable work.
2. User-retryable commands carry an idempotency key.
3. Database changes and durable event intent commit in one transaction through a PostgreSQL outbox.
4. Outbox delivery is at least once; consumers deduplicate with the event ID.
5. Calls to an external provider without a documented idempotency contract use a durable delivery claim. Generated results are persisted before local delivery; an ambiguous external call is not issued automatically a second time.
6. MinIO and PostgreSQL changes use a recoverable state machine or saga. The system does not claim a cross-system ACID transaction.
7. Schema changes use expand, backfill, compatibility, and contract phases. Destructive cleanup is released separately.

### Server identity

`Server.id` is the stable workspace identity. Non-DM groups belong to a Server through `Group.serverId`; Server names are mutable display data. During the compatibility release, `Group.category` and `Category` remain available only for old clients and rollback. Navigation, cache keys, avatar object keys, rename, and archive actions use the stable ID. See [ADR 0005](./adr/0005-stable-server-identity.md) and the [migration runbook](./server-identity-migration.md).

## Principal flows

### Message

The API validates membership and content, commits the message and outbox event, then a worker publishes Realtime and bot effects. Reconnect-based query invalidation is the final consistency fallback.

### Upload

The backend creates a multipart session, receives parts through the same-origin API proxy, completes the MinIO object, and finalizes database references through a recoverable state machine. Cleanup must prove an object has no database reference before deletion.

### Realtime

WebSocket is a delivery optimization, not the fact source. Realtime events use versioned shared contracts. A dropped or duplicated event must be recoverable by reading PostgreSQL-backed HTTP APIs.

### Authentication

Browser sessions use secure HttpOnly cookies. CLI and device clients use explicit token contracts. Long-lived credentials must not appear in URLs or logs.

## Deployment rule

Application release and database migration are separate operations. The target model is an app-only production compose for frontend and backend, with PostgreSQL and MinIO managed as persistent data services outside normal application replacement commands. Until the deployment migration is complete, `docs/synology-deployment.md` documents the actual production procedure.

## Decision records

Architectural decisions live in [`docs/adr`](./adr). Reversing an accepted decision requires a replacement ADR rather than silently changing this document.
