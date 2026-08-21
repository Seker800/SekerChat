import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const appRoot = join(scriptDirectory, '..');

function readPackage(relativePath) {
  return JSON.parse(readFileSync(join(appRoot, relativePath, 'package.json'), 'utf8'));
}

export function validateReleaseVersion(requestedTag, packages) {
  if (!/^v\d+\.\d+\.\d+$/.test(requestedTag)) {
    throw new Error('release tag must use v<major>.<minor>.<patch> without prerelease suffixes');
  }

  const packageVersion = packages[0]?.version;
  if (!packageVersion) {
    throw new Error('release package list is empty');
  }

  const mismatches = packages
    .filter((entry) => entry.version !== packageVersion)
    .map((entry) => `${entry.name}=${entry.version}`);
  if (mismatches.length > 0) {
    throw new Error(`workspace version mismatch: ${mismatches.join(', ')}`);
  }

  if (requestedTag !== `v${packageVersion}`) {
    throw new Error(`release tag ${requestedTag} does not match package version ${packageVersion}`);
  }

  return requestedTag;
}

export function validateReleaseVersionAvailability(requestedTag, { tagExists, artifactPaths }) {
  if (tagExists) {
    throw new Error(`Git tag ${requestedTag} already exists; release tags are immutable`);
  }
  if (artifactPaths.length > 0) {
    throw new Error(`release artifacts already exist for ${requestedTag}: ${artifactPaths.join(', ')}`);
  }
  return requestedTag;
}

function findExistingReleaseArtifacts(outputDirectory, requestedTag) {
  const expectedNames = new Set([
    `sekerchat-frontend-${requestedTag}.tar.gz`,
    `sekerchat-backend-${requestedTag}.tar.gz`,
    `sekerchat-${requestedTag}.sha256`,
    `sekerchat-${requestedTag}.release.env`,
  ]);
  if (!existsSync(outputDirectory)) return [];
  return readdirSync(outputDirectory).filter((name) => expectedNames.has(name)).sort();
}

export function readReleasePackages() {
  const rootPackage = readPackage('.');
  const workspacePackages = rootPackage.workspaces.map((workspacePath) => readPackage(workspacePath));
  return [rootPackage, ...workspacePackages].map(({ name, version }) => ({ name, version }));
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : '';
if (import.meta.url === invokedPath) {
  const packages = readReleasePackages();
  const requestedTag = process.argv[2] || `v${packages[0].version}`;
  const version = validateReleaseVersion(requestedTag, packages);
  if (process.argv[3] === '--ensure-fresh') {
    const outputDirectory = resolve(appRoot, process.argv[4] || '.deploy-artifacts');
    const tagExists = execFileSync('git', ['tag', '--list', version], {
      cwd: appRoot,
      encoding: 'utf8',
    }).trim().length > 0;
    validateReleaseVersionAvailability(version, {
      tagExists,
      artifactPaths: findExistingReleaseArtifacts(outputDirectory, version),
    });
  }
  process.stdout.write(`${version}\n`);
}
