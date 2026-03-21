import { createSignal, Show, type Component } from 'solid-js';
import { ServerList } from '@/components/connection/server-list';
import { AddServer } from '@/components/connection/add-server';

const ConnectPage: Component = () => {
  const [showAdd, setShowAdd] = createSignal(false);

  return (
    <div class="max-w-lg mx-auto p-6">
      <Show when={!showAdd()} fallback={
        <AddServer onClose={() => setShowAdd(false)} />
      }>
        <ServerList onAddServer={() => setShowAdd(true)} />
      </Show>
    </div>
  );
};

export default ConnectPage;
