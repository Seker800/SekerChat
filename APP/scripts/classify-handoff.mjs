#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

function has(content, regex) {
  return regex.test(content);
}

function match(content, regex) {
  return content.match(regex)?.[1]?.trim() ?? null;
}

export function classifyHandoffContent(content, reportPath = '<memory>') {
  const checks = {
    implementationReport: has(content, /^#\s*CODING REPORT/m),
    statusSection: has(content, /^##\s*Status/m),
    selfReviewSection: has(content, /^##\s*Self-review/m),
    selfReviewResult: match(content, /^-\s*Result:\s*(PASS|NEEDS_REWORK|FAIL)(?:\s+WITH.+)?\s*$/mi),
    recommendedNextStep: has(content, /^##\s*Recommended next step/m),
    handoffTarget: match(content, /^-\s*Hand off to:\s*`?([^`\n]+)`?\s*$/mi),
    validationSection: has(content, /^##\s*Validation/m),
    staticValidationEvidence: has(content, /typecheck|build/i),
    runtimeValidationEvidence: has(content, /runtime validation|runtime smoke|DB-backed|WebSocket|curl http:\/\/localhost/i),
    environmentBlocked: has(content, /P1001|Can't reach database server|docker socket|env(?:ironment)? blocked|环境阻塞|localhost:5432|localhost:3000|localhost:3001/i),
    explicitNotDone: has(content, /未.*标记.*done|not mark(?:ed)? .*done|not treated as done/i),
  };

  const missing = [];
  if (!checks.implementationReport) missing.push('implementation report header');
  if (!checks.selfReviewSection) missing.push('self-review section');
  if (!checks.selfReviewResult) missing.push('self-review result');
  if (!checks.recommendedNextStep) missing.push('recommended next step');
  if (!checks.validationSection) missing.push('validation section');

  let classification = 'invalid_handoff';
  let reason = 'missing required handoff structure';

  const structurallyValid = missing.length === 0;
  const selfReviewPass = checks.selfReviewResult === 'PASS';

  if (structurallyValid && selfReviewPass) {
    if (checks.environmentBlocked && checks.staticValidationEvidence && checks.runtimeValidationEvidence) {
      classification = 'env_blocked_handoff';
      reason = 'report is complete and self-review passed, but fresh runtime validation appears environment-blocked';
    } else {
      classification = 'valid_handoff';
      reason = 'report is complete, self-review passed, and validation evidence is present';
    }
  } else if (structurallyValid && checks.selfReviewResult === 'NEEDS_REWORK') {
    classification = 'invalid_handoff';
    reason = 'self-review says NEEDS_REWORK';
  }

  return {
    ok: classification !== 'invalid_handoff',
    classification,
    reason,
    reportPath,
    checks,
    missing,
  };
}

export function classifyHandoffFile(reportPath) {
  const absolutePath = path.resolve(process.cwd(), reportPath);
  const content = readFileSync(absolutePath, 'utf8');
  return classifyHandoffContent(content, absolutePath);
}

function usage() {
  console.error('Usage: node scripts/classify-handoff.mjs <implementation-report.md>');
  process.exit(2);
}

const isEntrypoint = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isEntrypoint) {
  const reportPath = process.argv[2];
  if (!reportPath) usage();

  let output;
  try {
    output = classifyHandoffFile(reportPath);
  } catch (error) {
    console.error(JSON.stringify({
      ok: false,
      error: `Failed to read report: ${path.resolve(process.cwd(), reportPath)}`,
      detail: error instanceof Error ? error.message : String(error),
    }, null, 2));
    process.exit(2);
  }

  console.log(JSON.stringify(output, null, 2));

  if (output.classification === 'valid_handoff') process.exit(0);
  if (output.classification === 'env_blocked_handoff') process.exit(10);
  process.exit(1);
}
