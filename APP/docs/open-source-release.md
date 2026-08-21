# Open-source release runbook

这份流程用于把当前私有开发仓库发布成一个没有旧 Git 历史的新公开仓库。

## 为什么不能直接公开当前仓库

当前开发仓库的可达历史曾包含对象存储凭据和 Bot 认证令牌。删除当前文件不会让旧提交里的
值失效，也不会把它们从 Git 历史移除。因此：

- 不要把当前 remote 或完整 Git 历史改成 public；
- 发布前必须轮换曾进入历史的 MinIO/S3 凭据和 Bot Token；
- 公开仓库只从已审核的当前树创建一个新的初始提交。

## 前置条件

1. 当前分支已提交且工作区干净。
2. `npm run open-source:check` 通过。
3. 已安装 [Gitleaks](https://github.com/gitleaks/gitleaks)，并能从 `PATH` 调用。
4. 目标目录不存在，并且位于当前仓库之外。
5. 需要公开的素材已经具有可再分发授权；带独立限制的素材不由根许可证自动覆盖。

## 创建无历史公开仓库

从仓库根目录运行：

```bash
bash APP/scripts/create-public-repository.sh \
  . \
  ../SekerChat-public
```

脚本会执行以下安全门禁：

1. 拒绝脏工作区、缺少许可证或已存在的目标目录；
2. 只通过 `git archive HEAD` 导出当前提交，不复制 `.git` 和旧提交；
3. 在建库前使用 `gitleaks dir` 扫描导出内容；
4. 运行公开仓库边界检查；
5. 创建只有一个提交的新 `main` 分支；
6. 再使用 `gitleaks git` 扫描新仓库历史。

脚本不会添加 remote，也不会 push。检查新目录内容并在 Git 托管平台创建空仓库后，再由维护者
显式添加新的公开 remote 并推送。

## 发布后

- 开启托管平台的 secret scanning、Dependabot 和私密漏洞报告入口；
- 确认 CI 的测试、构建、依赖审计和 `open-source:check` 全部通过；
- 即使 Gitleaks 扫描通过，也要完成旧凭据轮换，因为扫描通过不代表历史凭据自动失效。
