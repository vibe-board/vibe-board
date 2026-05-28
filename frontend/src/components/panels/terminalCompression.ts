/**
 * decodeBase64Gzip — decompress a base64-encoded gzip blob into a UTF-8 string.
 *
 * Used by the terminal WebSocket reader to expand the reconnect snapshot
 * (`output_compressed` message) sent by the backend.
 *
 * Relies on the native DecompressionStream API — supported in Chrome 80+,
 * Firefox 113+, Safari 16.4+, and the Tauri Chromium webview.
 */
export async function decodeBase64Gzip(base64: string): Promise<string> {
  const binString = atob(base64);
  const bytes = Uint8Array.from(binString, (c) => c.codePointAt(0)!);
  // `new Response(bytes).body` produces a ReadableStream<Uint8Array>; this is
  // equivalent to `new Blob([bytes]).stream()` but works in jsdom (which lacks
  // Blob.prototype.stream) as well as every supported browser / Tauri webview.
  const stream = new Response(bytes).body!.pipeThrough(
    new DecompressionStream('gzip')
  );
  const decompressed = await new Response(stream).arrayBuffer();
  return new TextDecoder().decode(decompressed);
}

/**
 * createWriteChain — serialize calls to a write callback through a promise
 * chain so async producers (e.g. gzip decompression) cannot reorder ahead of
 * sync ones (e.g. base64 decode).
 *
 * Returns an `enqueue(producer)` function. Each `producer` runs only after the
 * previous one has been consumed; rejections are routed to `onError` (or
 * console by default) without breaking the chain.
 */
export function createWriteChain(
  write: (text: string) => void,
  onError?: (err: unknown) => void
): (producer: () => string | Promise<string>) => void {
  let chain: Promise<void> = Promise.resolve();
  return (producer) => {
    chain = chain
      .then(producer)
      .then(write)
      .catch((err) => {
        if (onError) onError(err);
        else console.error('Terminal write failed:', err);
      });
  };
}
