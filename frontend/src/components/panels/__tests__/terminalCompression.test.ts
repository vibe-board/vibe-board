import { describe, expect, it } from 'vitest';
import { gzipSync } from 'zlib';

import { decodeBase64Gzip } from '../terminalCompression';

function bytesToBase64(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

describe('decodeBase64Gzip', () => {
  it('round-trips an ASCII string', async () => {
    const original = 'hello terminal world';
    const compressed = gzipSync(Buffer.from(original, 'utf-8'));
    const base64 = bytesToBase64(new Uint8Array(compressed));

    const decoded = await decodeBase64Gzip(base64);

    expect(decoded).toBe(original);
  });

  it('round-trips a string with ANSI escape sequences', async () => {
    const original = '\x1b[31mred\x1b[0m \x1b[1;32mbold-green\x1b[0m';
    const compressed = gzipSync(Buffer.from(original, 'utf-8'));
    const base64 = bytesToBase64(new Uint8Array(compressed));

    const decoded = await decodeBase64Gzip(base64);

    expect(decoded).toBe(original);
  });

  it('round-trips multibyte UTF-8 content', async () => {
    const original = '终端 reconnect 测试 — 日本語 🚀';
    const compressed = gzipSync(Buffer.from(original, 'utf-8'));
    const base64 = bytesToBase64(new Uint8Array(compressed));

    const decoded = await decodeBase64Gzip(base64);

    expect(decoded).toBe(original);
  });
});

import { createWriteChain } from '../terminalCompression';

describe('createWriteChain', () => {
  it('writes synchronous producers in arrival order', async () => {
    const writes: string[] = [];
    const enqueue = createWriteChain((s) => {
      writes.push(s);
    });

    enqueue(() => 'a');
    enqueue(() => 'b');
    enqueue(() => 'c');

    // Drain the microtask queue.
    await new Promise((r) => setTimeout(r, 0));

    expect(writes).toEqual(['a', 'b', 'c']);
  });

  it('preserves arrival order across mixed sync/async producers', async () => {
    const writes: string[] = [];
    const enqueue = createWriteChain((s) => {
      writes.push(s);
    });

    enqueue(
      () =>
        new Promise<string>((resolve) =>
          setTimeout(() => resolve('slow-async'), 30)
        )
    );
    enqueue(() => 'fast-sync-1');
    enqueue(
      () =>
        new Promise<string>((resolve) =>
          setTimeout(() => resolve('medium-async'), 10)
        )
    );
    enqueue(() => 'fast-sync-2');

    await new Promise((r) => setTimeout(r, 100));

    expect(writes).toEqual([
      'slow-async',
      'fast-sync-1',
      'medium-async',
      'fast-sync-2',
    ]);
  });

  it('continues processing after a producer rejects', async () => {
    const writes: string[] = [];
    const errors: unknown[] = [];
    const enqueue = createWriteChain(
      (s) => {
        writes.push(s);
      },
      (err) => {
        errors.push(err);
      }
    );

    enqueue(() => 'before');
    enqueue(() => Promise.reject(new Error('boom')));
    enqueue(() => 'after');

    await new Promise((r) => setTimeout(r, 0));

    expect(writes).toEqual(['before', 'after']);
    expect(errors).toHaveLength(1);
    expect((errors[0] as Error).message).toBe('boom');
  });
});
