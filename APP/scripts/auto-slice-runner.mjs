#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { classifyHandoffContent } from './classify-handoff.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..', '..');

const defaults = {
  mode: 'inspect',
  format: 'json',
  dryRun: false,
  projectRoot,
  statusFile: path.join(projectRoot, '50-handoff/status.md'),
  handoffFile: path.join(projectRoot, '50-handoff/handoff.md'),
  todoFile: path.join(projectRoot, '50-handoff/TODO.md'),
  stateFile: path.join(projectRoot, '50-handoff/auto-slice-runner-state.json'),
  triggerFile: path.join(projectRoot, '50-handoff/auto-slice-trigger.json'),
  taskContractFile: path.join(projectRoot, '10-开发合同/README.md'),
  buildNotesDir: path.join(projectRoot, '30-build/notes'),
  reviewReportsDir: path.join(projectRoot, '40-review/reports'),
};

function usage() {
  console.error(`Usage:
  node scripts/auto-slice-runner.mjs inspect [--format json|text]
  node scripts/auto-slice-runner.mjs run [--dry-run] [--format json|text]
  node scripts/auto-slice-runner.mjs advance [--dry-run] [--format json|text]

Optional path overrides:
  --project-root <path>
  --status-file <path>
  --handoff-file <path>
  --todo-file <path>
  --state-file <path>
  --trigger-file <path>
  --task-contract-file <path>
  --build-notes-dir <path>
  --review-reports-dir <path>`);
  process.exit(2);
}

function parseArgs(argv) {
  const config = { ...defaults };
  const args = [...argv];
  const maybeMode = args[0];
  if (maybeMode === 'inspect' || maybeMode === 'run' || maybeMode === 'advance') {
    config.mode = args.shift();
  }

  while (args.length > 0) {
    const arg = args.shift();
    if (arg === '--dry-run') {
      config.dryRun = true;
      continue;
    }
    if (arg === '--format') {
      config.format = args.shift() ?? usage();
      continue;
    }
    if (arg === '--project-root') {
      config.projectRoot = path.resolve(args.shift() ?? usage());
      continue;
    }
    if (arg === '--status-file') {
      config.statusFile = path.resolve(args.shift() ?? usage());
      continue;
    }
    if (arg === '--handoff-file') {
      config.handoffFile = path.resolve(args.shift() ?? usage());
      continue;
    }
    if (arg === '--todo-file') {
      config.todoFile = path.resolve(args.shift() ?? usage());
      continue;
    }
    if (arg === '--state-file' || arg === '--ledger-file') {
      config.stateFile = path.resolve(args.shift() ?? usage());
      continue;
    }
    if (arg === '--trigger-file') {
      config.triggerFile = path.resolve(args.shift() ?? usage());
      continue;
    }
    if (arg === '--task-contract-file') {
      config.taskContractFile = path.resolve(args.shift() ?? usage());
      continue;
    }
    if (arg === '--build-notes-dir') {
      config.buildNotesDir = path.resolve(args.shift() ?? usage());
      continue;
    }
    if (arg === '--review-reports-dir') {
      config.reviewReportsDir = path.resolve(args.shift() ?? usage());
      continue;
    }
    usage();
  }

  if (config.format !== 'json' && config.format !== 'text') usage();
  if (config.mode === 'advance') config.mode = 'run';
  return config;
}

function readText(filePath) {
  return readFileSync(filePath, 'utf8');
}

function readOptionalJson(filePath) {
  if (!existsSync(filePath)) return null;
  try {
    return JSON.parse(readText(filePath));
  } catch {
    return null;
  }
}

function sha256(content) {
  return createHash('sha256').update(content).digest('hex');
}

function parseTaskContractSlices(content) {
  const slices = [];
  const regex = /^##\s*Slice\s+(\d+)\s+[—-]\s+(.+)$/gm;
  let match;
  while ((match = regex.exec(content)) !== null) {
    slices.push({
      number: Number(match[1]),
      title: match[2].trim(),
      label: `Slice ${match[1]} — ${match[2].trim()}`,
    });
  }
  return slices;
}

function parseStatus(content) {
  const currentSliceLabel = content.match(/^- current_slice:\s*`([^`]+)`/m)?.[1] ?? null;
  const statusValue = content.match(/^- status:\s*`([^`]+)`/m)?.[1] ?? null;
  const sliceMatch = currentSliceLabel?.match(/^Slice\s+(\d+)\s+[—-]\s+(.+)$/);
  if (!currentSliceLabel || !sliceMatch || !statusValue) {
    throw new Error('Failed to parse current_slice/status from status.md');
  }

  return {
    currentSliceLabel,
    currentSliceNumber: Number(sliceMatch[1]),
    currentSliceTitle: sliceMatch[2].trim(),
    statusValue,
  };
}

function findLatestFile(dirPath, matcher) {
  if (!existsSync(dirPath)) return null;
  const files = readdirSync(dirPath)
    .filter((name) => matcher(name))
    .map((name) => path.join(dirPath, name))
    .sort((a, b) => statSync(a).mtimeMs - statSync(b).mtimeMs);
  return files.at(-1) ?? null;
}

function loadImplementationReport(buildNotesDir, sliceNumber) {
  const filePath = path.join(buildNotesDir, `slice-${sliceNumber}-implementation-report.md`);
  if (!existsSync(filePath)) return null;
  const content = readText(filePath);
  const classification = classifyHandoffContent(content, filePath);
  return {
    filePath,
    content,
    sha256: sha256(content),
    classification,
  };
}

function parseReviewReport(filePath) {
  if (!filePath) return null;
  const content = readText(filePath);
  const verdict = content.match(/\*\*(PASS|FAIL|NEEDS_REWORK)\*\*/)?.[1] ?? null;
  return {
    filePath,
    content,
    verdict,
    sha256: sha256(content),
  };
}

function loadReviewReport(reviewReportsDir, sliceNumber) {
  const filePath = findLatestFile(reviewReportsDir, (name) => name.includes(`slice-${sliceNumber}-review-report.md`));
  return parseReviewReport(filePath);
}

function normalizeState(raw) {
  const consumed = {
    implementation: {},
    review: {},
  };

  if (raw?.consumed?.implementation && typeof raw.consumed.implementation === 'object') {
    Object.assign(consumed.implementation, raw.consumed.implementation);
  }
  if (raw?.consumed?.review && typeof raw.consumed.review === 'object') {
    Object.assign(consumed.review, raw.consumed.review);
  }

  if (raw?.lastConsumedArtifact?.path && raw?.currentSlice?.number) {
    const sliceKey = String(raw.currentSlice.number);
    if (raw.lastConsumedArtifact.type === 'implementation_report') {
      consumed.implementation[sliceKey] = {
        sha256: raw.lastConsumedArtifact.sha256 ?? null,
        path: raw.lastConsumedArtifact.path,
        classification: raw.implementationClassification ?? null,
        consumedAt: raw.updatedAt ?? null,
      };
    }
    if (raw.lastConsumedArtifact.type === 'review_report') {
      consumed.review[sliceKey] = {
        sha256: raw.lastConsumedArtifact.sha256 ?? null,
        path: raw.lastConsumedArtifact.path,
        verdict: raw.reviewVerdict ?? null,
        consumedAt: raw.updatedAt ?? null,
      };
    }
  }

  return {
    version: 3,
    updatedAt: raw?.updatedAt ?? null,
    current: raw?.current && typeof raw.current === 'object' ? raw.current : null,
    lastAction: raw?.lastAction && typeof raw.lastAction === 'object' ? raw.lastAction : null,
    pendingAction: raw?.pendingAction && typeof raw.pendingAction === 'object' ? raw.pendingAction : null,
    pendingReviewDispatch: normalizePendingReviewDispatch(raw?.pendingReviewDispatch),
    consumed,
    history: Array.isArray(raw?.history) ? raw.history : [],
  };
}

function normalizePendingReviewDispatch(raw) {
  if (!raw || typeof raw !== 'object') return null;
  if (!raw.dispatchKey || !raw.sliceNumber || !raw.implementation?.sha256) return null;
  return {
    dispatchKey: raw.dispatchKey,
    sliceNumber: raw.sliceNumber,
    sliceLabel: raw.sliceLabel ?? `Slice ${raw.sliceNumber}`,
    status: raw.status ?? 'surfaced',
    surfacedAt: raw.surfacedAt ?? null,
    implementation: {
      filePath: raw.implementation.filePath ?? null,
      sha256: raw.implementation.sha256,
      classification: raw.implementation.classification ?? null,
    },
  };
}

function alreadyConsumed(state, artifactType, sliceNumber, artifactSha) {
  if (!artifactSha) return false;
  const bucket = artifactType === 'review' ? state.consumed.review : state.consumed.implementation;
  return bucket[String(sliceNumber)]?.sha256 === artifactSha;
}

function buildReviewDispatch({ currentSlice, implementationReport, statusFile, handoffFile, taskContractFile }) {
  if (!implementationReport) return null;
  return {
    type: 'dispatch_review',
    dispatchKey: `slice-${currentSlice.number}:${implementationReport.sha256}`,
    slice: {
      number: currentSlice.number,
      label: currentSlice.label,
    },
    implementation: {
      filePath: implementationReport.filePath,
      sha256: implementationReport.sha256,
      classification: implementationReport.classification.classification,
      reason: implementationReport.classification.reason,
    },
    recommendedInputs: [
      statusFile,
      handoffFile,
      taskContractFile,
      implementationReport.filePath,
    ],
    promptHint: `Review ${currentSlice.label} independently and produce a PASS/FAIL/NEEDS_REWORK report.`,
  };
}

function determineReviewSignal({ effectiveSlice, effectivePhase, reviewReport, reviewDispatch, previousPendingReviewDispatch }) {
  if (effectivePhase !== 'in_review' || reviewReport || !reviewDispatch) {
    return {
      signal: 'NO_REPLY',
      pendingReviewDispatch: null,
    };
  }

  const alreadySurfaced = previousPendingReviewDispatch?.dispatchKey === reviewDispatch.dispatchKey
    && previousPendingReviewDispatch?.status === 'surfaced';

  return {
    signal: alreadySurfaced ? 'NO_REPLY' : 'DISPATCH_REVIEW_NOW',
    pendingReviewDispatch: {
      dispatchKey: reviewDispatch.dispatchKey,
      sliceNumber: effectiveSlice.number,
      sliceLabel: effectiveSlice.label,
      status: 'surfaced',
      surfacedAt: new Date().toISOString().slice(0, 10),
      implementation: {
        filePath: reviewDispatch.implementation.filePath,
        sha256: reviewDispatch.implementation.sha256,
        classification: reviewDispatch.implementation.classification,
      },
    },
  };
}

function determineAction({ currentSlice, nextSlice, implementationReport, reviewReport, state }) {
  if (reviewReport?.verdict === 'PASS' && !alreadyConsumed(state, 'review', currentSlice.number, reviewReport.sha256)) {
    return {
      kind: nextSlice ? 'review_pass_to_next_slice' : 'review_pass_to_done',
      artifact: reviewReport,
      targetPhase: nextSlice ? 'in_progress' : 'done',
      nextSlice,
      reply: 'UPDATE',
    };
  }

  if (
    (reviewReport?.verdict === 'FAIL' || reviewReport?.verdict === 'NEEDS_REWORK')
    && !alreadyConsumed(state, 'review', currentSlice.number, reviewReport.sha256)
  ) {
    return {
      kind: 'review_rework',
      artifact: reviewReport,
      targetPhase: 'in_progress',
      nextSlice: null,
      reply: 'UPDATE',
    };
  }

  if (
    implementationReport
    && ['valid_handoff', 'env_blocked_handoff'].includes(implementationReport.classification.classification)
    && !alreadyConsumed(state, 'implementation', currentSlice.number, implementationReport.sha256)
  ) {
    return {
      kind: 'coding_to_review',
      artifact: implementationReport,
      targetPhase: 'in_review',
      nextSlice: null,
      reply: 'UPDATE',
    };
  }

  return null;
}

function determinePendingAction({
  effectiveSlice,
  effectivePhase,
  implementationReport,
  reviewReport,
  reviewSignal,
  nextSlice,
}) {
  if (effectivePhase === 'in_review') {
    return {
      type: reviewSignal === 'DISPATCH_REVIEW_NOW'
        ? 'dispatch_review_now'
        : reviewReport
          ? 'wait_for_new_review_result'
          : 'wait_for_review_result',
      summary: reviewReport
        ? `wait for a new review artifact for ${effectiveSlice.label}`
        : reviewSignal === 'DISPATCH_REVIEW_NOW'
          ? `dispatch review now for ${effectiveSlice.label}`
          : `wait for review result for ${effectiveSlice.label}`,
      reply: 'NO_REPLY',
      checklist: reviewReport
        ? ['Do not consume the same review report twice.', 'Wait for a new review report with a different hash.']
        : reviewSignal === 'DISPATCH_REVIEW_NOW'
          ? ['Read `50-handoff/auto-slice-trigger.json`.', 'Dispatch review once with the provided payload.', 'Do not re-dispatch the same implementation hash.']
          : ['Wait for the reviewer report before running again.', 'Do not re-dispatch the same implementation hash.'],
      command: 'npm run auto-slice:run',
    };
  }

  if (effectivePhase === 'in_progress') {
    if (implementationReport && !['valid_handoff', 'env_blocked_handoff'].includes(implementationReport.classification.classification)) {
      return {
        type: 'wait_for_valid_handoff',
        summary: `wait for a complete coding handoff for ${effectiveSlice.label}`,
        reply: 'NO_REPLY',
        checklist: [
          'Implementation report must include self-review and validation.',
          'Runner will move to review after a new valid report appears.',
        ],
        command: 'npm run auto-slice:run',
      };
    }

    return {
      type: nextSlice ? 'start_current_slice' : 'wait_for_handoff',
      summary: nextSlice
        ? `start implementation intake for ${effectiveSlice.label}`
        : `wait for a complete coding handoff for ${effectiveSlice.label}`,
      reply: 'NO_REPLY',
      checklist: nextSlice
        ? [
            `Read ${effectiveSlice.label} inputs before coding.`,
            'Create a new implementation report when coding is ready for handoff.',
          ]
        : ['Create a coding handoff before running again.'],
      command: 'npm run auto-slice:run',
    };
  }

  return {
    type: 'idle',
    summary: 'no automatic next step inside the current task contract',
    reply: 'NO_REPLY',
    checklist: ['Plan follow-up work or extend the task contract.'],
    command: null,
  };
}

function buildEffectiveState({ currentSlice, currentPhase, action, nextSlice }) {
  if (!action) {
    return {
      currentSlice,
      phase: currentPhase,
      completedSlice: null,
      completionReason: null,
    };
  }

  if (action.kind === 'review_pass_to_next_slice') {
    return {
      currentSlice: nextSlice,
      phase: 'in_progress',
      completedSlice: currentSlice,
      completionReason: 'review_pass',
    };
  }

  if (action.kind === 'review_pass_to_done') {
    return {
      currentSlice,
      phase: 'done',
      completedSlice: currentSlice,
      completionReason: 'review_pass',
    };
  }

  return {
    currentSlice,
    phase: action.targetPhase,
    completedSlice: null,
    completionReason: null,
  };
}

function renderStatusDoc({
  currentSlice,
  phase,
  completedSlice,
  pendingAction,
  implementationReport,
  reviewReport,
  reviewSignal,
  today,
}) {
  const summary = [];
  const notes = [];

  if (completedSlice) {
    summary.push(`${completedSlice.label} 已通过独立 review，并已由 runner 自动消费。`);
    if (currentSlice.number !== completedSlice.number) {
      summary.push(`current slice 已自动前进到 ${currentSlice.label}。`);
    }
  } else if (phase === 'in_review') {
    summary.push(`${currentSlice.label} 的 coding handoff 已被 runner 接受，并进入独立 review。`);
    if (implementationReport?.classification.classification === 'env_blocked_handoff') {
      summary.push('该 handoff 带有 env-blocked live validation caveat，但仍可送审。');
    }
  } else if (phase === 'in_progress') {
    summary.push(`${currentSlice.label} 当前处于 implementation / rework 阶段。`);
    if (reviewReport?.verdict === 'FAIL' || reviewReport?.verdict === 'NEEDS_REWORK') {
      summary.push(`最近 review verdict 为 \`${reviewReport.verdict}\`，已自动回到 coding。`);
    }
  } else {
    summary.push(`${currentSlice.label} 当前已无新的自动状态迁移。`);
  }

  if (implementationReport?.classification.classification === 'env_blocked_handoff') {
    notes.push('fresh runtime validation 仍缺失；是否可放行以 review verdict 为准。');
  }
  if (reviewSignal === 'DISPATCH_REVIEW_NOW') {
    notes.push('runner 本次只给出一个 decisive signal：`DISPATCH_REVIEW_NOW`。');
    notes.push('outer trigger 应直接读取 `50-handoff/auto-slice-trigger.json` 并只 dispatch 一次。');
  }

  return `# status.md

## Current Slice
- current_slice: \`${currentSlice.label}\`

## Status
- status: \`${phase}\`
- last_updated: \`${today}\`
- owner: \`core-auto-runner\`

## Summary
${summary.map((line) => `- ${line}`).join('\n')}

## Next Step
- ${pendingAction.summary}

## Blockers
- 当前无自动化 blocker；仅等待新 artifact 或人工执行下一步

## Notes
${notes.length > 0 ? notes.map((line) => `- ${line}`).join('\n') : '- 任一时刻只应有一个 `current_slice`'}
`;
}

function renderHandoffDoc({ currentSlice, phase, completedSlice, pendingAction }) {
  const stage = completedSlice && currentSlice.number !== completedSlice.number
    ? `\`${completedSlice.label}\` 已完成；当前已自动进入 \`${currentSlice.label}\``
    : phase === 'in_review'
      ? `\`${currentSlice.label}\` 已 ready for independent review`
      : phase === 'in_progress'
        ? `\`${currentSlice.label}\` 正在 implementation / rework`
        : `\`${currentSlice.label}\` 已完成当前 contract 的最后一步`;

  return `# handoff.md

## Current Stage
- 当前阶段：${stage}

## What Is Settled
- \`00-阶段需求/README.md\` 是阶段入口
- \`10-开发合同/README.md\` 是合同入口
- \`50-handoff/status.md\` 是动态状态入口
- \`50-handoff/auto-slice-runner-state.json\` 是 runner 的单一消费状态文件
- \`50-handoff/auto-slice-trigger.json\` 是 outer trigger 直接消费的单一 dispatch signal

## Recommended Read Order
1. \`50-handoff/status.md\`
2. \`50-handoff/handoff.md\`
3. \`00-阶段需求/README.md\`
4. \`10-开发合同/README.md\`
5. 当前 slice 直接相关的最新 \`APP/notes/\` 与 \`40-review/reports/\`

## Next Action
- ${pendingAction.summary}

## Blocking Issues
- 当前无 blocker 级硬阻塞
`;
}

function renderTodoDoc({ pendingAction }) {
  const items = pendingAction.checklist.length > 0
    ? pendingAction.checklist
    : ['No pending automation action.'];

  return `# TODO.md

${items.map((line) => `- ${line}`).join('\n')}
`;
}

function buildNextState({
  previousState,
  previousCurrentSlice,
  effectiveSlice,
  effectivePhase,
  action,
  pendingAction,
  pendingReviewDispatch,
  implementationReport,
  reviewReport,
  today,
}) {
  const nextState = normalizeState(previousState);
  nextState.current = {
    sliceNumber: effectiveSlice.number,
    sliceLabel: effectiveSlice.label,
    phase: effectivePhase,
  };
  nextState.pendingAction = pendingAction;
  nextState.pendingReviewDispatch = pendingReviewDispatch;

  if (action?.kind === 'coding_to_review' && implementationReport) {
    nextState.consumed.implementation[String(previousCurrentSlice.number)] = {
      sha256: implementationReport.sha256,
      path: implementationReport.filePath,
      classification: implementationReport.classification.classification,
      consumedAt: today,
    };
  }

  if ((action?.kind === 'review_rework' || action?.kind === 'review_pass_to_next_slice' || action?.kind === 'review_pass_to_done') && reviewReport) {
    nextState.consumed.review[String(previousCurrentSlice.number)] = {
      sha256: reviewReport.sha256,
      path: reviewReport.filePath,
      verdict: reviewReport.verdict,
      consumedAt: today,
    };
  }

  if (action) {
    nextState.updatedAt = today;
    nextState.lastAction = {
      kind: action.kind,
      at: today,
      reply: action.reply,
      artifact: {
        path: action.artifact.filePath,
        sha256: action.artifact.sha256,
      },
    };

    const historyEntry = {
      at: today,
      kind: nextState.lastAction.kind,
      current: nextState.current,
      reply: nextState.lastAction.reply,
    };
    nextState.history = [...nextState.history.slice(-9), historyEntry];
  }

  return nextState;
}

function ensureParentDir(filePath) {
  mkdirSync(path.dirname(filePath), { recursive: true });
}

function writeIfNeeded(filePath, content) {
  ensureParentDir(filePath);
  writeFileSync(filePath, content);
}

function fileContentEquals(filePath, nextContent) {
  if (!existsSync(filePath)) return false;
  return readText(filePath) === nextContent;
}

function buildTriggerPayload({ today, signal, currentSlice, pendingAction, reviewDispatch }) {
  return {
    version: 1,
    generatedAt: today,
    action: signal,
    currentSlice: {
      number: currentSlice.number,
      label: currentSlice.label,
    },
    summary: pendingAction.summary,
    reviewDispatch: signal === 'DISPATCH_REVIEW_NOW' ? reviewDispatch : null,
  };
}

function toTextSummary(result) {
  return result.signal;
}

function main() {
  const config = parseArgs(process.argv.slice(2));
  const today = new Date().toISOString().slice(0, 10);
  const slices = parseTaskContractSlices(readText(config.taskContractFile));
  const status = parseStatus(readText(config.statusFile));
  const currentSlice = slices.find((slice) => slice.number === status.currentSliceNumber)
    ?? { number: status.currentSliceNumber, title: status.currentSliceTitle, label: status.currentSliceLabel };
  const nextSlice = slices.find((slice) => slice.number === currentSlice.number + 1) ?? null;
  const implementationReport = loadImplementationReport(config.buildNotesDir, currentSlice.number);
  const reviewReport = loadReviewReport(config.reviewReportsDir, currentSlice.number);
  const previousState = normalizeState(readOptionalJson(config.stateFile));
  const action = determineAction({ currentSlice, nextSlice, implementationReport, reviewReport, state: previousState });
  const effective = buildEffectiveState({
    currentSlice,
    currentPhase: status.statusValue,
    action,
    nextSlice,
  });
  const effectiveImplementation = effective.currentSlice.number === currentSlice.number
    ? implementationReport
    : loadImplementationReport(config.buildNotesDir, effective.currentSlice.number);
  const reviewDispatch = effective.phase === 'in_review'
    ? buildReviewDispatch({
        currentSlice: effective.currentSlice,
        implementationReport: effectiveImplementation,
        statusFile: config.statusFile,
        handoffFile: config.handoffFile,
        taskContractFile: config.taskContractFile,
      })
    : null;
  const reviewSignalDecision = determineReviewSignal({
    effectiveSlice: effective.currentSlice,
    effectivePhase: effective.phase,
    reviewReport: effective.currentSlice.number === currentSlice.number ? reviewReport : null,
    reviewDispatch,
    previousPendingReviewDispatch: previousState.pendingReviewDispatch,
  });
  const pendingAction = determinePendingAction({
    effectiveSlice: effective.currentSlice,
    effectivePhase: effective.phase,
    implementationReport: effectiveImplementation,
    reviewReport: effective.currentSlice.number === currentSlice.number ? reviewReport : null,
    reviewDispatch,
    reviewSignal: reviewSignalDecision.signal,
    nextSlice: effective.currentSlice.number !== currentSlice.number ? effective.currentSlice : nextSlice,
  });
  const nextState = buildNextState({
    previousState,
    previousCurrentSlice: currentSlice,
    effectiveSlice: effective.currentSlice,
    effectivePhase: effective.phase,
    action,
    pendingAction,
    pendingReviewDispatch: reviewSignalDecision.pendingReviewDispatch,
    implementationReport,
    reviewReport,
    today,
  });

  const renderedStatus = renderStatusDoc({
    currentSlice: effective.currentSlice,
    phase: effective.phase,
    completedSlice: effective.completedSlice,
    pendingAction,
    implementationReport,
    reviewSignal: reviewSignalDecision.signal,
    today,
  });
  const renderedHandoff = renderHandoffDoc({
    currentSlice: effective.currentSlice,
    phase: effective.phase,
    completedSlice: effective.completedSlice,
    pendingAction,
  });
  const renderedTodo = renderTodoDoc({ pendingAction });

  const changed = Boolean(action);
  const reply = changed ? 'UPDATE' : 'NO_REPLY';
  const stateJson = `${JSON.stringify(nextState, null, 2)}\n`;
  const triggerPayload = buildTriggerPayload({
    today,
    signal: reviewSignalDecision.signal,
    currentSlice: effective.currentSlice,
    pendingAction,
    reviewDispatch,
  });
  const triggerJson = `${JSON.stringify(triggerPayload, null, 2)}\n`;

  if (config.mode === 'run' && !config.dryRun) {
    const shouldWriteState = changed
      || JSON.stringify(previousState.pendingReviewDispatch) !== JSON.stringify(nextState.pendingReviewDispatch)
      || !fileContentEquals(config.stateFile, stateJson);
    const shouldWriteTrigger = !fileContentEquals(config.triggerFile, triggerJson);

    if (changed) {
      writeIfNeeded(config.statusFile, renderedStatus);
      writeIfNeeded(config.handoffFile, renderedHandoff);
      writeIfNeeded(config.todoFile, renderedTodo);
    }
    if (shouldWriteState) {
      writeIfNeeded(config.stateFile, stateJson);
    }
    if (shouldWriteTrigger) {
      writeIfNeeded(config.triggerFile, triggerJson);
    }
  }

  const result = {
    ok: true,
    mode: config.mode,
    dryRun: config.dryRun,
    changed,
    reply,
    signal: reviewSignalDecision.signal,
    before: {
      currentSlice,
      phase: status.statusValue,
    },
    action,
    after: {
      currentSlice: effective.currentSlice,
      phase: effective.phase,
      completedSlice: effective.completedSlice,
    },
    artifacts: {
      implementation: implementationReport
        ? {
            filePath: implementationReport.filePath,
            sha256: implementationReport.sha256,
            classification: implementationReport.classification.classification,
            reason: implementationReport.classification.reason,
          }
        : null,
      review: reviewReport
        ? {
            filePath: reviewReport.filePath,
            sha256: reviewReport.sha256,
            verdict: reviewReport.verdict,
          }
        : null,
    },
    pendingAction,
    reviewDispatch,
    trigger: triggerPayload,
    outputs: {
      statusFile: config.statusFile,
      handoffFile: config.handoffFile,
      todoFile: config.todoFile,
      stateFile: config.stateFile,
      triggerFile: config.triggerFile,
    },
    preview: {
      status: renderedStatus,
      handoff: renderedHandoff,
      todo: renderedTodo,
      state: nextState,
      trigger: triggerPayload,
    },
  };

  if (config.format === 'text') {
    console.log(toTextSummary(result));
    return;
  }

  console.log(JSON.stringify(result, null, 2));
}

main();
