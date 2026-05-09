import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/appMode', () => ({
  isLocalDirect: false,
  isGateway: true,
  isTauri: false,
  appMode: 'gateway',
}));
vi.mock('@/stores/migration', () => ({ runMigrationIfNeeded: vi.fn() }));

describe('gateway-service.fetchRegistrationStatus', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.resetModules();
    delete (globalThis as any).fetch;
    delete (globalThis as any).WebSocket;
    Object.defineProperty(window, 'location', {
      value: { origin: 'https://gw.example' },
      writable: true,
      configurable: true,
    });
  });

  it('writes registrationOpen=true into the store on 200', async () => {
    const { useConnectionStore, GATEWAY_SELF_ID } = await import(
      '@/stores/connection-store'
    );
    const { fetchRegistrationStatus } = await import('../gateway-service');

    useConnectionStore.getState().init();
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({ open: true }),
    })) as any;

    await fetchRegistrationStatus(GATEWAY_SELF_ID, 'https://gw.example');

    const node = useConnectionStore
      .getState()
      .nodes.find((n) => n.entry.id === GATEWAY_SELF_ID)!;
    expect(node.gatewayState!.registrationOpen).toBe(true);
  });

  it('writes registrationOpen=false on fetch throw', async () => {
    const { useConnectionStore, GATEWAY_SELF_ID } = await import(
      '@/stores/connection-store'
    );
    const { fetchRegistrationStatus } = await import('../gateway-service');
    useConnectionStore.getState().init();

    globalThis.fetch = vi.fn(async () => {
      throw new Error('network');
    }) as any;

    await fetchRegistrationStatus(GATEWAY_SELF_ID, 'https://gw.example');

    const node = useConnectionStore
      .getState()
      .nodes.find((n) => n.entry.id === GATEWAY_SELF_ID)!;
    expect(node.gatewayState!.registrationOpen).toBe(false);
  });
});

describe('gateway-service.login', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.resetModules();
    delete (globalThis as any).fetch;
    delete (globalThis as any).WebSocket;
    Object.defineProperty(window, 'location', {
      value: { origin: 'https://gw.example' },
      writable: true,
      configurable: true,
    });
  });

  it('on success sets session, persists it, and clears authLoading', async () => {
    const { useConnectionStore, GATEWAY_SELF_ID } = await import(
      '@/stores/connection-store'
    );
    const { login } = await import('../gateway-service');

    useConnectionStore.getState().init();
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      text: async () => '',
      json: async () => ({ token: 'abc', user_id: 'u-1' }),
    })) as any;
    // Do NOT actually open a real WebSocket in the test
    globalThis.WebSocket = class {
      onopen = null;
      onmessage = null;
      onclose = null;
      onerror = null;
      close() {}
      send() {}
    } as any;

    await login(GATEWAY_SELF_ID, 'https://gw.example', 'a@b', 'pw');

    const node = useConnectionStore
      .getState()
      .nodes.find((n) => n.entry.id === GATEWAY_SELF_ID)!;
    expect(node.gatewayState!.session).toEqual({
      sessionToken: 'abc',
      userId: 'u-1',
    });
    expect(node.gatewayState!.authLoading).toBe(false);
    expect(
      localStorage.getItem(`vb_gateway_session_${GATEWAY_SELF_ID}`)
    ).toBeTruthy();
  });

  it('on failure sets authError and clears authLoading', async () => {
    const { useConnectionStore, GATEWAY_SELF_ID } = await import(
      '@/stores/connection-store'
    );
    const { login } = await import('../gateway-service');

    useConnectionStore.getState().init();
    globalThis.fetch = vi.fn(async () => ({
      ok: false,
      status: 401,
      text: async () => 'Invalid credentials',
      json: async () => ({}),
    })) as any;

    await login(GATEWAY_SELF_ID, 'https://gw.example', 'a@b', 'pw');

    const node = useConnectionStore
      .getState()
      .nodes.find((n) => n.entry.id === GATEWAY_SELF_ID)!;
    expect(node.gatewayState!.session).toBeNull();
    expect(node.gatewayState!.authLoading).toBe(false);
    expect(node.gatewayState!.authError).toBe('Invalid credentials');
  });
});

describe('gateway-service.startMachineListWs', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.resetModules();
    delete (globalThis as any).fetch;
    delete (globalThis as any).WebSocket;
    Object.defineProperty(window, 'location', {
      value: { origin: 'https://gw.example' },
      writable: true,
      configurable: true,
    });
  });

  it("dispatches setMachines on an incoming 'machines' frame", async () => {
    const { useConnectionStore, GATEWAY_SELF_ID } = await import(
      '@/stores/connection-store'
    );
    const { startMachineListWs } = await import('../gateway-service');

    useConnectionStore.getState().init();

    let wsInstance: any;
    globalThis.WebSocket = class {
      onopen: any = null;
      onmessage: any = null;
      onclose: any = null;
      onerror: any = null;
      url: string;
      constructor(url: string) {
        this.url = url;
        wsInstance = this;
      }
      close() {
        this.onclose?.({});
      }
      send() {}
    } as any;

    startMachineListWs(GATEWAY_SELF_ID, 'https://gw.example', {
      sessionToken: 't',
      userId: 'u',
    });

    wsInstance.onmessage({
      data: JSON.stringify({
        type: 'machines',
        machines: [
          { machine_id: 'm1', hostname: 'h', platform: 'linux', port: 1234 },
        ],
      }),
    });

    const node = useConnectionStore
      .getState()
      .nodes.find((n) => n.entry.id === GATEWAY_SELF_ID)!;
    expect(node.gatewayState!.machines).toHaveLength(1);
    expect(node.gatewayState!.machines[0].machine_id).toBe('m1');
  });

  it("dispatches upsertMachine on 'machine_online' frame", async () => {
    const { useConnectionStore, GATEWAY_SELF_ID } = await import(
      '@/stores/connection-store'
    );
    const { startMachineListWs } = await import('../gateway-service');
    useConnectionStore.getState().init();

    let wsInstance: any;
    globalThis.WebSocket = class {
      onmessage: any = null;
      onclose: any = null;
      onerror: any = null;
      constructor() {
        wsInstance = this;
      }
      close() {}
    } as any;

    startMachineListWs(GATEWAY_SELF_ID, 'https://gw.example', {
      sessionToken: 't',
      userId: 'u',
    });

    wsInstance.onmessage({
      data: JSON.stringify({
        type: 'machine_online',
        machine_id: 'm2',
        hostname: 'h2',
        platform: 'darwin',
        port: 9999,
      }),
    });

    const node = useConnectionStore
      .getState()
      .nodes.find((n) => n.entry.id === GATEWAY_SELF_ID)!;
    expect(node.gatewayState!.machines).toHaveLength(1);
    expect(node.gatewayState!.machines[0].machine_id).toBe('m2');
  });

  it("removes machine on 'machine_offline' frame", async () => {
    const { useConnectionStore, GATEWAY_SELF_ID } = await import(
      '@/stores/connection-store'
    );
    const { startMachineListWs } = await import('../gateway-service');
    useConnectionStore.getState().init();

    let wsInstance: any;
    globalThis.WebSocket = class {
      onmessage: any = null;
      onclose: any = null;
      onerror: any = null;
      constructor() {
        wsInstance = this;
      }
      close() {}
    } as any;

    startMachineListWs(GATEWAY_SELF_ID, 'https://gw.example', {
      sessionToken: 't',
      userId: 'u',
    });

    wsInstance.onmessage({
      data: JSON.stringify({
        type: 'machines',
        machines: [{ machine_id: 'm1', hostname: '', platform: '', port: 0 }],
      }),
    });
    wsInstance.onmessage({
      data: JSON.stringify({ type: 'machine_offline', machine_id: 'm1' }),
    });

    const node = useConnectionStore
      .getState()
      .nodes.find((n) => n.entry.id === GATEWAY_SELF_ID)!;
    expect(node.gatewayState!.machines).toHaveLength(0);
  });

  it('is idempotent: second call is a no-op if a socket is already open', async () => {
    const { useConnectionStore, GATEWAY_SELF_ID } = await import(
      '@/stores/connection-store'
    );
    const { startMachineListWs } = await import('../gateway-service');
    useConnectionStore.getState().init();

    const wsSpy = vi.fn();
    globalThis.WebSocket = class {
      onmessage: any = null;
      onclose: any = null;
      onerror: any = null;
      constructor(url: string) {
        wsSpy(url);
      }
      close() {}
    } as any;

    startMachineListWs(GATEWAY_SELF_ID, 'https://gw.example', {
      sessionToken: 't',
      userId: 'u',
    });
    startMachineListWs(GATEWAY_SELF_ID, 'https://gw.example', {
      sessionToken: 't',
      userId: 'u',
    });
    expect(wsSpy).toHaveBeenCalledOnce();
  });
});

describe('gateway-service.logout', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.resetModules();
    delete (globalThis as any).fetch;
    delete (globalThis as any).WebSocket;
    Object.defineProperty(window, 'location', {
      value: { origin: 'https://gw.example' },
      writable: true,
      configurable: true,
    });
  });

  it('clears session, removes persisted session, empties machines', async () => {
    const { useConnectionStore, GATEWAY_SELF_ID } = await import(
      '@/stores/connection-store'
    );
    const { logout } = await import('../gateway-service');

    useConnectionStore.getState().init();
    useConnectionStore.getState().setGatewayField(GATEWAY_SELF_ID, 'session', {
      sessionToken: 't',
      userId: 'u',
    });
    useConnectionStore
      .getState()
      .setMachines(GATEWAY_SELF_ID, [
        { machine_id: 'm1', hostname: '', platform: '', port: 0 },
      ]);
    localStorage.setItem(
      `vb_gateway_session_${GATEWAY_SELF_ID}`,
      JSON.stringify({ sessionToken: 't', userId: 'u' })
    );

    globalThis.WebSocket = class {
      onmessage: any = null;
      onclose: any = null;
      onerror: any = null;
      close() {}
    } as any;

    logout(GATEWAY_SELF_ID);

    const node = useConnectionStore
      .getState()
      .nodes.find((n) => n.entry.id === GATEWAY_SELF_ID)!;
    expect(node.gatewayState!.session).toBeNull();
    expect(node.gatewayState!.machines).toEqual([]);
    expect(
      localStorage.getItem(`vb_gateway_session_${GATEWAY_SELF_ID}`)
    ).toBeNull();
  });
});
