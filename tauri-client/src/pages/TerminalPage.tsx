import { useEffect, useRef, useCallback, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { X, WifiOff } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { apiClient } from '@/api/client';
import { getTerminalTheme } from '@/utils/terminalTheme';
import ControlKeyBar from '@/components/terminal/ControlKeyBar';
import type { WsConnection } from '@/api/ws';

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
  const bytes = new Uint8Array(binString.length);
  for (let i = 0; i < binString.length; i++) {
    bytes[i] = binString.charCodeAt(i);
  }
  return new TextDecoder().decode(bytes);
}

function ensureViewportReady(
  terminal: Terminal,
  maxRetries = 30,
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
        terminal.refresh(0, terminal.rows - 1);
        resolve();
      } catch {
        if (attempts < maxRetries) {
          requestAnimationFrame(trySync);
        } else {
          console.warn('Terminal: viewport sync failed after max retries');
          resolve();
        }
      }
    };
    requestAnimationFrame(trySync);
  });
}

export default function TerminalPage() {
  const { processId } = useParams<{ processId: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const wsRef = useRef<WsConnection | null>(null);
  const [disconnected, setDisconnected] = useState(false);

  const handleSend = useCallback((data: string) => {
    if (wsRef.current) {
      wsRef.current
        .send(JSON.stringify({ type: 'input', data: encodeBase64(data) }))
        .catch(() => {});
    }
  }, []);

  const handleClose = useCallback(() => {
    navigate(-1);
  }, [navigate]);

  // Initialize terminal
  useEffect(() => {
    if (!containerRef.current || !processId) return;

    const container = containerRef.current;
    const terminal = new Terminal({
      cursorBlink: true,
      fontSize: 13,
      fontFamily: '"IBM Plex Mono", monospace',
      theme: getTerminalTheme(),
    });

    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    terminalRef.current = terminal;
    fitAddonRef.current = fitAddon;

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

    try {
      terminal.write('');
      writeReady = true;
    } catch {
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

    const openTerminal = () => {
      if (terminalRef.current !== terminal) return;

      terminal.open(container);

      ensureViewportReady(terminal).then(() => {
        if (terminalRef.current !== terminal) return;

        try {
          fitAddon.fit();
        } catch {
          requestAnimationFrame(() => {
            if (terminalRef.current !== terminal) return;
            try {
              fitAddon.fit();
            } catch {
              // terminal will use default size
            }
            connectWs();
          });
          return;
        }
        connectWs();
      });
    };

    const connectWs = async () => {
      if (terminalRef.current !== terminal) return;

      const cols = terminal.cols;
      const rows = terminal.rows;

      try {
        const ws = await apiClient.connectWs('/terminal/ws', {
          workspace_id: processId,
          cols: String(cols),
          rows: String(rows),
        });
        wsRef.current = ws;

        ws.addListener((event) => {
          if (event.type === 'Text') {
            try {
              const msg: TerminalMessage = JSON.parse(event.data as string);
              switch (msg.type) {
                case 'output':
                  if (msg.data) writeOrBuffer(decodeBase64(msg.data));
                  break;
                case 'error':
                  writeOrBuffer(
                    `\r\n\x1b[31mError: ${msg.message || 'Unknown'}\x1b[0m\r\n`,
                  );
                  break;
                case 'exit':
                  writeOrBuffer('\r\n\x1b[33mProcess exited\x1b[0m\r\n');
                  setDisconnected(true);
                  break;
                case 'session_info':
                  break;
                case 'session_expired':
                  break;
              }
            } catch {
              // ignore parse errors
            }
          } else if (event.type === 'Close') {
            setDisconnected(true);
          }
        });

        terminal.onData((data) => {
          ws.send(JSON.stringify({ type: 'input', data: encodeBase64(data) })).catch(
            () => {},
          );
        });

        // Send initial resize
        ws.send(
          JSON.stringify({ type: 'resize', cols: terminal.cols, rows: terminal.rows }),
        ).catch(() => {});
      } catch {
        writeOrBuffer('\r\n\x1b[31mFailed to connect to terminal\x1b[0m\r\n');
        setDisconnected(true);
      }
    };

    requestAnimationFrame(openTerminal);

    return () => {
      terminal.dispose();
      terminalRef.current = null;
      fitAddonRef.current = null;
      if (wsRef.current) {
        wsRef.current.disconnect().catch(() => {});
        wsRef.current = null;
      }
    };
  }, [processId]);

  // Handle resize
  useEffect(() => {
    if (!fitAddonRef.current || !containerRef.current) return;

    const handleResize = () => {
      fitAddonRef.current?.fit();
      if (terminalRef.current && wsRef.current) {
        wsRef.current
          .send(
            JSON.stringify({
              type: 'resize',
              cols: terminalRef.current.cols,
              rows: terminalRef.current.rows,
            }),
          )
          .catch(() => {});
      }
    };

    const observer = new ResizeObserver(handleResize);
    observer.observe(containerRef.current);
    handleResize();

    return () => observer.disconnect();
  }, []);

  return (
    <div className="flex flex-col h-screen bg-background">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-muted border-b border-border">
        <span className="text-sm font-medium text-foreground truncate">
          {t('terminal.title')}
        </span>
        <button
          onClick={handleClose}
          className="p-1.5 rounded hover:bg-accent text-muted-foreground"
        >
          <X size={18} />
        </button>
      </div>

      {/* Terminal canvas */}
      <div ref={containerRef} className="flex-1 min-h-0" />

      {/* Disconnected indicator */}
      {disconnected && (
        <div className="flex items-center justify-center gap-2 px-4 py-2 bg-destructive/10 text-destructive text-sm">
          <WifiOff size={14} />
          {t('terminal.disconnected')}
        </div>
      )}

      {/* Control key bar */}
      <ControlKeyBar onSend={handleSend} />
    </div>
  );
}
