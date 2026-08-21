# 03-open-questions.md

## Q1. 单文件默认限制

**Status:** resolved

**Context:** 下载发布可能包含大型安装包或压缩包。

**Options:**

- A: 默认 2 GB。
- B: 默认 5 GB。

**Recommendation:** 默认 5 GB，并允许后台配置。

**Decision:** B。

## Q2. V1 内容来源

**Status:** resolved

**Context:** 自动 RSS 抓取会引入调度、去重和外部内容清洗。

**Options:**

- A: 授权用户手工发布。
- B: 外部 RSS 自动抓取。

**Recommendation:** V1 采用 A，后续扩展 B。

**Decision:** A。
