import { onMount, onCleanup, type Component } from 'solid-js';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';

interface TerminalProps {
  wsUrl?: string;
  class?: string;
}

export const TerminalView: Component<TerminalProps> = (props) => {
  let containerRef: HTMLDivElement | undefined;
  let terminal: XTerm | undefined;
  let fitAddon: FitAddon | undefined;

  onMount(() => {
    if (!containerRef) return;

    terminal = new XTerm({
      theme: {
        background: '#0f1117',
        foreground: '#e5e7eb',
        cursor: '#7c83db',
        selectionBackground: '#7c83db40',
      },
      fontSize: 13,
      fontFamily: 'JetBrains Mono, Fira Code, SF Mono, monospace',
      cursorBlink: true,
    });

    fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    terminal.open(containerRef);
    fitAddon.fit();

    const resizeObserver = new ResizeObserver(() => fitAddon?.fit());
    resizeObserver.observe(containerRef);

    onCleanup(() => {
      resizeObserver.disconnect();
      terminal?.dispose();
    });

    if (props.wsUrl) {
      const ws = new WebSocket(props.wsUrl);
      ws.onmessage = (e) => terminal?.write(e.data);
      terminal.onData((data) => ws.send(data));
      onCleanup(() => ws.close());
    }
  });

  return (
    <div ref={containerRef} class={`h-full w-full ${props.class ?? ''}`} />
  );
};
