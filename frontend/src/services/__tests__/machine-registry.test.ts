import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const disconnectSpies: Array<() => void> = [];

vi.mock('@/lib/connections/gatewayConnection', () => ({
  GatewayMachineConnection: class {
    disconnect = vi.fn(() => {
      disconnectSpies.push(() => {});
    });
    id: string;
    constructor(id: string) {
      this.id = id;
    }
  },
}));

describe('machine-registry', () => {
  beforeEach(() => {
    vi.resetModules();
    disconnectSpies.length = 0;
  });

  afterEach(() => {
    disconnectSpies.length = 0;
  });

  it('getOrCreate returns the same instance across calls', async () => {
    const reg = await import('../machine-registry');
    const session = { sessionToken: 't', userId: 'u' };
    const a = reg.getOrCreate('c1', 'm1', 'https://gw', session, 'host1');
    const b = reg.getOrCreate('c1', 'm1', 'https://gw', session, 'host1');
    expect(a).toBe(b);
  });

  it('destroy removes instance and calls disconnect', async () => {
    const reg = await import('../machine-registry');
    const session = { sessionToken: 't', userId: 'u' };
    const c = reg.getOrCreate(
      'c1',
      'm1',
      'https://gw',
      session,
      'host1'
    ) as any;
    reg.destroy('c1', 'm1');
    expect(c.disconnect).toHaveBeenCalledOnce();
    const d = reg.getOrCreate('c1', 'm1', 'https://gw', session, 'host1');
    expect(d).not.toBe(c);
  });

  it('destroyAllForConnection removes only entries matching that connId', async () => {
    const reg = await import('../machine-registry');
    const session = { sessionToken: 't', userId: 'u' };
    const c1m1 = reg.getOrCreate(
      'c1',
      'm1',
      'https://gw',
      session,
      'h1'
    ) as any;
    const c1m2 = reg.getOrCreate(
      'c1',
      'm2',
      'https://gw',
      session,
      'h2'
    ) as any;
    const c2m1 = reg.getOrCreate(
      'c2',
      'm1',
      'https://gw',
      session,
      'h3'
    ) as any;
    reg.destroyAllForConnection('c1');
    expect(c1m1.disconnect).toHaveBeenCalledOnce();
    expect(c1m2.disconnect).toHaveBeenCalledOnce();
    expect(c2m1.disconnect).not.toHaveBeenCalled();
  });
});
