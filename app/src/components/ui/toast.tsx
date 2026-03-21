import { createSignal, For, type Component } from 'solid-js';

interface Toast {
  id: number;
  message: string;
  type: 'success' | 'error' | 'info';
}

const [toasts, setToasts] = createSignal<Toast[]>([]);
let nextId = 0;

export function showToast(message: string, type: Toast['type'] = 'info') {
  const id = nextId++;
  setToasts(prev => [...prev, { id, message, type }]);
  setTimeout(() => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, 4000);
}

const typeStyles = {
  success: 'border-status-done/30 bg-status-done/10',
  error: 'border-danger/30 bg-danger/10',
  info: 'border-accent/30 bg-accent/10',
};

export const ToastContainer: Component = () => {
  return (
    <div class="fixed bottom-4 right-4 z-[100] flex flex-col gap-2">
      <For each={toasts()}>
        {(toast) => (
          <div class={`rounded-lg border px-4 py-2.5 text-sm text-foreground shadow-lg animate-in slide-in-from-bottom-2 fade-in-0 ${typeStyles[toast.type]}`}>
            {toast.message}
          </div>
        )}
      </For>
    </div>
  );
};
