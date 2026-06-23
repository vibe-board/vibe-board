import { describe, it, expect, vi, beforeEach } from 'vitest';
import { streamRegistry } from '../streamRegistry';

beforeEach(() => {
  streamRegistry.setActiveKey(undefined);
});

describe('streamRegistry.isActive', () => {
  it('global streams are always active regardless of activeKey', () => {
    streamRegistry.setActiveKey(undefined);
    expect(streamRegistry.isActive({ scope: 'global' })).toBe(true);
    streamRegistry.setActiveKey('s1');
    expect(streamRegistry.isActive({ scope: 'global' })).toBe(true);
  });

  it('active streams are active only when ownerKey === activeKey', () => {
    streamRegistry.setActiveKey('s1');
    expect(streamRegistry.isActive({ scope: 'active', ownerKey: 's1' })).toBe(
      true
    );
    expect(streamRegistry.isActive({ scope: 'active', ownerKey: 's2' })).toBe(
      false
    );
  });

  it('active streams with no ownerKey fail open (treated active)', () => {
    streamRegistry.setActiveKey('s1');
    expect(streamRegistry.isActive({ scope: 'active' })).toBe(true);
  });

  it('active streams are background when no activeKey is set', () => {
    streamRegistry.setActiveKey(undefined);
    expect(streamRegistry.isActive({ scope: 'active', ownerKey: 's1' })).toBe(
      false
    );
  });

  it('notifies subscribers when activeKey changes and supports unsubscribe', () => {
    const cb = vi.fn();
    const unsub = streamRegistry.subscribe(cb);
    streamRegistry.setActiveKey('s1');
    expect(cb).toHaveBeenCalledTimes(1);
    streamRegistry.setActiveKey('s1');
    expect(cb).toHaveBeenCalledTimes(1);
    streamRegistry.setActiveKey('s2');
    expect(cb).toHaveBeenCalledTimes(2);
    unsub();
    streamRegistry.setActiveKey('s3');
    expect(cb).toHaveBeenCalledTimes(2);
  });
});
