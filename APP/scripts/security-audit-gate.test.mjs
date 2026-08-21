import assert from 'node:assert/strict';
import test from 'node:test';

import { validateAuditReport } from './security-audit-gate.mjs';

function knownPrismaReport() {
  return {
    auditReportVersion: 2,
    vulnerabilities: {
      '@prisma/config': {
        name: '@prisma/config',
        severity: 'high',
        isDirect: false,
        via: ['deepmerge-ts'],
        effects: ['prisma'],
      },
      'deepmerge-ts': {
        name: 'deepmerge-ts',
        severity: 'high',
        isDirect: false,
        via: [
          {
            url: 'https://github.com/advisories/GHSA-ggr8-5vv4-36mx',
            severity: 'high',
            range: '<8.0.0',
          },
        ],
        effects: ['@prisma/config'],
      },
      prisma: {
        name: 'prisma',
        severity: 'high',
        isDirect: true,
        via: ['@prisma/config'],
        effects: [],
      },
    },
  };
}

test('audit gate accepts only the registered Prisma deepmerge advisory chain', () => {
  assert.deepEqual(validateAuditReport(knownPrismaReport()), {
    acceptedAdvisories: ['GHSA-ggr8-5vv4-36mx'],
  });
});

test('audit gate rejects an additional high-severity vulnerability', () => {
  const report = knownPrismaReport();
  report.vulnerabilities['unexpected-package'] = {
    name: 'unexpected-package',
    severity: 'high',
    isDirect: true,
    via: [{ url: 'https://example.test/GHSA-unexpected' }],
    effects: [],
  };

  assert.throws(() => validateAuditReport(report), /unexpected-package/);
});

test('audit gate rejects drift in the registered advisory chain', () => {
  const report = knownPrismaReport();
  report.vulnerabilities['deepmerge-ts'].via[0].url =
    'https://github.com/advisories/GHSA-replacement';

  assert.throws(() => validateAuditReport(report), /does not match/);
});
