# 只读 Markdown 渲染改造实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 task attempt 中所有"AI 产出文本"的只读渲染从 Lexical(contenteditable,被沉浸式翻译跳过)换成 streamdown,使大段文字可被翻译,同时保持现有卡片外观。

**Architecture:** 新建共享组件 `ReadOnlyMarkdown`(封装 streamdown + Shiki 代码插件 + 悬停复制按钮),替换 `DisplayConversationEntry.tsx` 中所有 `disabled` 的 `<WYSIWYGEditor>` 调用(AI 产出文本)。**user message 与编辑态的 `WYSIWYGEditor` 保持不变**(user message 含 retry 编辑入口,本次不动)。

**Tech Stack:** React 18 + TypeScript + Tailwind v3(legacy design)+ Vitest;新增依赖 `streamdown` 与 `@streamdown/code`(Shiki 高亮)。

---

## 关键事实(实现前必读,均已查证)

- **Shiki 高亮必须装 `@streamdown/code` 并通过 `plugins={{ code }}` 传入**。streamdown 核心无内置 code 插件:`highlighted-body.tsx` 中 `if (!codePlugin) { setResult(raw); return; }`,`useCodePlugin` 返回 `plugins?.code ?? null`。不传则代码块为无高亮纯文本。
- **默认 Shiki 主题** 为 `["github-light", "github-dark"]`(`StreamdownProps.shikiTheme` 默认值)。本次用默认主题,不传 `shikiTheme`。
- **暗色切换走 Tailwind `dark:` 变体**:streamdown `code-block/body.tsx:98` 用 `dark:bg-[var(--shiki-dark-bg,...)]`。本项目 `tailwind.legacy.config.js` 是 `darkMode: ["class"]`,应用已在祖先元素切换 `.dark`,因此代码块明暗会自动跟随,无需额外配置。
- **Tailwind v3 适配必需**:streamdown 的 utility 类(含 `dark:` 变体)写在其 dist 里,必须把 dist 路径加入 `tailwind.legacy.config.js` 的 `content` 数组,否则类名不会被生成、样式全失效。
- **令牌已对齐**:streamdown 默认组件用 `border-border`/`text-muted-foreground`/`bg-muted`/`text-primary`/`bg-background`,这些 legacy config 已全部定义。
- **CSS 入口**:`src/components/legacy-design/LegacyDesignScope.tsx:4` 是 `@/styles/legacy/index.css` 的导入点,在此追加 `import 'streamdown/styles.css'`。
- **复制按钮** 复用 `writeClipboardViaBridge`(`src/vscode/bridge.ts:435`,签名 `(text: string) => Promise<boolean>`)。

## 替换点清单(`disabled` 只读调用)

`DisplayConversationEntry.tsx`(行号以当前文件为准,实现时按上下文定位):
- `:330` CollapsibleEntry 完整内容(system/error)
- `:346` CollapsibleEntry 预览首行
- `:465` PlanPresentationCard plan 正文
- `:628` ToolCallCard tool 的 markdown 结果
- `:837` user_feedback 正文
- `:1210` assistant message thinking 块
- `:1220` assistant message remaining content
- `:1237` assistant message 主体(无 think 标签时)

**不替换**:
- `UserMessage.tsx:67`(user message 只读分支)——**本次明确不动**。user message 平时是只读 contenteditable,但它带 retry 编辑入口(`onEdit` → `startRetry`),且内容多为用户自己输入、翻译价值低。保持原样,避免牵动 retry 逻辑。
- `PendingApprovalEntry.tsx:145`(DenyReasonForm 可编辑输入框)
- `TaskPanel.tsx:119-121` 任务标题/描述只读 WYSIWYG(非 AI 会话产出,不在范围)
- 编辑态 WYSIWYG(TaskFormDialog、RetryEditorInline、diff 评论编辑)

> 注:spec 范围为"task attempt 的 AI 产出文本"。本计划只改 `DisplayConversationEntry.tsx` 中的 8 处。

---

## File Structure

- **Create** `frontend/src/components/ui/ReadOnlyMarkdown.tsx` — 共享只读 markdown 组件(封装 streamdown + code 插件 + 复制按钮)
- **Create** `frontend/src/components/ui/__tests__/ReadOnlyMarkdown.test.tsx` — 单元测试
- **Modify** `frontend/package.json` — 加依赖(经 pnpm add 自动)
- **Modify** `frontend/tailwind.legacy.config.js` — content 数组加 streamdown dist 路径
- **Modify** `frontend/src/components/legacy-design/LegacyDesignScope.tsx` — 引入 streamdown styles.css
- **Modify** `frontend/src/components/NormalizedConversation/DisplayConversationEntry.tsx` — 替换 8 处

> user message(`UserMessage.tsx`)本次不改。

---

## Task 1: 安装依赖

**Files:**
- Modify: `frontend/package.json`(经 pnpm 自动写入)

- [ ] **Step 1: 确保 worktree 已装依赖**

本 worktree 为新建,`node_modules` 可能缺失。先安装基线依赖:

Run: `cd frontend && pnpm i`
Expected: 安装完成,无报错。

- [ ] **Step 2: 添加 streamdown 与 code 插件**

Run: `cd frontend && pnpm add streamdown @streamdown/code`
Expected: `package.json` 的 dependencies 出现 `streamdown` 与 `@streamdown/code`;无 peer dependency 报错(两者 peer 均为 react ^18,项目满足)。

- [ ] **Step 3: 验证版本**

Run: `cd frontend && node -e "console.log(require('streamdown/package.json').version, require('@streamdown/code/package.json').version)"`
Expected: 打印两个版本号(streamdown >= 2.5.0,@streamdown/code >= 1.1.1)。

- [ ] **Step 4: Commit**

```bash
git add frontend/package.json frontend/pnpm-lock.yaml
git commit -m "build: add streamdown and @streamdown/code deps"
```

---

## Task 2: Tailwind v3 适配 + 引入样式

**Files:**
- Modify: `frontend/tailwind.legacy.config.js:5-11`(content 数组)
- Modify: `frontend/src/components/legacy-design/LegacyDesignScope.tsx:4`

- [ ] **Step 1: 把 streamdown dist 加入 Tailwind content 扫描**

在 `frontend/tailwind.legacy.config.js` 的 `content` 数组中,把现有内容改为追加两行(替换整个数组):

```js
  content: [
    './pages/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './app/**/*.{ts,tsx}',
    './src/**/*.{ts,tsx}',
    "node_modules/@rjsf/shadcn/src/**/*.{js,ts,jsx,tsx,mdx}",
    './node_modules/streamdown/dist/*.js',
    './node_modules/@streamdown/code/dist/*.js'
  ],
```

- [ ] **Step 2: 引入 streamdown 动画样式**

在 `frontend/src/components/legacy-design/LegacyDesignScope.tsx` 第 4 行(`import '@/styles/legacy/index.css';`)之后新增一行:

```ts
import '@/styles/legacy/index.css';
import 'streamdown/styles.css';
```

- [ ] **Step 3: 验证类型与构建未破坏**

Run: `cd frontend && pnpm run check`
Expected: PASS(无类型错误)。

- [ ] **Step 4: Commit**

```bash
git add frontend/tailwind.legacy.config.js frontend/src/components/legacy-design/LegacyDesignScope.tsx
git commit -m "build: wire streamdown classes into tailwind v3 content scan"
```

---

## Task 3: 创建 ReadOnlyMarkdown 组件

**Files:**
- Create: `frontend/src/components/ui/ReadOnlyMarkdown.tsx`

- [ ] **Step 1: 写组件**

创建 `frontend/src/components/ui/ReadOnlyMarkdown.tsx`,完整内容:

```tsx
import { memo, useCallback, useState } from 'react';
import { Streamdown } from 'streamdown';
import { code } from '@streamdown/code';
import { Check, Clipboard } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { writeClipboardViaBridge } from '@/vscode/bridge';

// streamdown 的 code 高亮插件(Shiki),用默认主题 ["github-light","github-dark"]。
// 在模块作用域创建一次,避免每次渲染重建。
const STREAMDOWN_PLUGINS = { code };

export interface ReadOnlyMarkdownProps {
  /** markdown 原文 */
  content: string;
  /** 透传到外层容器的排版类(沿用各调用点原本传给 WYSIWYGEditor 的 className) */
  className?: string;
  /** 是否显示悬停复制按钮,默认 true */
  showCopyButton?: boolean;
}

/**
 * 只读 markdown 渲染组件。
 *
 * 取代只读模式的 WYSIWYGEditor(Lexical/contenteditable),改用 streamdown
 * 渲染为普通 DOM,使内容可被沉浸式翻译等插件翻译。
 *
 * - 代码高亮:Shiki(默认主题),暗色经 Tailwind `dark:` 变体自动跟随。
 * - 文字颜色:不硬编码,继承外层容器(plan 卡片用 text-blue-700/red-700 染色)。
 * - 流式:streamdown 内置 unterminated block 解析,半截 markdown 可优雅渲染。
 */
function ReadOnlyMarkdown({
  content,
  className,
  showCopyButton = true,
}: ReadOnlyMarkdownProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    if (!content) return;
    try {
      // 与旧 WYSIWYGEditor 一致:反转义 markdown 下划线,便于剪贴板阅读
      const unescaped = content.replace(/\\_/g, '_');
      await writeClipboardViaBridge(unescaped);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 400);
    } catch {
      // bridge 自行兜底
    }
  }, [content]);

  return (
    <div className="relative group">
      {showCopyButton && (
        <div className="sticky top-0 right-2 z-10 pointer-events-none h-0">
          <div className="flex justify-end opacity-0 group-hover:opacity-100 transition-opacity duration-150">
            <Button
              type="button"
              aria-label={copied ? 'Copied!' : 'Copy as Markdown'}
              title={copied ? 'Copied!' : 'Copy as Markdown'}
              variant="icon"
              size="icon"
              onClick={handleCopy}
              className="pointer-events-auto p-2 bg-muted h-8 w-8"
            >
              {copied ? (
                <Check className="w-4 h-4 text-success" />
              ) : (
                <Clipboard className="w-4 h-4 text-muted-foreground" />
              )}
            </Button>
          </div>
        </div>
      )}
      <Streamdown
        plugins={STREAMDOWN_PLUGINS}
        className={cn('text-inherit', className)}
      >
        {content}
      </Streamdown>
    </div>
  );
}

export default memo(ReadOnlyMarkdown);
```

- [ ] **Step 2: 验证类型**

Run: `cd frontend && pnpm run check`
Expected: PASS。若 `streamdown`/`@streamdown/code` 类型解析失败,确认 Task 1 已安装成功。

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/ui/ReadOnlyMarkdown.tsx
git commit -m "feat: add ReadOnlyMarkdown component backed by streamdown"
```

---

## Task 4: 为 ReadOnlyMarkdown 写测试

**Files:**
- Create: `frontend/src/components/ui/__tests__/ReadOnlyMarkdown.test.tsx`

- [ ] **Step 1: 写失败测试**

创建 `frontend/src/components/ui/__tests__/ReadOnlyMarkdown.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import ReadOnlyMarkdown from '../ReadOnlyMarkdown';

// bridge 复制逻辑在测试环境无需真实执行
vi.mock('@/vscode/bridge', () => ({
  writeClipboardViaBridge: vi.fn().mockResolvedValue(true),
}));

describe('ReadOnlyMarkdown', () => {
  it('renders markdown headings and paragraphs as real DOM text', () => {
    render(<ReadOnlyMarkdown content={'# Hello\n\nworld'} />);
    expect(screen.getByText('Hello')).toBeInTheDocument();
    expect(screen.getByText('world')).toBeInTheDocument();
  });

  it('does NOT render a contenteditable / lexical editor (core regression)', () => {
    const { container } = render(
      <ReadOnlyMarkdown content={'some assistant text'} />
    );
    // 这是本次需求的核心:渲染出的内容不能是 contenteditable,
    // 否则沉浸式翻译会继续跳过它。
    expect(
      container.querySelector('[contenteditable]')
    ).toBeNull();
    expect(
      container.querySelector('[data-lexical-editor]')
    ).toBeNull();
  });

  it('renders GFM tables', () => {
    const md = [
      '| a | b |',
      '| - | - |',
      '| 1 | 2 |',
    ].join('\n');
    const { container } = render(<ReadOnlyMarkdown content={md} />);
    expect(container.querySelector('table')).not.toBeNull();
  });

  it('does not throw on incomplete (streaming) markdown', () => {
    expect(() =>
      render(<ReadOnlyMarkdown content={'```ts\nconst a = 1'} />)
    ).not.toThrow();
  });

  it('hides copy button when showCopyButton is false', () => {
    render(<ReadOnlyMarkdown content={'x'} showCopyButton={false} />);
    expect(
      screen.queryByRole('button', { name: /copy as markdown/i })
    ).toBeNull();
  });
});
```

- [ ] **Step 2: 运行测试**

Run: `cd frontend && pnpm vitest run src/components/ui/__tests__/ReadOnlyMarkdown.test.tsx`
Expected: 全部 PASS。

> 若 streamdown 在 jsdom 下因 Shiki 异步高亮报警告但不失败,可忽略警告;断言不依赖高亮结果。若表格用例因 GFM 未启用失败,核对 streamdown 默认 remark 插件是否含 gfm(2.5.0 默认 `defaultRemarkPlugins` 含 remark-gfm),无需手动加。

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/ui/__tests__/ReadOnlyMarkdown.test.tsx
git commit -m "test: cover ReadOnlyMarkdown rendering and no-contenteditable regression"
```

---

## Task 5: 替换 DisplayConversationEntry 的 8 处只读渲染

**Files:**
- Modify: `frontend/src/components/NormalizedConversation/DisplayConversationEntry.tsx`

> 每处替换都把 `<WYSIWYGEditor value={X} disabled className={C} taskAttemptId={...} />` 形态换成 `<ReadOnlyMarkdown content={X} className={C} />`。移除 `disabled`、`taskAttemptId`(只读 markdown 不需要 attempt 上下文解析图片——assistant 文本无私有图片)。逐处替换并保持周围 JSX 不变。

- [ ] **Step 1: 加 import**

在文件顶部 import 区(第 3 行 `import WYSIWYGEditor from '@/components/ui/wysiwyg';` 之后)加:

```tsx
import ReadOnlyMarkdown from '@/components/ui/ReadOnlyMarkdown';
```

保留 WYSIWYGEditor import(本文件不再用,但 Step 9 会确认并按 lint 结果决定删除)。

- [ ] **Step 2: 替换 CollapsibleEntry 完整内容(原 :325-334 处的 WYSIWYGEditor)**

定位 `CollapsibleEntry` 组件内 `Inner` 的渲染(`markdown ? (<WYSIWYGEditor value={content} ... />) : content`)。把其中的:

```tsx
      {markdown ? (
        <WYSIWYGEditor
          value={content}
          disabled
          className="whitespace-pre-wrap break-words"
          taskAttemptId={taskAttemptId}
        />
      ) : (
        content
      )}
```

替换为:

```tsx
      {markdown ? (
        <ReadOnlyMarkdown
          content={content}
          className="whitespace-pre-wrap break-words"
        />
      ) : (
        content
      )}
```

- [ ] **Step 3: 替换 CollapsibleEntry 预览首行(PreviewInner)**

把:

```tsx
      {markdown ? (
        <WYSIWYGEditor
          value={firstLine}
          disabled
          className="whitespace-pre-wrap break-words"
          taskAttemptId={taskAttemptId}
        />
      ) : (
        firstLine
      )}
```

替换为:

```tsx
      {markdown ? (
        <ReadOnlyMarkdown
          content={firstLine}
          className="whitespace-pre-wrap break-words"
        />
      ) : (
        firstLine
      )}
```

- [ ] **Step 4: 替换 PlanPresentationCard plan 正文**

把:

```tsx
              <WYSIWYGEditor
                value={plan}
                disabled
                className="whitespace-pre-wrap break-words"
                taskAttemptId={taskAttemptId}
              />
```

替换为:

```tsx
              <ReadOnlyMarkdown
                content={plan}
                className="whitespace-pre-wrap break-words"
              />
```

> plan 容器外层为 `text-blue-700`(denied 时 `text-red-700`)。ReadOnlyMarkdown 用 `text-inherit`,文字色会继承该蓝/红。Task 7 截图验证确认。

- [ ] **Step 5: 替换 ToolCallCard 的 markdown 结果**

把(tool result markdown 分支):

```tsx
                        <WYSIWYGEditor
                          value={actionType.result.value?.toString()}
                          disabled
                          taskAttemptId={taskAttemptId}
                        />
```

替换为:

```tsx
                        <ReadOnlyMarkdown
                          content={actionType.result.value?.toString() ?? ''}
                        />
```

- [ ] **Step 6: 替换 user_feedback 正文**

把:

```tsx
          <WYSIWYGEditor
            value={entry.content}
            disabled
            className="whitespace-pre-wrap break-words flex flex-col gap-1 font-light py-3"
            taskAttemptId={taskAttempt?.id}
          />
```

替换为:

```tsx
          <ReadOnlyMarkdown
            content={entry.content}
            className="whitespace-pre-wrap break-words flex flex-col gap-1 font-light py-3"
          />
```

- [ ] **Step 7: 替换 assistant message 的 thinking 块与 remaining content**

thinking 块(原 :1206 处):

```tsx
              <WYSIWYGEditor
                value={thinkContent}
                disabled
                className="whitespace-pre-wrap break-words flex flex-col gap-1 font-light text-sm"
                taskAttemptId={taskAttempt?.id}
              />
```

替换为:

```tsx
              <ReadOnlyMarkdown
                content={thinkContent}
                className="whitespace-pre-wrap break-words flex flex-col gap-1 font-light text-sm"
              />
```

remaining content(原 :1216 处):

```tsx
              <WYSIWYGEditor
                value={remainingContent}
                disabled
                className="whitespace-pre-wrap break-words flex flex-col gap-1 font-light"
                taskAttemptId={taskAttempt?.id}
              />
```

替换为:

```tsx
              <ReadOnlyMarkdown
                content={remainingContent}
                className="whitespace-pre-wrap break-words flex flex-col gap-1 font-light"
              />
```

- [ ] **Step 8: 替换 assistant message 主体(无 think 标签分支)**

把(原 :1233 处):

```tsx
          <WYSIWYGEditor
            value={isNormalizedEntry(entry) ? entry.content : ''}
            disabled
            className="whitespace-pre-wrap break-words flex flex-col gap-1 font-light"
            taskAttemptId={taskAttempt?.id}
          />
```

替换为:

```tsx
          <ReadOnlyMarkdown
            content={isNormalizedEntry(entry) ? entry.content : ''}
            className="whitespace-pre-wrap break-words flex flex-col gap-1 font-light"
          />
```

- [ ] **Step 9: 处理未使用的 WYSIWYGEditor import**

Run: `cd frontend && grep -n "WYSIWYGEditor" src/components/NormalizedConversation/DisplayConversationEntry.tsx`
Expected: 仅剩第 3 行的 import。若是,删除该 import 行(`import WYSIWYGEditor from '@/components/ui/wysiwyg';`)。若还有其他引用(不应有),保留并复查遗漏。

- [ ] **Step 10: 验证类型 + lint**

Run: `cd frontend && pnpm run check && pnpm run lint`
Expected: 均 PASS。

- [ ] **Step 11: Commit**

```bash
git add frontend/src/components/NormalizedConversation/DisplayConversationEntry.tsx
git commit -m "feat: render all AI conversation text via ReadOnlyMarkdown"
```

---

## Task 6: 运行全部测试与回归

**Files:** 无(验证)

- [ ] **Step 1: 跑前端测试套件**

Run: `cd frontend && pnpm vitest run`
Expected: 全绿。重点关注 `NormalizedConversation` 与 `ui` 下测试不回归。

- [ ] **Step 2: 类型 + lint 终检**

Run: `cd frontend && pnpm run check && pnpm run lint`
Expected: PASS。

- [ ] **Step 3: 若有失败,按 systematic-debugging 处理后再继续**

不要带着失败进入截图验证。

---

## Task 7: 人工 / 截图验证(streamdown 观感主要不确定点)

**Files:** 无(验证)

- [ ] **Step 1: 起 dev**

Run: `pnpm run dev`(仓库根)
Expected: 前后端启动,前端可访问。

- [ ] **Step 2: 逐项目视会话渲染**

打开一个有历史的 task attempt,确认以下都正常显示且观感协调(明暗模式各看一次):
- assistant message(段落/列表/粗体/链接)
- 含代码块的消息(Shiki 高亮可读、明暗跟随)
- 含表格的消息(GFM 表格)
- thinking 块(opacity 较低、字号 text-sm)
- system 消息卡片、error 消息卡片
- **plan 卡片为蓝色**、**被拒绝 plan 为红色**(文字色继承,不被 streamdown 盖成默认色)
- user message、user_feedback

- [ ] **Step 3: 翻译插件实测(验收核心)**

装/启用沉浸式翻译插件,在 task attempt 页面触发翻译。
Expected: assistant message 等大段 AI 文字**能被翻译**(改造前不能)。

- [ ] **Step 4: 流式实测**

发一条 follow-up,观察 AI 回复流式渲染过程。
Expected: 半截代码块/表格不破图、不抛错,渲染平滑;虚拟列表滚动正常。

- [ ] **Step 5: 记录结果**

若发现 plan 颜色被盖、间距异常、高亮不可读等,回到对应 Task 调整(plan 颜色问题优先在 ReadOnlyMarkdown 的 className 继承上排查)。验收通过后结束。

---

## Self-Review 备注(已核对)

- **Spec 覆盖**:根因→无需改;范围(会话 8 处,user message 本次不改)→ Task 5;共享组件 → Task 3;复制按钮 → Task 3;Shiki 高亮 → Task 1/3(默认主题);Tailwind v3 适配 → Task 2;流式 → streamdown 内置(Task 3 注释 + Task 7 验证);测试(含 no-contenteditable 回归)→ Task 4;截图验证 → Task 7。
- **类型一致**:组件名 `ReadOnlyMarkdown`、prop `content`/`className`/`showCopyButton` 在所有 Task 中一致。
- **依赖一致**:`@streamdown/code` 的 `code` 导出 + `plugins={{ code }}` 在 Task 3 使用,与"关键事实"一致。
- **已知偏差**:Task 5 移除了 `taskAttemptId`(只读 markdown 不解析私有图片,assistant 文本无此需求)。user message(`UserMessage.tsx`)本次不改,其只读内容仍为 contenteditable、暂不可翻译(用户决定)。
