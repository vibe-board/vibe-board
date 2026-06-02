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
        className={cn(
          'text-inherit',
          // streamdown 默认用 text-primary 给链接上色,但 legacy design 里
          // --primary 近中性色。通过稳定的 data-streamdown hook 把链接改回
          // 旧编辑器一致的蓝色,不替换 streamdown 的链接组件(保留其链接安全行为)。
          '[&_[data-streamdown=link]]:text-blue-600 dark:[&_[data-streamdown=link]]:text-blue-400',
          className
        )}
      >
        {content}
      </Streamdown>
    </div>
  );
}

export default memo(ReadOnlyMarkdown);
