# Dependency risk register

This register documents narrowly accepted dependency advisories. The CI gate fails if an entry changes or if
any additional high/critical vulnerability appears.

## GHSA-ggr8-5vv4-36mx

- Status: temporarily accepted
- Affected chain: `prisma -> @prisma/config -> deepmerge-ts@7.1.5`
- Impact: stack exhaustion when recursively merging a cyclic object graph
- Exposure: Prisma configuration and migration tooling; application HTTP input is not passed to this merge API
- Current constraint: Prisma 6.19.3 and the current Prisma 7 release both pin `deepmerge-ts@7.1.5`
- Unsafe automated fix: `npm audit fix --force` proposes downgrading Prisma to 6.12.0
- Compensating controls: migration/configuration is maintainer-controlled; CI accepts only this exact advisory
  chain and rejects all other High/Critical findings
- Removal condition: upgrade when Prisma publishes a compatible release using `deepmerge-ts>=8.0.0`, then delete
  this exception and restore a zero-exception audit gate
- Review by: 2026-10-01, or immediately after the next Prisma release

Reference: [GitHub Advisory GHSA-ggr8-5vv4-36mx](https://github.com/advisories/GHSA-ggr8-5vv4-36mx)
