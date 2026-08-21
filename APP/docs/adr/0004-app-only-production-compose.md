# ADR 0004: Make application deployment app-only

- Status: Accepted
- Date: 2026-08-11

## Decision

The final production release entry point manages only frontend and backend containers. PostgreSQL and MinIO remain persistent data services outside ordinary application replacement commands. Database migrations run as an explicit pre-deployment job.

## Why

An application deployment command must not be able to stop, recreate, or delete the production data plane. Running migrations inside backend startup also couples availability and schema changes in a way that makes rollback unclear.

## Consequences

The migration to app-only compose is staged and documented in the deployment runbook. Existing data containers and networks are adopted, not recreated. Application rollback is permitted only to a version compatible with the already-applied schema.
