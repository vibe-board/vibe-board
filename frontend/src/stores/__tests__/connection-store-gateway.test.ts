import { describe, it, expect, vi, beforeEach } from 'vitest';

// Important: mock appMode BEFORE importing connection-store
vi.mock('@/lib/appMode', () => ({
  isLocalDirect: false,
  isGateway: true,
  isTauri: false,
  appMode: 'gateway',
}));

// Avoid loading the real e2ee crypto / migration in tests
vi.mock('@/stores/migration', () => ({ runMigrationIfNeeded: vi.fn() }));

describe('connection-store gateway-self seeding', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.resetModules();
  });

  it('seeds a single gateway-self connection on init when localStorage is empty', async () => {
    const { useConnectionStore, GATEWAY_SELF_ID } = await import(
      '../connection-store'
    );
    Object.defineProperty(window, 'location', {
      value: { origin: 'https://gateway.example.com' },
      writable: true,
      configurable: true,
    });

    useConnectionStore.getState().init();

    const nodes = useConnectionStore.getState().nodes;
    expect(nodes).toHaveLength(1);
    expect(nodes[0].entry.id).toBe(GATEWAY_SELF_ID);
    expect(nodes[0].entry.type).toBe('gateway');
    expect(nodes[0].entry.url).toBe('https://gateway.example.com');
  });

  it('does NOT persist gateway-mode entries to localStorage (preserves tauri data)', async () => {
    const { useConnectionStore } = await import('../connection-store');

    // Seed previous tauri connections in localStorage
    localStorage.setItem(
      'vb_connections',
      JSON.stringify([
        { id: 'tauri-1', type: 'gateway', url: 'https://other.example.com' },
        { id: 'tauri-2', type: 'direct', url: 'http://laptop.local:3001' },
      ])
    );
    Object.defineProperty(window, 'location', {
      value: { origin: 'https://gateway.example.com' },
      writable: true,
      configurable: true,
    });

    useConnectionStore.getState().init();

    // localStorage should still hold the original tauri entries (untouched)
    const persisted = JSON.parse(localStorage.getItem('vb_connections')!);
    expect(persisted.map((e: { id: string }) => e.id)).toEqual([
      'tauri-1',
      'tauri-2',
    ]);

    // But in-memory nodes should ONLY include gateway-self
    const nodes = useConnectionStore.getState().nodes;
    expect(nodes.map((n) => n.entry.id)).toEqual(['gateway-self']);
  });

  it('removeConnection refuses to remove gateway-self', async () => {
    const { useConnectionStore, GATEWAY_SELF_ID } = await import(
      '../connection-store'
    );
    Object.defineProperty(window, 'location', {
      value: { origin: 'https://gateway.example.com' },
      writable: true,
      configurable: true,
    });

    useConnectionStore.getState().init();
    const before = useConnectionStore.getState().nodes.length;

    useConnectionStore.getState().removeConnection(GATEWAY_SELF_ID);

    expect(useConnectionStore.getState().nodes).toHaveLength(before);
  });

  it('persists machineSecrets to localStorage via persist middleware', async () => {
    const { useConnectionStore } = await import('../connection-store');
    useConnectionStore.getState().pairMachine('m-abc', 'secret123');
    const raw = localStorage.getItem('vb_connection_store');
    expect(raw).toBeTruthy();
    const parsed = JSON.parse(raw!);
    expect(parsed.state.machineSecrets).toEqual({ 'm-abc': 'secret123' });
  });

  it('unpairMachine removes from machineSecrets', async () => {
    const { useConnectionStore } = await import('../connection-store');
    useConnectionStore.getState().pairMachine('m-abc', 'secret123');
    useConnectionStore.getState().pairMachine('m-xyz', 'secret456');
    useConnectionStore.getState().unpairMachine('m-abc');
    const { machineSecrets } = useConnectionStore.getState();
    expect(machineSecrets).toEqual({ 'm-xyz': 'secret456' });
  });
});
