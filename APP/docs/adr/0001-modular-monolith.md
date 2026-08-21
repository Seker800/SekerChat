# ADR 0001: Keep a modular monolith

- Status: Accepted
- Date: 2026-08-11

## Decision

Keep one NestJS backend deployment and enforce module boundaries through application services and narrow ports. Do not split services merely to reduce file size or hide dependency cycles.

## Why

SekerChat runs as a small Synology deployment. Separate services would add network failure modes, deployment coordination, and operational cost without removing the current coupling. The durable boundaries needed today can be expressed inside the monolith.

## Consequences

Modules must not directly reach into another module's repositories or controllers. Cross-module effects use explicit application services or ports. A future service extraction is justified only by measured scaling, isolation, or ownership needs.
