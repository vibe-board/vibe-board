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
});
