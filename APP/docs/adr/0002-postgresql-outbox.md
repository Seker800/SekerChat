# ADR 0002: Use a PostgreSQL transactional outbox

- Status: Accepted
- Date: 2026-08-11

## Decision

Persist durable event intent in PostgreSQL in the same transaction as the business change. A worker delivers Realtime, bot, notification, and asynchronous processing effects at least once.

## Why

Publishing after a commit can lose an event when the process exits. Publishing before a commit can expose state that is not yet readable. PostgreSQL is already the source of truth and is sufficient for the current workload.

## Consequences

Consumers deduplicate by event ID. Failed deliveries use bounded exponential backoff and observable dead-letter state. This decision does not introduce Kafka or Redis.
