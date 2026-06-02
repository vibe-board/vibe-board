import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { E2EEConnection } from '../connection';

// Controllable global WebSocket mock.
class MockWebSocket {
  static instances: MockWebSocket[] = [];
  static OPEN = 1;
  onopen: ((ev: Event) => void) | null = null;
  onmessage: ((ev: MessageEvent) => void) | null = null;
  onclose: ((ev: CloseEvent) => void) | null = null;
  onerror: ((ev: Event) => void) | null = null;
  readyState = 1;
  url: string;
  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
  }
  send() {}
  close() {}
  emit(data: unknown) {
    this.onmessage?.(
      new MessageEvent('message', { data: JSON.stringify(data) })
    );
  }
}

beforeEach(() => {
  MockWebSocket.instances = [];
  vi.stubGlobal('WebSocket', MockWebSocket);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function connected(opts: Record<string, unknown>) {
  const conn = new E2EEConnection();
  const p = conn.connect({
    gatewayUrl: 'http://gw',
    sessionToken: 't',
    machineId: 'm1',
    ...opts,
  });
  const ws = MockWebSocket.instances[0];
  ws.onopen?.(new Event('open'));
  ws.emit({ type: 'auth_ok', user_id: 'u' });
  await p;
  return { conn, ws };
}

describe('E2EEConnection machine offline/online callbacks', () => {
  it('fires onMachineOffline for the subscribed machine', async () => {
    const onMachineOffline = vi.fn();
    const { ws } = await connected({ onMachineOffline });
    ws.emit({ type: 'machine_offline', machine_id: 'm1' });
    expect(onMachineOffline).toHaveBeenCalledTimes(1);
  });

  it('does NOT fire onMachineOffline for a different machine', async () => {
    const onMachineOffline = vi.fn();
    const { ws } = await connected({ onMachineOffline });
    ws.emit({ type: 'machine_offline', machine_id: 'other' });
    expect(onMachineOffline).not.toHaveBeenCalled();
  });

  it('fires onMachineOnline only after DEK re-init resolves', async () => {
    const onMachineOnline = vi.fn();
    const { conn, ws } = await connected({ onMachineOnline });
    const initSpy = vi.spyOn(conn, 'initDek').mockResolvedValue(undefined);

    ws.emit({
      type: 'machine_online',
      machine_id: 'm1',
      hostname: 'h',
      platform: 'p',
      port: 1,
    });

    expect(initSpy).toHaveBeenCalledTimes(1);
    await vi.waitFor(() => expect(onMachineOnline).toHaveBeenCalledTimes(1));
  });

  it('does NOT fire onMachineOnline when DEK re-init fails', async () => {
    const onMachineOnline = vi.fn();
    const { conn, ws } = await connected({ onMachineOnline });
    vi.spyOn(conn, 'initDek').mockRejectedValue(new Error('dek failed'));
    // Silence + observe the expected console.error from the .catch handler.
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    ws.emit({
      type: 'machine_online',
      machine_id: 'm1',
      hostname: 'h',
      platform: 'p',
      port: 1,
    });

    // Wait until the rejection's .catch has actually run, then assert the
    // online callback was never fired (robust negative — not "not yet").
    await vi.waitFor(() => expect(errSpy).toHaveBeenCalled());
    expect(onMachineOnline).not.toHaveBeenCalled();
  });
});
