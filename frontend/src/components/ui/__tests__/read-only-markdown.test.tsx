import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import ReadOnlyMarkdown from '../read-only-markdown';

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
    expect(container.querySelector('[contenteditable]')).toBeNull();
    expect(container.querySelector('[data-lexical-editor]')).toBeNull();
  });

  it('renders GFM tables', () => {
    const md = ['| a | b |', '| - | - |', '| 1 | 2 |'].join('\n');
    const { container } = render(<ReadOnlyMarkdown content={md} />);
    expect(container.querySelector('table')).not.toBeNull();
  });

  // Regression: PlanPresentationCard (and other callers) pass
  // `whitespace-pre-wrap` — carried over verbatim from the old WYSIWYGEditor.
  // Streamdown splits markdown into per-token blocks, leaving the source's
  // inter-block newlines as bare text nodes between siblings. On the root,
  // `pre-wrap` turns those into a tall stack of blank lines (a huge gap between
  // e.g. a heading and the following table). The root must NOT carry a bare
  // whitespace-pre-wrap; it belongs scoped to prose blocks instead.
  it('does not leak whitespace-pre-wrap onto the Streamdown root (block-gap regression)', () => {
    const md = ['## Heading', '', '| a | b |', '| - | - |', '| 1 | 2 |'].join(
      '\n'
    );
    const { container } = render(
      <ReadOnlyMarkdown
        content={md}
        className="whitespace-pre-wrap break-words"
      />
    );
    // The block container is the element that also lays blocks out (space-y-*).
    const root = container.querySelector('[class*="space-y"]');
    expect(root).not.toBeNull();
    expect(root?.className).not.toMatch(/(?:^|\s)whitespace-pre-wrap(?:\s|$)/);
  });

  it('re-applies the caller pre-wrap intent scoped to prose blocks', () => {
    const { container } = render(
      <ReadOnlyMarkdown content={'a\nb'} className="whitespace-pre-wrap" />
    );
    // The scoped arbitrary variant survives on some element so soft single
    // newlines inside paragraphs still render as breaks.
    expect(
      container.querySelector('[class*="whitespace-pre-wrap"]')
    ).not.toBeNull();
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

  // The old read-only WYSIWYGEditor wrapped content in `text-base` (legacy 14px).
  // Streamdown inherits font-size, so without a baseline the conversation text
  // shrank to the surrounding `text-sm` (12px). Guard the baseline + override.
  it('applies a text-base baseline when no text size is given', () => {
    const { container } = render(<ReadOnlyMarkdown content={'hi'} />);
    const root = container.querySelector('[class*="text-base"]');
    expect(root).not.toBeNull();
  });

  it('defers to an explicit caller text size without emitting a conflicting text-base', () => {
    const { container } = render(
      <ReadOnlyMarkdown content={'hi'} className="text-sm" />
    );
    const sized = container.querySelector('.text-sm');
    expect(sized).not.toBeNull();
    // cn() is plain clsx (no twMerge), so both classes would otherwise ship and
    // CSS source order — not prop order — would decide. Ensure text-base is gone.
    expect(sized?.className).not.toMatch(/(?:^|\s)text-base(?:\s|$)/);
  });

  // The mermaid plugin must be registered; otherwise streamdown renders the
  // "add the mermaid plugin to enable diagram rendering" fallback instead of a
  // diagram. We assert that fallback is absent (the async SVG render itself
  // doesn't resolve in jsdom, so checking the negative is the reliable signal).
  it('registers the mermaid plugin (no "plugin not available" fallback)', () => {
    const md = ['```mermaid', 'graph TD; A-->B;', '```'].join('\n');
    const { container } = render(<ReadOnlyMarkdown content={md} />);
    expect(container.textContent ?? '').not.toMatch(/mermaid plugin/i);
  });

  it('does not throw rendering a mermaid block', () => {
    const md = ['```mermaid', 'sequenceDiagram; Alice->>Bob: Hi', '```'].join(
      '\n'
    );
    expect(() => render(<ReadOnlyMarkdown content={md} />)).not.toThrow();
  });
});
