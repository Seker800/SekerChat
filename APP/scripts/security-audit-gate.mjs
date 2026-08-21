import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const acceptedAdvisory = 'GHSA-ggr8-5vv4-36mx';
const acceptedPackages = ['@prisma/config', 'deepmerge-ts', 'prisma'];
const severeLevels = new Set(['high', 'critical']);

function assertExactStrings(actual, expected, label) {
  const normalized = Array.isArray(actual) ? [...actual].sort() : [];
  if (JSON.stringify(normalized) !== JSON.stringify([...expected].sort())) {
    throw new Error(`${label} does not match the registered dependency chain`);
  }
}

export function validateAuditReport(report) {
  const vulnerabilities = report?.vulnerabilities;
  if (!vulnerabilities || typeof vulnerabilities !== 'object') {
    throw new Error('npm audit returned an unsupported report');
  }

  const severeEntries = Object.entries(vulnerabilities).filter(([, vulnerability]) =>
    severeLevels.has(vulnerability?.severity),
  );
  if (severeEntries.length === 0) {
    return { acceptedAdvisories: [] };
  }

  const severeNames = severeEntries.map(([name]) => name).sort();
  if (JSON.stringify(severeNames) !== JSON.stringify([...acceptedPackages].sort())) {
    throw new Error(`Unexpected high/critical vulnerabilities: ${severeNames.join(', ')}`);
  }

  const prismaConfig = vulnerabilities['@prisma/config'];
  const deepmerge = vulnerabilities['deepmerge-ts'];
  const prisma = vulnerabilities.prisma;

  assertExactStrings(prismaConfig.via, ['deepmerge-ts'], '@prisma/config via');
  assertExactStrings(prismaConfig.effects, ['prisma'], '@prisma/config effects');
  assertExactStrings(deepmerge.effects, ['@prisma/config'], 'deepmerge-ts effects');
  assertExactStrings(prisma.via, ['@prisma/config'], 'prisma via');

  if (prismaConfig.isDirect !== false || deepmerge.isDirect !== false || prisma.isDirect !== true) {
    throw new Error('Dependency directness does not match the registered Prisma advisory chain');
  }

  const advisoryUrls = Array.isArray(deepmerge.via)
    ? deepmerge.via.filter((item) => item && typeof item === 'object').map((item) => item.url)
    : [];
  if (
    advisoryUrls.length !== 1 ||
    advisoryUrls[0] !== `https://github.com/advisories/${acceptedAdvisory}`
  ) {
    throw new Error('deepmerge-ts advisory does not match the registered risk');
  }

  return { acceptedAdvisories: [acceptedAdvisory] };
}

function main() {
  const npmExecutable = process.platform === 'win32' ? (process.env.ComSpec ?? 'cmd.exe') : 'npm';
  const npmArguments =
    process.platform === 'win32' ? ['/d', '/s', '/c', 'npm.cmd audit --json'] : ['audit', '--json'];
  const audit = spawnSync(npmExecutable, npmArguments, {
    cwd: appRoot,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  });

  if (audit.error) {
    throw audit.error;
  }

  let report;
  try {
    report = JSON.parse(audit.stdout);
  } catch {
    throw new Error(`npm audit did not return JSON: ${audit.stderr || audit.stdout}`);
  }

  const result = validateAuditReport(report);
  if (result.acceptedAdvisories.length === 0) {
    console.log('Dependency audit passed with no high or critical vulnerabilities.');
    return;
  }

  console.warn(
    `Dependency audit passed with registered temporary risk: ${result.acceptedAdvisories.join(', ')}.`,
  );
  console.warn('See docs/dependency-risk-register.md for scope and removal conditions.');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
