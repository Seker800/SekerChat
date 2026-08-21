# Workspace Sidebar Notes

这份文档的目标是保护群组工作台左侧栏的排版基线，避免其他 surface 的样式修改再次污染主页。

## 保护目标

当前群组工作台左侧栏有一套人工调过的密度与层级，不要把它当作可随意重构的通用 sidebar。

重点保护：
- 分组标题与条目列表的垂直节奏
- 线程条目的上下间距和左右内边距
- 选中态的整块高亮样式
- 长标题必须截断省略，不允许出现横向滚动
- 滚动条必须尽量窄，不能明显侵占内容宽度

## 局部基线

- 结构入口：
  - `apps/frontend-react/src/components/workspace/ChannelSidebar.tsx`
  - `apps/frontend-react/src/components/workspace/WorkspaceShell.tsx`
- 样式入口：
  - `apps/frontend-react/src/components/workspace/ChannelSidebar.module.css`
  - `apps/frontend-react/src/components/workspace/WorkspaceShell.module.css`
- 设计参考：
  - `apps/ui-lab/src/variants/HomeCliCodex.vue`
  - `apps/ui-lab/src/styles.css`

## 哪些选择器属于受保护区域

这些选择器默认视为受保护视觉基线，不要为了管理页或其他 surface 顺手改它们：

- `.cli-pane-sidebar`
- `.cli-sidebar-actions`
- `.cli-folder-list`
- `.cli-folder`
- `.cli-folder-header`
- `.cli-folder-name`
- `.cli-folder-toggle`
- `.cli-thread-list`
- `.cli-thread-item`
- `.cli-thread-item-active`
- `.cli-thread-row`
- `.cli-thread-row strong`
- `.cli-thread-row span`

## 修改约束

- 新的管理 UI、实验 UI 优先用独立命名空间，例如 `manage-*`
- 不要通过增加全局 `line-height`、全局 `gap`、共享 `padding` 来修某个单独页面
- 不要让左栏标题文本换行；长标题必须 `ellipsis`
- 不要让 `.cli-folder-list` 出现横向滚动
- 不要移除 `align-content: start`，否则 grid 会把剩余高度重新分配，导致间距失真

## 修改前先确认

如果用户不是明确要求改左栏排版：
- 优先避免改上面的受保护选择器
- 如果必须改，先说明你遵循的是“保护侧栏视觉基线”的做法

## 修改后最低验证

```bash
cd APP
npm run typecheck --workspace @sekerchat/frontend-react
npx playwright test tests/e2e/workspace.smoke.spec.ts
```

如果改动涉及左侧栏视觉：
- 必须看 `workspace-sidebar.png` 的截图结果
- 不要只看全页截图
