import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { streamJsonPatchEntries } from '../streamJsonPatchEntries';

// Mock gatewayMode to return null (no E2EE, use native WebSocket)
vi.mock('@/lib/gatewayMode', () => ({
  getGatewayConnection: () => null,
}));

/**
 * Minimal WebSocket mock that lets us control open/message/close events.
 */
class MockWebSocket {
  static instances: MockWebSocket[] = [];

  onopen: ((ev: Event) => void) | null = null;
  onmessage: ((ev: MessageEvent) => void) | null = null;
  onerror: ((ev: Event) => void) | null = null;
  onclose: ((ev: CloseEvent) => void) | null = null;
  url: string;
  closeCalled = false;

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
  }

  close() {
    this.closeCalled = true;
  }

  // Test helpers
  simulateOpen() {
    this.onopen?.(new Event('open'));
  }

  simulateMessage(data: unknown) {
    this.onmessage?.(
      new MessageEvent('message', { data: JSON.stringify(data) })
    );
  }

  simulateClose(code = 1006, wasClean = false) {
    this.onclose?.(new CloseEvent('close', { code, wasClean }));
  }
}

beforeEach(() => {
  MockWebSocket.instances = [];
  vi.stubGlobal('WebSocket', MockWebSocket);
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('streamJsonPatchEntries', () => {
  describe('maxEntryIndex tracking', () => {
    it('tracks the highest entry index from patch paths', () => {
      const onEntries = vi.fn();
      const getReconnectUrl = vi.fn(
        (maxIndex: number) => `/live?after=${maxIndex}`
      );

      const controller = streamJsonPatchEntries('/initial', {
        onEntries,
        reconnect: { maxRetries: 3, getReconnectUrl },
      });

      const ws = MockWebSocket.instances[0];
      ws.simulateOpen();

      // Send entries 0, 1, 2
      ws.simulateMessage({
        JsonPatch: [{ op: 'add', path: '/entries/0', value: { type: 'A' } }],
      });
      ws.simulateMessage({
        JsonPatch: [{ op: 'add', path: '/entries/1', value: { type: 'B' } }],
      });
      ws.simulateMessage({
        JsonPatch: [{ op: 'add', path: '/entries/2', value: { type: 'C' } }],
      });

      expect(controller.getEntries()).toHaveLength(3);

      // Simulate unclean close — should reconnect with after=2
      ws.simulateClose(1006, false);
      vi.advanceTimersByTime(500); // first backoff: 500ms

      expect(MockWebSocket.instances).toHaveLength(2);
      expect(getReconnectUrl).toHaveBeenCalledWith(2);
      expect(MockWebSocket.instances[1].url).toBe('/live?after=2');

      controller.close();
    });
  });

  describe('snapshot preservation across reconnects', () => {
    it('preserves cached entries when reconnecting', () => {
      const onEntries = vi.fn();

      const controller = streamJsonPatchEntries('/initial', {
        onEntries,
        reconnect: {
          maxRetries: 3,
          getReconnectUrl: (maxIndex) => `/live?after=${maxIndex}`,
        },
      });

      const ws1 = MockWebSocket.instances[0];
      ws1.simulateOpen();

      // Receive 3 entries
      ws1.simulateMessage({
        JsonPatch: [{ op: 'add', path: '/entries/0', value: { id: 0 } }],
      });
      ws1.simulateMessage({
        JsonPatch: [{ op: 'add', path: '/entries/1', value: { id: 1 } }],
      });
      ws1.simulateMessage({
        JsonPatch: [{ op: 'add', path: '/entries/2', value: { id: 2 } }],
      });

      expect(controller.getEntries()).toHaveLength(3);

      // Drop connection
      ws1.simulateClose(1006, false);
      vi.advanceTimersByTime(500);

      // Entries still present before reconnect completes
      expect(controller.getEntries()).toHaveLength(3);

      // Reconnect opens, sends entry 3
      const ws2 = MockWebSocket.instances[1];
      ws2.simulateOpen();
      ws2.simulateMessage({
        JsonPatch: [{ op: 'add', path: '/entries/3', value: { id: 3 } }],
      });

      // Now we have 4 entries — 3 cached + 1 new
      expect(controller.getEntries()).toHaveLength(4);
      expect(controller.getEntries()[0]).toEqual({ id: 0 });
      expect(controller.getEntries()[3]).toEqual({ id: 3 });

      controller.close();
    });
  });

  describe('replace operations after reconnect', () => {
    it('applies replace patches to existing cached entries', () => {
      const onEntries = vi.fn();

      const controller = streamJsonPatchEntries('/initial', {
        onEntries,
        reconnect: {
          maxRetries: 3,
          getReconnectUrl: (maxIndex) => `/live?after=${maxIndex}`,
        },
      });

      const ws1 = MockWebSocket.instances[0];
      ws1.simulateOpen();

      ws1.simulateMessage({
        JsonPatch: [
          { op: 'add', path: '/entries/0', value: { status: 'pending' } },
        ],
      });
      expect(controller.getEntries()[0]).toEqual({ status: 'pending' });

      // Drop and reconnect
      ws1.simulateClose(1006, false);
      vi.advanceTimersByTime(500);

      const ws2 = MockWebSocket.instances[1];
      ws2.simulateOpen();

      // Server sends a replace for entry 0 (status updated)
      ws2.simulateMessage({
        JsonPatch: [
          { op: 'replace', path: '/entries/0', value: { status: 'success' } },
        ],
      });

      expect(controller.getEntries()[0]).toEqual({ status: 'success' });
      expect(controller.getEntries()).toHaveLength(1);

      controller.close();
    });
  });

  describe('exponential backoff', () => {
    it('uses exponential backoff: 500ms, 1s, 2s, 4s, 8s', () => {
      const controller = streamJsonPatchEntries('/initial', {
        reconnect: {
          maxRetries: 5,
          getReconnectUrl: () => '/live',
        },
      });

      const ws1 = MockWebSocket.instances[0];
      ws1.simulateOpen();
      ws1.simulateClose(1006, false);

      // Attempt 1: 500ms
      vi.advanceTimersByTime(499);
      expect(MockWebSocket.instances).toHaveLength(1);
      vi.advanceTimersByTime(1);
      expect(MockWebSocket.instances).toHaveLength(2);

      // Attempt 2: 1000ms
      MockWebSocket.instances[1].simulateClose(1006, false);
      vi.advanceTimersByTime(999);
      expect(MockWebSocket.instances).toHaveLength(2);
      vi.advanceTimersByTime(1);
      expect(MockWebSocket.instances).toHaveLength(3);

      // Attempt 3: 2000ms
      MockWebSocket.instances[2].simulateClose(1006, false);
      vi.advanceTimersByTime(1999);
      expect(MockWebSocket.instances).toHaveLength(3);
      vi.advanceTimersByTime(1);
      expect(MockWebSocket.instances).toHaveLength(4);

      // Attempt 4: 4000ms
      MockWebSocket.instances[3].simulateClose(1006, false);
      vi.advanceTimersByTime(3999);
      expect(MockWebSocket.instances).toHaveLength(4);
      vi.advanceTimersByTime(1);
      expect(MockWebSocket.instances).toHaveLength(5);

      // Attempt 5: 8000ms (capped)
      MockWebSocket.instances[4].simulateClose(1006, false);
      vi.advanceTimersByTime(7999);
      expect(MockWebSocket.instances).toHaveLength(5);
      vi.advanceTimersByTime(1);
      expect(MockWebSocket.instances).toHaveLength(6);

      controller.close();
    });

    it('stops retrying after maxRetries', () => {
      const controller = streamJsonPatchEntries('/initial', {
        reconnect: {
          maxRetries: 2,
          getReconnectUrl: () => '/live',
        },
      });

      const ws1 = MockWebSocket.instances[0];
      ws1.simulateOpen();
      ws1.simulateClose(1006, false);

      // Retry 1
      vi.advanceTimersByTime(500);
      expect(MockWebSocket.instances).toHaveLength(2);
      MockWebSocket.instances[1].simulateClose(1006, false);

      // Retry 2
      vi.advanceTimersByTime(1000);
      expect(MockWebSocket.instances).toHaveLength(3);
      MockWebSocket.instances[2].simulateClose(1006, false);

      // No more retries
      vi.advanceTimersByTime(10000);
      expect(MockWebSocket.instances).toHaveLength(3);

      controller.close();
    });

    it('resets retry count on successful reconnect', () => {
      const controller = streamJsonPatchEntries('/initial', {
        reconnect: {
          maxRetries: 3,
          getReconnectUrl: () => '/live',
        },
      });

      const ws1 = MockWebSocket.instances[0];
      ws1.simulateOpen();
      ws1.simulateClose(1006, false);

      // Retry 1: 500ms
      vi.advanceTimersByTime(500);
      const ws2 = MockWebSocket.instances[1];
      ws2.simulateOpen(); // success — resets retry count

      // Drop again
      ws2.simulateClose(1006, false);

      // Should start from 500ms again, not 1000ms
      vi.advanceTimersByTime(500);
      expect(MockWebSocket.instances).toHaveLength(3);

      controller.close();
    });
  });

  describe('no-reconnect scenarios', () => {
    it('does not reconnect after finished message', () => {
      const controller = streamJsonPatchEntries('/initial', {
        reconnect: {
          maxRetries: 3,
          getReconnectUrl: () => '/live',
        },
      });

      const ws1 = MockWebSocket.instances[0];
      ws1.simulateOpen();
      ws1.simulateMessage({ finished: true });

      // In a real browser, ws.close() fires onclose — simulate that
      ws1.simulateClose(1000, true);

      // finished flag prevents reconnect even though onclose fired
      vi.advanceTimersByTime(10000);
      expect(MockWebSocket.instances).toHaveLength(1);

      controller.close();
    });

    it('does not reconnect after close() is called', () => {
      const controller = streamJsonPatchEntries('/initial', {
        reconnect: {
          maxRetries: 3,
          getReconnectUrl: () => '/live',
        },
      });

      const ws1 = MockWebSocket.instances[0];
      ws1.simulateOpen();

      controller.close();
      ws1.simulateClose(1006, false);

      vi.advanceTimersByTime(10000);
      expect(MockWebSocket.instances).toHaveLength(1);
    });

    it('does not reconnect when no reconnect config is provided', () => {
      const controller = streamJsonPatchEntries('/initial', {});

      const ws1 = MockWebSocket.instances[0];
      ws1.simulateOpen();
      ws1.simulateClose(1006, false);

      vi.advanceTimersByTime(10000);
      expect(MockWebSocket.instances).toHaveLength(1);

      controller.close();
    });
  });

  describe('isReconnecting state', () => {
    it('returns true during reconnection attempts', () => {
      const controller = streamJsonPatchEntries('/initial', {
        reconnect: {
          maxRetries: 3,
          getReconnectUrl: () => '/live',
        },
      });

      const ws1 = MockWebSocket.instances[0];
      ws1.simulateOpen();
      expect(controller.isReconnecting()).toBe(false);

      ws1.simulateClose(1006, false);
      expect(controller.isReconnecting()).toBe(true);

      vi.advanceTimersByTime(500);
      const ws2 = MockWebSocket.instances[1];
      ws2.simulateOpen();
      expect(controller.isReconnecting()).toBe(false);

      controller.close();
    });
  });
});
