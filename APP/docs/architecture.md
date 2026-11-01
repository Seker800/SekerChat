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

### Client state and message consistency

The React Query cache owns the loaded message timeline. `lib/message-timeline.ts`
centralizes latest-page refresh, older-page merge, realtime insertion, loaded-message
patching, and local-send confirmation. Refresh preserves loaded history, the oldest
pagination cursor, failed/pending sends and stable render keys. Offline gaps are
read through HTTP until the last HTTP-covered message is reached; live events do
not advance that boundary. A realtime event alone is never a complete initial page.
Events racing the initial HTTP read are buffered as explicitly partial data.

Commands carry the group ID captured when submitted; completion handlers update
that group's cache even after navigation. Text drafts belong to individual
conversations for the lifetime of the workspace. Settings forms store edited fields
separately from server snapshots, so background updates cannot overwrite dirty
input, and earlier saves cannot clear newer edits. Drafts are not persisted across
page reloads or logout.

### Authentication

Browser sessions use secure HttpOnly cookies. CLI and device clients use explicit token contracts. Long-lived credentials must not appear in URLs or logs.

### Download diagnostics

The independent `download-logs` module observes content response streams without business-module dependencies.
Browser original previews report bounded, authenticated client measurements through a diagnostic endpoint;
client measurements remain untrusted and separate from server stream observations. Cookie-session native
downloads use existing content routes without buffering whole files in JavaScript. Diagnostic storage is a
bounded, daily JSONL journal on a persistent application log mount, retained for 30 days. Storage failures
must not change download results. This journal assumes one active backend writer and is not business or audit
state. Manual inspection and measurement limitations are documented in [download diagnostics](./download-diagnostics.md).

### Article views

Articles have no acknowledgement requirement or read/unread workflow. Opening a
published article records the authenticated viewer through `PUT /subscriptions/:postId/view`;
GET requests and list previews do not record views. `SubscriptionPostView` owns one
row per article/user, with an immutable first-view timestamp. The displayed view
count is the number of distinct viewers; repeat opens do not increase it. The
article footer lists viewers with their current avatar/name and first-view date.

The database composite primary key handles concurrent retries. A shared article
row lock coordinates recording with withdrawal/deletion. A newly recorded viewer
and its `viewed` outbox event commit together; existing subscription query
invalidation refreshes lists and details. Deprecated confirmation/read routes
remain as compatibility adapters: actual opens map to views, mark-unread and
mark-all-read cannot erase or manufacture viewer history. Old acknowledgement
counters return zero and never drive navigation.

## Deployment rule

Application release and database migration are separate operations. The target model is an app-only production compose for frontend and backend, with PostgreSQL and MinIO managed as persistent data services outside normal application replacement commands. Until the deployment migration is complete, `docs/synology-deployment.md` documents the actual production procedure.

## Decision records

### Personal group notifications

Group mute is a core per-member preference, independent of external message sources. It suppresses alerts while preserving message delivery and unread state; reminder WS and pull paths share the persisted preference and resume cutoff. See [ADR 0007](./adr/0007-group-notification-preferences.md) and [local verification](./group-notifications.md).

### Optional QQ bridge extension

QQ group synchronization is a built-in optional module. A separate connector subscribes directly to NapCat and calls scoped integration APIs; AstrBot is not its upstream. Core messages expose optional external-author snapshots without creating login accounts for QQ members. Outgoing delivery intent is recorded in the message transaction through a narrow registration port; provider calls happen only in the connector. Ambiguous provider results require reconciliation instead of automatic resend. The extension and all bindings start disabled. See [ADR 0006](./adr/0006-qq-bridge-extension.md) and [local verification](./qq-bridge.md). Released as v0.9.19 to Synology on 2026-10-18, with a separate persistent connector on the NapCat host and QQ-to-Chat only enabled. See [production verification](./qq-bridge-production-2026-10-18.md).

Architectural decisions live in [`docs/adr`](./adr). Reversing an accepted decision requires a replacement ADR rather than silently changing this document.

## Refresh ownership and cost

React Query owns query deduplication and cached snapshots. Minute-scale attendance
checks fetch only the current day; the 30/365-day panels are immutable snapshots
until a local mutation or day transition invalidates them. The client projects the
new day state over loaded history, using server-provided totals and workday counts
for averages. Historical snapshots win over an older live response. Visibility
restoration reconciles small current-state queries, while hidden realtime
invalidations are retained and coalesced until the view returns. Changes arriving
during a read schedule one trailing read instead of canceling and overlapping HTTP.

Article view events refresh one article and patch its count in loaded list pages;
they do not invalidate every subscription page. Structural article changes still
reconcile the lists because ordering and membership may change. Album polling
shares one minute-scale revision query between the sidebar and page. Uploads,
deletions, tag edits and completed thumbnails advance the existing album revision
inside their business transaction; unchanged polls add no revision writes.

Media queue producers publish narrow post-commit in-process hints. Workers and
Outbox retain serialized processing, durable retries and heartbeat/lease recovery.
Empty media fallback polls back off from 10 to at most 60 seconds; new media work
bypasses the delay through a coalesced hint. Outbox keeps its 10-second fallback,
using a read-only readiness probe before opening a claim transaction. These hints assume the single active backend
above, are not durable facts, and never replace the database recovery path. No
PostgreSQL notification listener or per-poll database write is introduced.
