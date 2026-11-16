import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const scanRoots = ['apps/backend/src', 'apps/frontend-react/src', 'apps/reminder/src', 'packages'];
const skipDirs = new Set(['node_modules', 'dist', 'dist-openapi', 'coverage', 'generated']);

const retired = [
  { pattern: /UploadTargetRegistry|UploadTargetHandler|UPLOAD_TARGET_HANDLERS/, reason: '上传扩展点已删除，不要再引入空的注册表' },
  { pattern: /SendMessageUseCase/, reason: '零行为转发层已删除，直接调用 MessagesService' },
  { pattern: /ARTICLE_TAGS_ENABLED/, reason: '恒假开关已删除' },
  { pattern: /LIVE_ATTENDANCE_QUERY_POLICY/, reason: '一行别名已删除，使用 LIVE_QUERY_POLICY' },
];

const violations = [];

function walk(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!skipDirs.has(entry.name)) walk(path.join(directory, entry.name));
      continue;
    }
    if (!/\.(?:ts|tsx|js|mjs|cjs|vue)$/.test(entry.name)) continue;
    const file = path.join(directory, entry.name);
    const source = readFileSync(file, 'utf8');
    for (const rule of retired) {
      if (rule.pattern.test(source)) {
        violations.push({ file: path.relative(root, file), reason: rule.reason });
      }
    }
  }
}

for (const scanRoot of scanRoots) {
  const absolute = path.join(root, scanRoot);
  try {
    if (statSync(absolute).isDirectory()) walk(absolute);
  } catch {
    // Optional workspace, skip.
  }
}

if (violations.length > 0) {
  for (const violation of violations) {
    console.error(`${violation.file}: ${violation.reason}`);
  }
  process.exit(1);
}

console.log('No retired symbols were reintroduced.');
