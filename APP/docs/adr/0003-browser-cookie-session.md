# ADR 0003: Separate browser and machine authentication

- Status: Accepted
- Date: 2026-08-11

## Decision

Browser clients use HttpOnly cookie sessions and never receive access or refresh tokens in JavaScript-visible storage. CLI and device clients use explicit token endpoints with independently documented lifetimes and revocation.

## Why

Returning browser tokens while also setting cookies creates two competing session contracts and exposes long-lived credentials to browser JavaScript. Machine clients cannot use the same cookie-only flow reliably.

## Consequences

Migration uses compatibility endpoints before legacy removal. State-changing browser requests require Origin/CSRF protection. Device credentials must not be placed in URLs or logs.
