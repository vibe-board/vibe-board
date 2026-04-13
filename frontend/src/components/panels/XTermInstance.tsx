import { useEffect, useRef, useMemo, useCallback } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import '@xterm/xterm/css/xterm.css';

import { useTheme } from '@/components/ThemeProvider';
import { getTerminalTheme } from '@/utils/terminalTheme';
import { getGatewayConnection } from '@/lib/gatewayMode';
import { getWsBaseUrl } from '@/lib/api';
import type { RemoteWs } from '@/lib/e2ee/remoteWs';

interface XTermInstanceProps {
  endpointUrl: string;
  isActive: boolean;
  onClose?: () => void;
  /** Backend PTY session ID for reconnection */
  sessionId: string | null;
  /** Called when backend sends a new session_id, or null to clear */
  onSessionId: (sessionId: string | null) => void;
}

interface TerminalMessage {
  type: 'output' | 'error' | 'exit' | 'session_info' | 'session_expired';
  data?: string;
  message?: string;
  code?: number;
  session_id?: string;
}

function encodeBase64(str: string): string {
  const bytes = new TextEncoder().encode(str);
  const binString = Array.from(bytes, (b) => String.fromCodePoint(b)).join('');
  return btoa(binString);
}

function decodeBase64(base64: string): string {
  const binString = atob(base64);
  const bytes = Uint8Array.from(binString, (c) => c.codePointAt(0)!);
  return new TextDecoder().decode(bytes);
}

/**
 * xterm.js has a bug: Viewport constructor schedules
 * setTimeout(() => this.syncScrollArea()) which accesses
 * _renderService.dimensions. The dimensions getter throws
 * if the renderer isn't ready yet (_renderer.value is null).
 *
 * This function retries until syncScrollArea succeeds,
 * recovering from the initial failed setTimeout.
 */
function ensureViewportReady(
  terminal: Terminal,
  maxRetries = 30
): Promise<void> {
  return new Promise((resolve) => {
    let attempts = 0;
    const trySync = () => {
      attempts++;
      try {
        const core = (
          terminal as { _core?: { viewport?: { syncScrollArea: () => void } } }
        )._core;
        if (core?.viewport) {
          core.viewport.syncScrollArea();
        }
        // Also trigger a refresh to ensure the screen is painted
        terminal.refresh(0, terminal.rows - 1);
        resolve();
      } catch {
        if (attempts < maxRetries) {
          requestAnimationFrame(trySync);
        } else {
          // Give up but don't hang - terminal might still work
          console.warn('Terminal: viewport sync failed after max retries');
          resolve();
        }
      }
    };
    requestAnimationFrame(trySync);
  });
}

export function XTermInstance({
  endpointUrl,
  isActive,
  onClose,
  sessionId,
  onSessionId,
}: XTermInstanceProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const wsRef = useRef<WebSocket | RemoteWs | null>(null);
  const initialSizeRef = useRef({ cols: 80, rows: 24 });
  const { theme } = useTheme();

  const endpoint = useMemo(() => {
    const wsBase = getWsBaseUrl();
    let url = `${wsBase}${endpointUrl}&cols=${initialSizeRef.current.cols}&rows=${initialSizeRef.current.rows}`;
    if (sessionId) {
      url += `&session_id=${sessionId}`;
    }
    return url;
  }, [endpointUrl, sessionId]);

  // The actual init logic, called when container has dimensions
  const initTerminal = useCallback(() => {
    if (!containerRef.current) return false;
    if (terminalRef.current) return true; // already initialized

    const container = containerRef.current;
    const rect = container.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return false;

    const terminal = new Terminal({
      cursorBlink: true,
      fontSize: 12,
      fontFamily: '"IBM Plex Mono", monospace',
      theme: getTerminalTheme(),
    });

    const fitAddon = new FitAddon();
    const webLinksAddon = new WebLinksAddon();

    terminal.loadAddon(fitAddon);
    terminal.loadAddon(webLinksAddon);

    // Mark as initialized early so React doesn't re-run init
    terminalRef.current = terminal;
    fitAddonRef.current = fitAddon;

    // WebSocket connection and data handling
    const startConnection = () => {
      // Guard against cleanup
      if (terminalRef.current !== terminal) return;

      initialSizeRef.current = { cols: terminal.cols, rows: terminal.rows };

      // Buffer for data arriving before writes are safe
      let writeReady = false;
      const pendingWrites: string[] = [];
      let flushScheduled = false;

      const tryFlush = () => {
        flushScheduled = false;
        if (pendingWrites.length === 0) {
          writeReady = true;
          return;
        }
        try {
          const count = pendingWrites.length;
          for (let i = 0; i < count; i++) {
            terminal.write(pendingWrites[i]);
          }
          pendingWrites.splice(0, count);
          writeReady = true;
          if (pendingWrites.length > 0) {
            tryFlush();
          }
        } catch {
          flushScheduled = true;
          requestAnimationFrame(tryFlush);
        }
      };

      // Test if writes work now
      try {
        terminal.write('');
        writeReady = true;
      } catch {
        // Not ready yet, schedule flush
        flushScheduled = true;
        requestAnimationFrame(tryFlush);
      }

      const writeOrBuffer = (data: string) => {
        if (writeReady && pendingWrites.length === 0) {
          terminal.write(data);
        } else {
          pendingWrites.push(data);
          if (writeReady && !flushScheduled) {
            flushScheduled = true;
            requestAnimationFrame(tryFlush);
          }
        }
      };

      // Create WebSocket - route through E2EE gateway if connected
      const conn = getGatewayConnection();
      let ws: WebSocket | RemoteWs;
      if (conn) {
        const url = new URL(endpoint);
        ws = conn.openWsStream(
          url.pathname,
          url.search?.substring(1) || undefined
        );
      } else {
        ws = new WebSocket(endpoint);
      }
      wsRef.current = ws;

      ws.onmessage = (event) => {
        try {
          const msg: TerminalMessage = JSON.parse(event.data);
          switch (msg.type) {
            case 'output':
              if (msg.data) {
                writeOrBuffer(decodeBase64(msg.data));
              }
              break;
            case 'error':
              writeOrBuffer(
                `\r\n\x1b[31mError: ${msg.message || 'Unknown'}\x1b[0m\r\n`
              );
              break;
            case 'exit':
              writeOrBuffer('\r\n\x1b[33mProcess exited\x1b[0m\r\n');
              onClose?.();
              break;
            case 'session_info':
              // Store session_id for future reconnection
              if (msg.session_id) {
                onSessionId(msg.session_id);
              }
              break;
            case 'session_expired':
              // Session expired, clear stored session_id
              // The backend will create a new session automatically
              onSessionId(null);
              break;
          }
        } catch {
          // Ignore parse errors
        }
      };

      terminal.onData((data) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'input', data: encodeBase64(data) }));
        }
      });

      ws.onopen = () => {
        if (terminal.cols > 0 && terminal.rows > 0) {
          ws.send(
            JSON.stringify({
              type: 'resize',
              cols: terminal.cols,
              rows: terminal.rows,
            })
          );
        }
      };

      ws.onerror = () => {
        writeOrBuffer('\r\n\x1b[31mWebSocket connection error\x1b[0m\r\n');
      };

      ws.onclose = (event) => {
        if (!event.wasClean) {
          writeOrBuffer(
            `\r\n\x1b[33mConnection closed (code: ${event.code})\x1b[0m\r\n`
          );
        }
      };
    };

    // Defer terminal.open() to next animation frame.
    // This ensures the browser has laid out the container before xterm.js
    // creates its DOM. Without this, Viewport's setTimeout fires before
    // the renderer is ready, causing "Cannot read properties of undefined
    // (reading 'dimensions')".
    const openTerminal = () => {
      // Guard against cleanup during the rAF wait
      if (terminalRef.current !== terminal) return;

      terminal.open(container);

      // After open, the viewport may still be broken from its internal
      // setTimeout. Retry syncScrollArea until the renderer is ready.
      ensureViewportReady(terminal).then(() => {
        // Guard against cleanup
        if (terminalRef.current !== terminal) return;

        // Now fit the terminal to the container
        try {
          fitAddon.fit();
        } catch {
          // If fit fails, retry once on next frame
          requestAnimationFrame(() => {
            if (terminalRef.current !== terminal) return;
            try {
              fitAddon.fit();
            } catch {
              // Terminal will use default size
            }
            startConnection();
          });
          return;
        }

        startConnection();
      });
    };

    requestAnimationFrame(openTerminal);

    return true;
  }, [endpoint, onClose, onSessionId]);

  // Initialize terminal: try immediately, or wait for container to have dimensions via ResizeObserver
  useEffect(() => {
    if (initTerminal()) return; // initialized immediately

    // Container has zero dimensions - wait for it via ResizeObserver
    if (!containerRef.current) return;

    const observer = new ResizeObserver(() => {
      if (initTerminal()) {
        observer.disconnect();
      }
    });
    observer.observe(containerRef.current);

    return () => {
      observer.disconnect();
    };
  }, [initTerminal]);

  // Cleanup on unmount or when endpoint changes
  useEffect(() => {
    return () => {
      if (terminalRef.current) {
        terminalRef.current.dispose();
        terminalRef.current = null;
      }
      fitAddonRef.current = null;
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [endpoint]);

  // Handle resize
  useEffect(() => {
    if (!fitAddonRef.current || !containerRef.current) return;

    const handleResize = () => {
      fitAddonRef.current?.fit();
      if (terminalRef.current && wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(
          JSON.stringify({
            type: 'resize',
            cols: terminalRef.current.cols,
            rows: terminalRef.current.rows,
          })
        );
      }
    };

    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(containerRef.current);

    handleResize();

    return () => {
      resizeObserver.disconnect();
    };
  }, []);

  // Focus terminal when becoming active
  useEffect(() => {
    if (isActive) {
      terminalRef.current?.focus();
    }
  }, [isActive]);

  // Update terminal theme when app theme changes
  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.options.theme = getTerminalTheme();
    }
  }, [theme]);

  return (
    <div
      ref={containerRef}
      className="h-full w-full"
      style={{ display: isActive ? 'block' : 'none' }}
    />
  );
}
