import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/appMode', () => ({
  isLocalDirect: false,
  isGateway: true,
  isTauri: false,
  appMode: 'gateway',
}));
vi.mock('@/stores/migration', () => ({ runMigrationIfNeeded: vi.fn() }));

describe('e2ee/pairing.getContentPublicKey', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.resetModules();
  });

  it('returns null when machine has no secret', async () => {
    const { getContentPublicKey } = await import('../pairing');
    expect(getContentPublicKey('m-unknown')).toBeNull();
  });

  it('returns a 32-byte public key after pairing', async () => {
    const { useConnectionStore } = await import('@/stores/connection-store');
    const { getContentPublicKey } = await import('../pairing');
    // 32 bytes of deterministic secret, base64-encoded
    const secret = btoa(String.fromCharCode(...new Array(32).fill(7)));
    useConnectionStore.getState().pairMachine('m-test', secret);
    const pk = getContentPublicKey('m-test');
    expect(pk).toBeInstanceOf(Uint8Array);
    expect(pk!.length).toBe(32);
  });

  it('caches derived keypair across calls (same reference)', async () => {
    const { useConnectionStore } = await import('@/stores/connection-store');
    const { getContentPublicKey } = await import('../pairing');
    const secret = btoa(String.fromCharCode(...new Array(32).fill(3)));
    useConnectionStore.getState().pairMachine('m-cached', secret);
    const pk1 = getContentPublicKey('m-cached');
    const pk2 = getContentPublicKey('m-cached');
    expect(pk1).toBe(pk2);
  });
});
