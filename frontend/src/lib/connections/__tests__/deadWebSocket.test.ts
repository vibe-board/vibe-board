import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createDeadWebSocket } from '../deadWebSocket';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('createDeadWebSocket', () => {
  it('starts in CLOSED state and never throws on construct', () => {
    const ws = createDeadWebSocket('Not connected');
    expect(ws.readyState).toBe(3);
  });

  it('fires onerror then onclose(1000, wasClean) asynchronously', () => {
    const ws = createDeadWebSocket('boom');
    const onerror = vi.fn();
    const onclose = vi.fn();
    ws.onerror = onerror;
    ws.onclose = onclose;

    vi.runAllTimers();

    expect(onerror).toHaveBeenCalledTimes(1);
    expect(onclose).toHaveBeenCalledTimes(1);
    const ev = onclose.mock.calls[0][0] as CloseEvent;
    expect(ev.code).toBe(1000);
    expect(ev.wasClean).toBe(true);
    expect(ev.reason).toBe('boom');
  });

  it('does not fire handlers if consumer closes before the timer runs', () => {
    const ws = createDeadWebSocket('boom');
    const onclose = vi.fn();
    ws.onclose = onclose;
    ws.close();

    vi.runAllTimers();

    expect(onclose).not.toHaveBeenCalled();
  });

  it('send() is a no-op and does not throw', () => {
    const ws = createDeadWebSocket('x');
    expect(() => ws.send('hello')).not.toThrow();
  });
});
