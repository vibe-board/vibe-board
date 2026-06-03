import { memo, useCallback, useMemo, useState } from 'react';
import { Streamdown } from 'streamdown';
import { code } from '@streamdown/code';
import { cjk } from '@streamdown/cjk';
import { mermaid } from '@streamdown/mermaid';
import { Check, Clipboard } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { useTheme } from '@/components/ThemeProvider';
import { getActualTheme } from '@/utils/theme';
import { writeClipboardViaBridge } from '@/vscode/bridge';

// streamdown 插件,在模块作用域创建一次,避免每次渲染重建:
// - code:  Shiki 代码高亮(默认主题 ["github-light","github-dark"])
// - cjk:   修正中文等 CJK 文本紧贴 `**`/`*` 时强调标记不被识别的问题
//          (CommonMark 在 CJK 与强调定界符相邻且无空格时常常不渲染加粗/斜体)
// - mermaid: 把 ```mermaid 代码块渲染为图(mermaid 实例由插件按需加载)
const STREAMDOWN_PLUGINS = { code, cjk, mermaid };

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
 * - 中文强调:`@streamdown/cjk` 修正 CJK 紧贴 `**`/`*` 时加粗/斜体不渲染。
 * - 图表:`@streamdown/mermaid` 渲染 ```mermaid 代码块,主题跟随明暗。
 * - 文字颜色:不硬编码,继承外层容器(plan 卡片用 text-blue-700/red-700 染色)。
 * - 流式:streamdown 内置 unterminated block 解析,半截 markdown 可优雅渲染。
 */
function ReadOnlyMarkdown({
  content,
  className,
  showCopyButton = true,
}: ReadOnlyMarkdownProps) {
  const [copied, setCopied] = useState(false);

  // Mermaid renders to an SVG whose colors are baked in at render time, so it
  // can't follow Tailwind `dark:` variants like the rest of the markup. Drive
  // its theme reactively from the app theme instead. `mermaid={{ config }}` is
  // read from StreamdownContext on every render, so a theme switch re-themes
  // diagrams. ("default" is mermaid's light theme.)
  const { theme } = useTheme();
  const mermaidOptions = useMemo(
    () => ({
      config: {
        theme: getActualTheme(theme) === 'dark' ? 'dark' : 'default',
      } as const,
    }),
    [theme]
  );

  // When the caller supplies its own `text-*` size, defer to it; otherwise fall
  // back to the legacy `text-base` baseline. (cn() is plain clsx with no
  // twMerge, so emitting both would leave the winner to CSS source order.)
  const hasTextSize = /(?:^|\s)text-(xs|sm|base|lg|xl|\d)/.test(
    className ?? ''
  );

  // Callers pass `whitespace-pre-wrap` (carried over verbatim from the old
  // read-only WYSIWYGEditor, which preserved soft single-newlines inside body
  // text). On the Streamdown ROOT this is harmful: Streamdown splits markdown
  // into per-token blocks and the source's inter-block newlines (e.g. a
  // heading's trailing `\n\n` plus a following blank line) survive as bare text
  // nodes between sibling elements. With `pre-wrap` on the root those collapse
  // into a tall stack of visible blank lines — most visibly a huge gap between
  // a heading and the table/`---` after it. Strip it from the root and re-apply
  // it scoped to prose blocks so intra-paragraph soft newlines still render,
  // while block gaps collapse the way HTML normally does.
  const wantsPreWrap = /(?:^|\s)whitespace-pre-wrap(?:\s|$)/.test(
    className ?? ''
  );
  const rootClassName = (className ?? '')
    .replace(/(?:^|\s)whitespace-pre-wrap(?=\s|$)/g, ' ')
    .trim();

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
        mermaid={mermaidOptions}
        className={cn(
          // Match the old read-only WYSIWYGEditor, whose `wysiwyg text-base`
          // wrapper rendered body text at the legacy `base` size (14px).
          // Without a baseline the content inherits the caller's `text-sm`
          // (12px), making conversation text look smaller. cn() is plain clsx
          // (twMerge disabled), so we must NOT emit `text-base` when the caller
          // already passes an explicit text size — otherwise both classes ship
          // and CSS source order, not prop order, picks the winner.
          !hasTextSize && 'text-base',
          'text-inherit',
          // streamdown 默认用 text-primary 给链接上色,但 legacy design 里
          // --primary 近中性色。通过稳定的 data-streamdown hook 把链接改回
          // 旧编辑器一致的蓝色,不替换 streamdown 的链接组件(保留其链接安全行为)。
          '[&_[data-streamdown=link]]:text-blue-600 dark:[&_[data-streamdown=link]]:text-blue-400',
          // Re-apply the caller's `whitespace-pre-wrap` intent, but scoped to
          // text-bearing blocks only — never the root. This keeps soft newlines
          // inside paragraphs/list items/quotes while letting the inter-block
          // whitespace text nodes collapse (no giant heading→table gap).
          wantsPreWrap && '[&_:where(p,li,blockquote)]:whitespace-pre-wrap',
          rootClassName
        )}
      >
        {content}
      </Streamdown>
    </div>
  );
}

export default memo(ReadOnlyMarkdown);
