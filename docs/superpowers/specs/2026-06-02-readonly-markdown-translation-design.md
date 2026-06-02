# 只读 Markdown 渲染改造:让 task attempt 文字可被沉浸式翻译

- 日期:2026-06-02
- 分支:vb/7585-translate
- 状态:设计已批准,待写实现计划

## 背景与问题

用户反馈:task attempt 里的文字无法被沉浸式翻译插件翻译,而页面其他大部分文字都可以。

### 根因(已查证)

task attempt 的会话内容(assistant message、thinking、system/error 消息、plan
展示、user feedback、tool 的 markdown 结果)全部通过 `WYSIWYGEditor`
(`frontend/src/components/ui/wysiwyg.tsx`)渲染。该组件基于 **Lexical 富文本
编辑器**,即使在只读(`disabled`)模式下,`RichTextPlugin` 也无条件渲染
`ContentEditable`(`wysiwyg.tsx:309-320`)。

Lexical 0.36 在只读模式下产出的真实 DOM 为:

```html
<div contenteditable="false" role="textbox" data-lexical-editor="true" aria-readonly="true">…</div>
```

(依据:Lexical 源码 `LexicalEditor.ts:1471` 设置 `data-lexical-editor`,
`LexicalContentEditableElement.tsx` 的 `contentEditable={isEditable}`。)

沉浸式翻译(及多数翻译插件)**刻意跳过 `contenteditable` 元素的整棵子树**。
依据其作者在 issue
[immersive-translate#1187](https://github.com/immersive-translate/immersive-translate/issues/1187)
的明确说明:

> 是的,这是预期行为,contenteditable 对我们来说相当于是一个 input,所以我们
> 尽可能不对里面的任何元素作修改。Currently this is not possible because we
> have this hardwired into the code.

其默认配置中还为 figma、telegra.ph 等站点写了
`normalizeBody: div.ql-editor[contenteditable='false']` 这类逐站点规则去强制
翻译只读富文本编辑器,反证了默认情况下连 `contenteditable="false"` 的编辑器
子树也不翻译。

页面其他文字(导航、对话框、任务标题等)是普通 `<p>/<span>/<div>`,不在
`contenteditable` 内,因此能正常翻译。

### 排除的干扰项

会话列表使用虚拟滚动(`VirtualizedList.tsx`,`@tanstack/react-virtual`)。
虚拟滚动只会导致"仅翻译可视区、滚动后重译",不会导致完全不翻译,因此不是
本问题的原因。

## 目标

将 task attempt 中所有"AI 产出文本"的**只读** markdown 渲染,从 Lexical
(contenteditable)换成纯渲染的 markdown 组件,使大段文字可被沉浸式翻译插件
翻译,同时保持现有卡片外观与既有能力。

### 非目标

- **不改 user message 的只读渲染**(`UserMessage.tsx:67`)。user message 平时
  也是只读 contenteditable、同样暂不可翻译,但它带 retry 编辑入口
  (`onEdit` → `startRetry`),且内容多为用户自己输入、翻译价值低。本次保持
  原样,避免牵动 retry 逻辑。
- 不改编辑态的 `WYSIWYGEditor`(follow-up 输入、retry 编辑、task 表单、
  diff 评论编辑、`PendingApprovalEntry` 的 `DenyReasonForm` 拒绝理由输入框)
  ——这些需要 Lexical 的编辑能力。注意 `PendingApprovalEntry` 仅包裹只读会话
  内容(经 `children` 传入,已被下方范围覆盖),其自身的 `WYSIWYGEditor`
  (`PendingApprovalEntry.tsx:145`)是可编辑输入框,不在替换范围内。
- 不改各卡片的外层容器样式(plan 蓝/红、system 卡片、feedback 提示等)。
- 不处理 PR comment 节点(与 assistant message 无关,属 follow-up 输入框)。
- 不处理"点击内联代码跳 diff"(`ClickableCodePlugin`)——经查证为死代码,
  全代码库无任何位置传入 `findMatchingDiffPath`。

## 方案选型

选定 **streamdown**(Vercel 开源,专为 AI 流式 markdown 设计,npm 最新 2.5.0,
peerDeps 兼容 React 18)。

用户在了解以下集成成本后仍选择 streamdown(而非 react-markdown 手动方案):

- streamdown 文档假设 **Tailwind v4 + shadcn/ui**;本项目是 **Tailwind v3.4 +
  legacy design**。需将其 v4 `@source` 指令改为 v3 `content` 配置。
- streamdown 代码高亮用 **Shiki**,与现有 Prism + `--syntax-*` 体系不同。

集成可行性核实结论(降低了风险):

- streamdown 默认组件使用 shadcn 标准令牌(`border-border`、
  `text-muted-foreground`、`bg-muted`、`text-primary`、`bg-background`),
  **不依赖 `prose`、不硬编码灰阶**。
- 本项目 `tailwind.legacy.config.js` 已完整定义这些令牌(`border`、`input`、
  `background`、`foreground`、`primary`、`secondary`、`destructive`、`muted`、
  `accent`、`popover`、`card` 等),令牌天然对齐,无需新增。
- streamdown 的 `styles.css` 仅 35 行动画 keyframes,无排版/颜色冲突。

## 架构设计

### 共享组件 ReadOnlyMarkdown

新建 `frontend/src/components/ui/ReadOnlyMarkdown.tsx`,封装 streamdown +
配置,对外暴露极简接口:

```tsx
interface ReadOnlyMarkdownProps {
  content: string;          // markdown 原文
  className?: string;       // 透传到容器,沿用现有各处的排版类
  showCopyButton?: boolean; // 默认 true,悬停显示"复制为 Markdown"按钮
}
```

内部结构:

```
<div className="relative group">
  <悬停复制按钮 />                       {/* 复用 writeClipboardViaBridge */}
  <Streamdown plugins={{ code }}>{content}</Streamdown>
</div>
```

用共享组件(而非各处直接调 streamdown)的理由:配置集中、便于统一调整、
符合项目"小而专、接口清晰"的组件原则。

### 替换范围

替换以下**所有 `disabled` 的 `<WYSIWYGEditor>` 只读渲染调用**:

`DisplayConversationEntry.tsx` 内 6 处:
1. assistant message 正文(`:1233`)
2. assistant message 拆出的 thinking 块(`:1206`)+ remaining content(`:1216`)
3. CollapsibleEntry → system/error 消息(`:326`、`:343`)
4. PlanPresentationCard → plan 正文(`:461`)
5. user_feedback 正文(`:833`)
6. ToolCallCard → tool 的 markdown 结果(`:624`)

`UserMessage.tsx` 的只读分支(`:67`)**本次不替换**(见"非目标")。

### 保留的能力

- **复制按钮**:复用现有 `writeClipboardViaBridge`,把原始 markdown 写入剪贴板
  (与渲染无关)。
- **链接安全**:streamdown 自带 `rehype-harden`/`rehype-sanitize`,覆盖现有
  `ReadOnlyLinkPlugin` 的职责(屏蔽危险协议、外链新标签打开),且更全面。
- **代码高亮**:`@streamdown/code` 插件(Shiki)。
- **表格**:streamdown 内置 GFM。

### 决策记录

- **代码高亮**:用 Shiki 默认主题(如 github-light/dark),跟随项目明暗模式。
  接受与现有 Prism 高亮风格存在细微差异;不追求像素级一致,实现后用截图确认
  协调、可读。
- **复制按钮**:保留(整段消息级别的复制)。
- **流式动画**:不开启 streamdown 的 `animated`/`isAnimating`,避免与虚拟列表
  的高度测量冲突。

## 流式输出处理

assistant message 经 WebSocket 推送、以累积的完整 markdown 字符串更新。
streamdown 内置 unterminated block 解析,半截的代码块/表格/粗体可优雅渲染,
**无需自行实现"自动闭合"逻辑**。`ReadOnlyMarkdown` 每次接收最新完整字符串
透传给 streamdown 即可。

## 依赖

用 pnpm 安装(本 worktree 为新建,需先 `pnpm i`):

- `streamdown`(核心)
- `@streamdown/code`(Shiki 代码高亮)
- 暂不安装 `@streamdown/mermaid`、`@streamdown/math`、`@streamdown/cjk`
  (YAGNI;插件 tree-shakeable,未安装不进 bundle,后续按需添加)

## Tailwind v3 适配(关键)

1. `tailwind.legacy.config.js` 的 `content` 数组新增:
   ```js
   './node_modules/streamdown/dist/*.js',
   './node_modules/@streamdown/code/dist/*.js',
   ```
2. 全局 CSS 入口引入:`import 'streamdown/styles.css'`(35 行动画,无冲突)。
3. 颜色令牌已对齐,无需新增。

## 已知风险与处理

- **plan 颜色继承**:plan 容器用 `text-blue-700`(被拒为 `text-red-700`)给内容
  染色(`DisplayConversationEntry.tsx:460`)。streamdown 段落若强制自身令牌色
  会盖掉该颜色。处理:`ReadOnlyMarkdown` 不硬设文字色、让其继承;必要时用
  `className` 覆盖为 `text-inherit`。实现时用截图确认 plan 蓝/红正确显示。
- **虚拟列表兼容**:会话用 `@tanstack/react-virtual` 按内容测高,已有
  `measureElement`。streamdown 高度变化与原 `WYSIWYGEditor` 同类,不引入新问题。
- **图片**:assistant message 基本不含图片(`.vibe-images` 私有路径图片仅出现在
  user 输入/retry)。本次不为只读 markdown 接入 `.vibe-images` 解析;若后续发现
  AI 输出含此类图片,再单独处理。

## 测试与验证

### 构建与类型

- `pnpm i`(装新依赖)
- `pnpm run check`(tsc)与 `pnpm run lint` 必须通过

### 单元测试(Vitest,放组件同目录 `__tests__/`)

- 渲染基本 markdown(标题/列表/粗体)→ 对应 DOM
- 渲染 GFM 表格 → `<table>`
- 渲染代码块 → 高亮结构
- **核心回归断言**:渲染容器**不是 `contenteditable`、不含
  `data-lexical-editor`**(钉死本次需求,防回退)
- 流式半截输入(未闭合 ```)不抛错、能渲染

### 人工 / 截图验证(streamdown 观感为主要不确定点)

1. 起 dev,打开有历史的 task attempt,逐项目视:assistant message、thinking、
   system 消息、**plan(蓝)**、**被拒绝 plan(红)**、含代码块/表格/链接的消息
2. 对照改动前,确认排版、间距、代码高亮、明暗模式协调
3. **装沉浸式翻译插件实测**:确认 assistant message 等大段文字现在能被翻译
4. 流式实测:发 follow-up,观察 AI 回复流式渲染平滑、无破图

### 验收标准

task attempt 的 AI 产出文字能被沉浸式翻译插件翻译,且各类卡片(尤其 plan
蓝/红)外观与改动前一致、代码高亮可读、流式渲染正常。
