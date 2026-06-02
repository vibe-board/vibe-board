import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { GatewaySession } from '../types';

// Fake E2EEConnection so we never touch real crypto / WebSocket.
const e2ee = vi.hoisted(() => {
  const instances: FakeE2EE[] = [];
  class FakeE2EE {
    options: Record<string, any> | null = null;
    openWsStream = vi.fn(() => ({}) as unknown);
    constructor() {
      instances.push(this);
    }
    async connect(options: Record<string, any>) {
      this.options = options;
      options.onConnect?.();
    }
    subscribeMachine() {}
    async initDek() {}
    disconnect() {}
  }
  return { instances, FakeE2EE };
});

vi.mock('@/lib/e2ee', () => ({ E2EEConnection: e2ee.FakeE2EE }));

const SESSION: GatewaySession = { sessionToken: 't', userId: 'u' };

beforeEach(() => {
  e2ee.instances.length = 0;
  vi.clearAllMocks();
});

describe('GatewayMachineConnection.openWs (Layer 3 backstop)', () => {
  it('returns a dead socket (no throw) when not connected', async () => {
    const { GatewayMachineConnection } = await import('../gatewayConnection');
    const c = new GatewayMachineConnection(
      'conn:m1',
      'http://gw',
      'label',
      'http://gw',
      SESSION,
      'm1'
    );
    // never connected → e2eeConn is null
    const ws = c.openWs('/api/x');
    expect(ws.readyState).toBe(3);
  });

  it('returns a dead socket when openWsStream throws (null DEK)', async () => {
    const { GatewayMachineConnection } = await import('../gatewayConnection');
    const c = new GatewayMachineConnection(
      'conn:m1',
      'http://gw',
      'label',
      'http://gw',
      SESSION,
      'm1'
    );
    await c.connect();
    // simulate post-machine_offline state: stream open throws
    e2ee.instances[0].openWsStream = vi.fn(() => {
      throw new Error('DEK not established');
    });
    const ws = c.openWs('/api/x');
    expect(ws.readyState).toBe(3);
  });
});

describe('GatewayMachineConnection status flips (Layer 2)', () => {
  it('is connected after connect()', async () => {
    const { GatewayMachineConnection } = await import('../gatewayConnection');
    const c = new GatewayMachineConnection(
      'conn:m1',
      'http://gw',
      'label',
      'http://gw',
      SESSION,
      'm1'
    );
    await c.connect();
    expect(c.status).toBe('connected');
  });

  it('flips to reconnecting on machine offline, back to connected on online', async () => {
    const { GatewayMachineConnection } = await import('../gatewayConnection');
    const c = new GatewayMachineConnection(
      'conn:m1',
      'http://gw',
      'label',
      'http://gw',
      SESSION,
      'm1'
    );
    await c.connect();
    const opts = e2ee.instances[0].options!;

    // Register the listener AFTER connect so we only capture the offline/online
    // transitions (connect itself emits 'connecting' then 'connected').
    const seen: Array<[string, string | null]> = [];
    c.onStatusChange((s, e) => seen.push([s, e]));

    opts.onMachineOffline();
    expect(c.status).toBe('reconnecting');
    expect(c.error).toBe('Machine offline');

    opts.onMachineOnline();
    expect(c.status).toBe('connected');
    expect(c.error).toBeNull();

    expect(seen).toEqual([
      ['reconnecting', 'Machine offline'],
      ['connected', null],
    ]);
  });

  it('machine offline does NOT spin up a second E2EEConnection (no gateway-level reconnect)', async () => {
    const { GatewayMachineConnection } = await import('../gatewayConnection');
    const c = new GatewayMachineConnection(
      'conn:m1',
      'http://gw',
      'label',
      'http://gw',
      SESSION,
      'm1'
    );
    await c.connect();
    e2ee.instances[0].options!.onMachineOffline();
    expect(e2ee.instances).toHaveLength(1);
  });
});
