# Dependency risk register

This register documents narrowly accepted dependency advisories. The CI gate fails if an entry changes or if
any additional high/critical vulnerability appears.

## GHSA-ggr8-5vv4-36mx

- Status: temporarily accepted
- Affected chain: `prisma -> @prisma/config -> deepmerge-ts@7.1.5`
- Impact: stack exhaustion when recursively merging a cyclic object graph
- Exposure: Prisma configuration and migration tooling; application HTTP input is not passed to this merge API
- Current constraint: installed Prisma 6.19.3 pins `deepmerge-ts@7.1.5`; the audit recommends Prisma 7.10.1, a major upgrade requiring its own compatibility and migration validation.
- Unsafe automated fix: `npm audit fix --force` proposes downgrading Prisma to 6.12.0
- Compensating controls: migration/configuration is maintainer-controlled; CI accepts only this exact advisory
  chain and rejects all other High/Critical findings
- Removal condition: upgrade when Prisma publishes a compatible release using `deepmerge-ts>=8.0.0`, then delete
  this exception and restore a zero-exception audit gate
- Reviewed: 2026-10-22 against the installed lockfile and GHSA advisory; HTTP input still cannot supply recursive configuration object graphs.
- Review by: 2026-11-21, or immediately when upgrading Prisma.
- The existing audit gate remains restricted to this exact chain; Markdown and Vite advisories are fixed by compatible patch upgrades rather than added to the exception.
- 2026-10-23 release preparation: upgraded the locked DOMPurify dependency from 3.4.13 to 3.4.17, the upstream patch for the newly reported sanitization advisories. No additional audit exception was added.

Reference: [GitHub Advisory GHSA-ggr8-5vv4-36mx](https://github.com/advisories/GHSA-ggr8-5vv4-36mx)
