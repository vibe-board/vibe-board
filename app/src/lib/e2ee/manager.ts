import { deriveKey, generateRandomBytes } from './crypto';

export interface ContentKeyPair {
  publicKey: Uint8Array;
  secretKey: Uint8Array;
}

export class E2EEManager {
  private secrets = new Map<string, Uint8Array>();
  private static instance: E2EEManager;

  static getInstance(): E2EEManager {
    if (!E2EEManager.instance) {
      E2EEManager.instance = new E2EEManager();
    }
    return E2EEManager.instance;
  }

  addSecret(connectionId: string, secretBase64: string): void {
    const secret = Uint8Array.from(atob(secretBase64), c => c.charCodeAt(0));
    this.secrets.set(connectionId, secret);
    this.persist();
  }

  removeSecret(connectionId: string): void {
    this.secrets.delete(connectionId);
    this.persist();
  }

  getContentKey(connectionId: string): Uint8Array | undefined {
    const secret = this.secrets.get(connectionId);
    if (!secret) return undefined;
    return deriveKey(secret, 'content-encryption-key');
  }

  getAuthKey(connectionId: string): Uint8Array | undefined {
    const secret = this.secrets.get(connectionId);
    if (!secret) return undefined;
    return deriveKey(secret, 'auth-signing-key');
  }

  hasSecret(connectionId: string): boolean {
    return this.secrets.has(connectionId);
  }

  private persist(): void {
    const data: Record<string, string> = {};
    for (const [id, secret] of this.secrets) {
      data[id] = btoa(String.fromCharCode(...secret));
    }
    localStorage.setItem('vb_e2ee_secrets', JSON.stringify(data));
  }

  loadFromStorage(): void {
    try {
      const raw = localStorage.getItem('vb_e2ee_secrets');
      if (!raw) return;
      const data = JSON.parse(raw) as Record<string, string>;
      for (const [id, b64] of Object.entries(data)) {
        this.secrets.set(id, Uint8Array.from(atob(b64), c => c.charCodeAt(0)));
      }
    } catch {}
  }
}
