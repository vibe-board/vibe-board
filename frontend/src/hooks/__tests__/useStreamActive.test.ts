import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useStreamActive } from '../useStreamActive';
import { streamRegistry } from '@/lib/connections/streamRegistry';

beforeEach(() => {
  streamRegistry.setActiveKey(undefined);
});

describe('useStreamActive', () => {
  it('returns true for global scope', () => {
    const { result } = renderHook(() => useStreamActive({ scope: 'global' }));
    expect(result.current).toBe(true);
  });

  it('re-renders when active key changes for an active-scope stream', () => {
    const { result } = renderHook(() =>
      useStreamActive({ scope: 'active', ownerKey: 's1' })
    );
    expect(result.current).toBe(false);
    act(() => streamRegistry.setActiveKey('s1'));
    expect(result.current).toBe(true);
    act(() => streamRegistry.setActiveKey('s2'));
    expect(result.current).toBe(false);
  });

  it('returns true when meta is undefined', () => {
    const { result } = renderHook(() => useStreamActive(undefined));
    expect(result.current).toBe(true);
  });
});
