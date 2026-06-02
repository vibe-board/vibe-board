# E2EE 多机可用性修复 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 E2EE gateway 多机模式下,一台 machine 掉线不再拖垮整个前端页面 —— 故障隔离到单个 tab,并优雅降级 + 自动恢复。

**Architecture:** 三层正交纵深防御。Layer 3(底层 leaf):`openWs` 未连接/无 DEK 时返回非抛的 dead WebSocket。Layer 2(连接层):`machine_offline`/`machine_online` 翻转 `GatewayMachineConnection.status`,使掉线 tab 卸载 `<App/>`、恢复后重挂。Layer 1(渲染层):每个 tab 子树包独立 `TabErrorBoundary`,一个 tab 崩溃不扩散。自底向上实现,每层 TDD。

**Tech Stack:** React 18 + TypeScript,`@sentry/react` v9 ErrorBoundary,Vitest + jsdom + @testing-library/react v16(无 user-event,用 `fireEvent`),zustand。

**Spec:** `docs/superpowers/specs/2026-06-01-e2ee-multi-machine-availability-design.md`

**全程用 `pnpm`,绝不用 `npm`。** 测试运行目录为 `frontend/`。

---

## File Structure

**新建:**
- `frontend/src/lib/connections/deadWebSocket.ts` — `createDeadWebSocket(reason)` 工厂,返回非抛的 `WebSocketLike`。
- `frontend/src/lib/connections/__tests__/deadWebSocket.test.ts`
- `frontend/src/lib/connections/__tests__/gatewayConnection.test.ts` — Layer 2 状态翻转 + Layer 3 openWs 兜底。
- `frontend/src/lib/e2ee/__tests__/connection.machineCallbacks.test.ts` — Layer 2 回调触发。
- `frontend/src/components/tabs/TabErrorBoundary.tsx` — per-tab 错误边界。
- `frontend/src/components/tabs/__tests__/TabErrorBoundary.test.tsx`

**修改:**
- `frontend/src/lib/e2ee/connection.ts` — `ConnectionOptions` 加两个回调;`handleMessage` 在订阅机 offline/online 时 fire。
- `frontend/src/lib/connections/gatewayConnection.ts` — `doConnect` 传入回调做状态翻转;`openWs` 改为非抛。
- `frontend/src/components/tabs/GatewayShell.tsx`、`MultiConnectionShell.tsx`、`LocalDirectShell.tsx` — 用 `TabErrorBoundary` 包裹 tab 子树。

---

## Task 1: Layer 3 — `createDeadWebSocket` 工厂

**Files:**
- Create: `frontend/src/lib/connections/deadWebSocket.ts`
- Test: `frontend/src/lib/connections/__tests__/deadWebSocket.test.ts`

- [ ] **Step 1: 写失败测试**

创建 `frontend/src/lib/connections/__tests__/deadWebSocket.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createDeadWebSocket } from '../deadWebSocket';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('createDeadWebSocket', () => {
  it('starts in CLOSED state and never throws on construct', () => {
    const ws = createDeadWebSocket('Not connected');
    expect(ws.readyState).toBe(3);
  });

  it('fires onerror then onclose(1000, wasClean) asynchronously', () => {
    const ws = createDeadWebSocket('boom');
    const onerror = vi.fn();
    const onclose = vi.fn();
    ws.onerror = onerror;
    ws.onclose = onclose;

    vi.runAllTimers();

    expect(onerror).toHaveBeenCalledTimes(1);
    expect(onclose).toHaveBeenCalledTimes(1);
    const ev = onclose.mock.calls[0][0] as CloseEvent;
    expect(ev.code).toBe(1000);
    expect(ev.wasClean).toBe(true);
    expect(ev.reason).toBe('boom');
  });

  it('does not fire handlers if consumer closes before the timer runs', () => {
    const ws = createDeadWebSocket('boom');
    const onclose = vi.fn();
    ws.onclose = onclose;
    ws.close();

    vi.runAllTimers();

    expect(onclose).not.toHaveBeenCalled();
  });

  it('send() is a no-op and does not throw', () => {
    const ws = createDeadWebSocket('x');
    expect(() => ws.send('hello')).not.toThrow();
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd frontend && pnpm exec vitest run src/lib/connections/__tests__/deadWebSocket.test.ts`
Expected: FAIL — `Failed to resolve import "../deadWebSocket"` / module not found。

- [ ] **Step 3: 写最小实现**

创建 `frontend/src/lib/connections/deadWebSocket.ts`:

```ts
// frontend/src/lib/connections/deadWebSocket.ts
import type { WebSocketLike } from './types';

/**
 * A WebSocketLike that is already dead. Used as a non-throwing backstop when a
 * gateway machine connection cannot open a real stream (not connected / no DEK).
 *
 * On the next macrotask it fires onerror then a CLEAN onclose(1000) — terminal
 * for useJsonPatchWsStream and useLogStream (they don't reconnect on 1000/clean).
 * The real recovery path is Layer 2 (status flip → <App/> unmount).
 */
export function createDeadWebSocket(reason: string): WebSocketLike {
  let closed = false;

  const ws: WebSocketLike = {
    onopen: null,
    onmessage: null,
    onclose: null,
    onerror: null,
    readyState: 3, // CLOSED
    send() {
      /* dead — drop */
    },
    close() {
      closed = true;
    },
  };

  setTimeout(() => {
    if (closed) return;
    closed = true;
    ws.onerror?.(new Event('error'));
    ws.onclose?.(
      new CloseEvent('close', { code: 1000, reason, wasClean: true })
    );
  }, 0);

  return ws;
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `cd frontend && pnpm exec vitest run src/lib/connections/__tests__/deadWebSocket.test.ts`
Expected: PASS（4 passed）。

- [ ] **Step 5: 提交**

```bash
git add frontend/src/lib/connections/deadWebSocket.ts frontend/src/lib/connections/__tests__/deadWebSocket.test.ts
git commit -m "feat(connections): add non-throwing dead WebSocket backstop"
```

---

## Task 2: Layer 3 — `GatewayMachineConnection.openWs` 改为非抛

**Files:**
- Modify: `frontend/src/lib/connections/gatewayConnection.ts:168-171`
- Test: `frontend/src/lib/connections/__tests__/gatewayConnection.test.ts`

背景:`machine_offline` 时 `e2eeConn` 仍存在(gateway WS 没断)但 `dek` 为 null,`openWsStream` 抛 `'DEK not established'`;完全断开时 `e2eeConn` 为 null,抛 `'Not connected'`。两条路径都必须改为返回 dead socket。

- [ ] **Step 1: 写失败测试**

创建 `frontend/src/lib/connections/__tests__/gatewayConnection.test.ts`(本文件 Task 4 会再追加用例,先放 Layer 3 两条):

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { GatewaySession } from '../types';

// Fake E2EEConnection so we never touch real crypto / WebSocket.
const e2ee = vi.hoisted(() => {
  const instances: FakeE2EE[] = [];
  class FakeE2EE {
    options: Record<string, any> | null = null;
    openWsStream = vi.fn(() => ({}) as unknown);
    constructor() {
      instances.push(this);
    }
    async connect(options: Record<string, any>) {
      this.options = options;
      options.onConnect?.();
    }
    subscribeMachine() {}
    async initDek() {}
    disconnect() {}
  }
  return { instances, FakeE2EE };
});

vi.mock('@/lib/e2ee', () => ({ E2EEConnection: e2ee.FakeE2EE }));

const SESSION: GatewaySession = { sessionToken: 't', userId: 'u' };

beforeEach(() => {
  e2ee.instances.length = 0;
  vi.clearAllMocks();
});

describe('GatewayMachineConnection.openWs (Layer 3 backstop)', () => {
  it('returns a dead socket (no throw) when not connected', async () => {
    const { GatewayMachineConnection } = await import('../gatewayConnection');
    const c = new GatewayMachineConnection(
      'conn:m1',
      'http://gw',
      'label',
      'http://gw',
      SESSION,
      'm1'
    );
    // never connected → e2eeConn is null
    const ws = c.openWs('/api/x');
    expect(ws.readyState).toBe(3);
  });

  it('returns a dead socket when openWsStream throws (null DEK)', async () => {
    const { GatewayMachineConnection } = await import('../gatewayConnection');
    const c = new GatewayMachineConnection(
      'conn:m1',
      'http://gw',
      'label',
      'http://gw',
      SESSION,
      'm1'
    );
    await c.connect();
    // simulate post-machine_offline state: stream open throws
    e2ee.instances[0].openWsStream = vi.fn(() => {
      throw new Error('DEK not established');
    });
    const ws = c.openWs('/api/x');
    expect(ws.readyState).toBe(3);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd frontend && pnpm exec vitest run src/lib/connections/__tests__/gatewayConnection.test.ts`
Expected: FAIL — 第二条用例抛 `DEK not established`(当前 `openWs` 未捕获),第一条抛 `Not connected`。

- [ ] **Step 3: 写最小实现**

编辑 `frontend/src/lib/connections/gatewayConnection.ts`。顶部加 import:

```ts
import { createDeadWebSocket } from './deadWebSocket';
```

把 `openWs`(当前 168-171 行)替换为:

```ts
  openWs(path: string, query?: string): WebSocketLike {
    if (!this.e2eeConn) return createDeadWebSocket('Not connected');
    try {
      return this.e2eeConn.openWsStream(path, query) as unknown as WebSocketLike;
    } catch (e) {
      return createDeadWebSocket(
        e instanceof Error ? e.message : 'Stream unavailable'
      );
    }
  }
```

- [ ] **Step 4: 运行测试确认通过**

Run: `cd frontend && pnpm exec vitest run src/lib/connections/__tests__/gatewayConnection.test.ts`
Expected: PASS（2 passed）。

- [ ] **Step 5: 提交**

```bash
git add frontend/src/lib/connections/gatewayConnection.ts frontend/src/lib/connections/__tests__/gatewayConnection.test.ts
git commit -m "fix(connections): make gateway openWs non-throwing backstop"
```

---

## Task 3: Layer 2 — `E2EEConnection` 在订阅机 offline/online 时 fire 回调

**Files:**
- Modify: `frontend/src/lib/e2ee/connection.ts`（`ConnectionOptions` line 17-24;`handleMessage` 的 `machine_online` line ~461、`machine_offline` line ~470-480）
- Test: `frontend/src/lib/e2ee/__tests__/connection.machineCallbacks.test.ts`

- [ ] **Step 1: 写失败测试**

创建 `frontend/src/lib/e2ee/__tests__/connection.machineCallbacks.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { E2EEConnection } from '../connection';

// Controllable global WebSocket mock.
class MockWebSocket {
  static instances: MockWebSocket[] = [];
  static OPEN = 1;
  onopen: ((ev: Event) => void) | null = null;
  onmessage: ((ev: MessageEvent) => void) | null = null;
  onclose: ((ev: CloseEvent) => void) | null = null;
  onerror: ((ev: Event) => void) | null = null;
  readyState = 1;
  url: string;
  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
  }
  send() {}
  close() {}
  emit(data: unknown) {
    this.onmessage?.(
      new MessageEvent('message', { data: JSON.stringify(data) })
    );
  }
}

beforeEach(() => {
  MockWebSocket.instances = [];
  vi.stubGlobal('WebSocket', MockWebSocket);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function connected(opts: Record<string, unknown>) {
  const conn = new E2EEConnection();
  const p = conn.connect({
    gatewayUrl: 'http://gw',
    sessionToken: 't',
    machineId: 'm1',
    ...opts,
  });
  const ws = MockWebSocket.instances[0];
  ws.onopen?.(new Event('open'));
  ws.emit({ type: 'auth_ok', user_id: 'u' });
  await p;
  return { conn, ws };
}

describe('E2EEConnection machine offline/online callbacks', () => {
  it('fires onMachineOffline for the subscribed machine', async () => {
    const onMachineOffline = vi.fn();
    const { ws } = await connected({ onMachineOffline });
    ws.emit({ type: 'machine_offline', machine_id: 'm1' });
    expect(onMachineOffline).toHaveBeenCalledTimes(1);
  });

  it('does NOT fire onMachineOffline for a different machine', async () => {
    const onMachineOffline = vi.fn();
    const { ws } = await connected({ onMachineOffline });
    ws.emit({ type: 'machine_offline', machine_id: 'other' });
    expect(onMachineOffline).not.toHaveBeenCalled();
  });

  it('fires onMachineOnline only after DEK re-init resolves', async () => {
    const onMachineOnline = vi.fn();
    const { conn, ws } = await connected({ onMachineOnline });
    const initSpy = vi
      .spyOn(conn, 'initDek')
      .mockResolvedValue(undefined);

    ws.emit({
      type: 'machine_online',
      machine_id: 'm1',
      hostname: 'h',
      platform: 'p',
      port: 1,
    });

    expect(initSpy).toHaveBeenCalledTimes(1);
    await vi.waitFor(() => expect(onMachineOnline).toHaveBeenCalledTimes(1));
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd frontend && pnpm exec vitest run src/lib/e2ee/__tests__/connection.machineCallbacks.test.ts`
Expected: FAIL — `onMachineOffline` / `onMachineOnline` 从未被调用(option 还不存在、handler 未 fire)。

- [ ] **Step 3: 写最小实现**

编辑 `frontend/src/lib/e2ee/connection.ts`。

(a) `ConnectionOptions`(line 17-24)末尾加两个可选回调:

```ts
export interface ConnectionOptions {
  gatewayUrl: string;
  sessionToken: string;
  machineId: string;
  onConnect?: () => void;
  onDisconnect?: () => void;
  onError?: (error: string) => void;
  onMachineOffline?: () => void;
  onMachineOnline?: () => void;
}
```

(b) `handleMessage` 的 `machine_online`(当前 ~460-468):把 `initDek()` 的 `.then` 改为 DEK 重建成功后 fire `onMachineOnline`:

```ts
        // Bridge reconnected — re-init DEK if we're subscribed to this machine
        if (msg.machine_id === this.options?.machineId && this._connected) {
          this.dek = null;
          this.resetWsStreams(1006, 'Bridge reconnected');
          this.initDek()
            .then(() => this.options?.onMachineOnline?.())
            .catch((e) =>
              console.error('DEK re-init after bridge reconnect failed:', e)
            );
        }
        break;
```

(c) `handleMessage` 的 `machine_offline`(当前 ~470-480):在订阅机块内、null dek + resetWsStreams 之后 fire `onMachineOffline`:

```ts
      case 'machine_offline':
        this._machines = this._machines.filter(
          (m) => m.machine_id !== msg.machine_id
        );
        this.machineListeners.forEach((cb) => cb(this._machines));
        // Bridge disconnected — invalidate DEK (bridge will have fresh state on reconnect)
        if (msg.machine_id === this.options?.machineId) {
          this.dek = null;
          this.resetWsStreams(1006, 'Bridge disconnected');
          this.options?.onMachineOffline?.();
        }
        break;
```

- [ ] **Step 4: 运行测试确认通过**

Run: `cd frontend && pnpm exec vitest run src/lib/e2ee/__tests__/connection.machineCallbacks.test.ts`
Expected: PASS（3 passed）。

- [ ] **Step 5: 提交**

```bash
git add frontend/src/lib/e2ee/connection.ts frontend/src/lib/e2ee/__tests__/connection.machineCallbacks.test.ts
git commit -m "feat(e2ee): fire machine offline/online callbacks for subscribed machine"
```

---

## Task 4: Layer 2 — `GatewayMachineConnection` 在 doConnect 中翻转 status

**Files:**
- Modify: `frontend/src/lib/connections/gatewayConnection.ts:97-118`（`doConnect`）
- Test: `frontend/src/lib/connections/__tests__/gatewayConnection.test.ts`（追加用例）

- [ ] **Step 1: 写失败测试（追加到 Task 2 的测试文件)**

在 `frontend/src/lib/connections/__tests__/gatewayConnection.test.ts` 末尾追加:

```ts
describe('GatewayMachineConnection status flips (Layer 2)', () => {
  it('is connected after connect()', async () => {
    const { GatewayMachineConnection } = await import('../gatewayConnection');
    const c = new GatewayMachineConnection(
      'conn:m1', 'http://gw', 'label', 'http://gw', SESSION, 'm1'
    );
    await c.connect();
    expect(c.status).toBe('connected');
  });

  it('flips to reconnecting on machine offline, back to connected on online', async () => {
    const { GatewayMachineConnection } = await import('../gatewayConnection');
    const c = new GatewayMachineConnection(
      'conn:m1', 'http://gw', 'label', 'http://gw', SESSION, 'm1'
    );
    await c.connect();
    const opts = e2ee.instances[0].options!;

    // Register the listener AFTER connect so we only capture the offline/online
    // transitions (connect itself emits 'connecting' then 'connected').
    const seen: Array<[string, string | null]> = [];
    c.onStatusChange((s, e) => seen.push([s, e]));

    opts.onMachineOffline();
    expect(c.status).toBe('reconnecting');
    expect(c.error).toBe('Machine offline');

    opts.onMachineOnline();
    expect(c.status).toBe('connected');
    expect(c.error).toBeNull();

    expect(seen).toEqual([
      ['reconnecting', 'Machine offline'],
      ['connected', null],
    ]);
  });

  it('machine offline does NOT spin up a second E2EEConnection (no gateway-level reconnect)', async () => {
    const { GatewayMachineConnection } = await import('../gatewayConnection');
    const c = new GatewayMachineConnection(
      'conn:m1', 'http://gw', 'label', 'http://gw', SESSION, 'm1'
    );
    await c.connect();
    e2ee.instances[0].options!.onMachineOffline();
    expect(e2ee.instances).toHaveLength(1);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd frontend && pnpm exec vitest run src/lib/connections/__tests__/gatewayConnection.test.ts`
Expected: FAIL — offline 后 `status` 仍为 `'connected'`(回调未接入 `setStatus`);`seen` 数组不含 reconnecting。

- [ ] **Step 3: 写最小实现**

编辑 `frontend/src/lib/connections/gatewayConnection.ts` 的 `doConnect`(line 97-118),在传给 `conn.connect({...})` 的对象里加入两个新回调(放在 `onError` 之后):

```ts
  private async doConnect(): Promise<void> {
    const conn = new E2EEConnection();
    await conn.connect({
      gatewayUrl: this.gatewayUrl,
      sessionToken: this.session.sessionToken,
      machineId: this.machineId,
      onConnect: () => {
        this.reconnectAttempts = 0;
      },
      onDisconnect: () => {
        this.e2eeConn = null;
        this.attemptReconnect();
      },
      onError: (err) => {
        this.setStatus('error', err);
      },
      onMachineOffline: () => {
        this.setStatus('reconnecting', 'Machine offline');
      },
      onMachineOnline: () => {
        this.reconnectAttempts = 0;
        this.setStatus('connected');
      },
    });
    conn.subscribeMachine(this.machineId);
    await conn.initDek();
    this.e2eeConn = conn;
    this.setStatus('connected');
  }
```

- [ ] **Step 4: 运行测试确认通过**

Run: `cd frontend && pnpm exec vitest run src/lib/connections/__tests__/gatewayConnection.test.ts`
Expected: PASS（5 passed:2 Layer 3 + 3 Layer 2）。

- [ ] **Step 5: 提交**

```bash
git add frontend/src/lib/connections/gatewayConnection.ts frontend/src/lib/connections/__tests__/gatewayConnection.test.ts
git commit -m "feat(connections): flip machine connection status on offline/online"
```

---

## Task 5: Layer 1 — `TabErrorBoundary` 组件

**Files:**
- Create: `frontend/src/components/tabs/TabErrorBoundary.tsx`
- Test: `frontend/src/components/tabs/__tests__/TabErrorBoundary.test.tsx`

设计要点:复用 `@sentry/react` 的 `Sentry.ErrorBoundary`(自带上报 + `resetError`);fallback 用 render-prop;reset 时既 `resetError()` 又 bump child `key` 强制重挂坏掉的子树。文案用最小英文硬编码(与 `main.tsx` 极简 fallback 一致;默认 `pnpm run frontend:lint` 不启用 i18n 规则)。

- [ ] **Step 1: 写失败测试**

创建 `frontend/src/components/tabs/__tests__/TabErrorBoundary.test.tsx`:

```tsx
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TabErrorBoundary } from '../TabErrorBoundary';

let shouldThrow = true;
function Boom() {
  if (shouldThrow) throw new Error('boom');
  return <div>recovered</div>;
}

beforeEach(() => {
  shouldThrow = true;
  // React logs caught render errors to console.error — silence for clean output.
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe('TabErrorBoundary', () => {
  it('isolates a throwing child and keeps siblings rendered', () => {
    render(
      <>
        <TabErrorBoundary tabKey="a">
          <Boom />
        </TabErrorBoundary>
        <div data-testid="sibling">ok</div>
      </>
    );
    expect(screen.getByTestId('sibling')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /reload tab/i })
    ).toBeInTheDocument();
  });

  it('remounts children when "Reload tab" is clicked after the cause is fixed', () => {
    render(
      <TabErrorBoundary tabKey="a">
        <Boom />
      </TabErrorBoundary>
    );
    // fix the cause, then reload
    shouldThrow = false;
    fireEvent.click(screen.getByRole('button', { name: /reload tab/i }));
    expect(screen.getByText('recovered')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd frontend && pnpm exec vitest run src/components/tabs/__tests__/TabErrorBoundary.test.tsx`
Expected: FAIL — `Failed to resolve import "../TabErrorBoundary"`。

- [ ] **Step 3: 写最小实现**

创建 `frontend/src/components/tabs/TabErrorBoundary.tsx`:

```tsx
// frontend/src/components/tabs/TabErrorBoundary.tsx
import { useState, type ReactNode } from 'react';
import * as Sentry from '@sentry/react';

interface TabErrorBoundaryProps {
  /** Stable per-tab key (tab.id or 'home'); used to scope the boundary + remount. */
  tabKey: string;
  /** Optional tab label shown in the fallback. */
  label?: string;
  children: ReactNode;
}

/**
 * Per-tab error boundary. One tab throwing must NOT take down the other tabs or
 * the Home tab (they are all mounted simultaneously under a single root boundary).
 *
 * On "Reload tab" we both resetError() AND bump a child key, because resetError
 * alone re-renders the still-broken subtree without remounting it.
 */
export function TabErrorBoundary({
  tabKey,
  label,
  children,
}: TabErrorBoundaryProps) {
  const [resetSeq, setResetSeq] = useState(0);

  return (
    <Sentry.ErrorBoundary
      beforeCapture={(scope) => {
        scope.setTag('tab_id', tabKey);
      }}
      fallback={({ resetError }) => (
        <div className="flex items-center justify-center h-full">
          <div className="text-center space-y-3 max-w-sm px-6">
            <p className="text-destructive text-sm font-medium">
              This tab crashed
            </p>
            <p className="text-foreground/60 text-xs">
              {label ? `"${label}" ran into an error.` : 'This tab ran into an error.'}{' '}
              Other tabs are unaffected.
            </p>
            <button
              className="px-3 py-1.5 text-sm bg-foreground text-background rounded hover:opacity-85"
              onClick={() => {
                resetError();
                setResetSeq((n) => n + 1);
              }}
            >
              Reload tab
            </button>
          </div>
        </div>
      )}
    >
      <div key={`${tabKey}:${resetSeq}`} className="h-full">
        {children}
      </div>
    </Sentry.ErrorBoundary>
  );
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `cd frontend && pnpm exec vitest run src/components/tabs/__tests__/TabErrorBoundary.test.tsx`
Expected: PASS（2 passed）。

> 说明:`Sentry.ErrorBoundary` 的 `resetError` 由 fallback render-prop 提供;bump `resetSeq` 改变内层 `<div key>`,强制 React 卸载并重建 `children`(此时 `shouldThrow=false`,`Boom` 渲染 "recovered")。

- [ ] **Step 5: 提交**

```bash
git add frontend/src/components/tabs/TabErrorBoundary.tsx frontend/src/components/tabs/__tests__/TabErrorBoundary.test.tsx
git commit -m "feat(tabs): add per-tab error boundary with reload"
```

---

## Task 6: Layer 1 — 在三个 shell 中用 `TabErrorBoundary` 包裹 tab 子树

**Files:**
- Modify: `frontend/src/components/tabs/GatewayShell.tsx`
- Modify: `frontend/src/components/tabs/MultiConnectionShell.tsx`
- Modify: `frontend/src/components/tabs/LocalDirectShell.tsx`

无独立单元测试(shell 的全量依赖 mock 成本高、价值低;隔离逻辑已由 Task 5 覆盖,跨 tab 隔离由手动 E2E 验证)。用 type-check + 全量测试守护。

- [ ] **Step 1: 改 `GatewayShell.tsx`**

顶部 import 区加(与现有 `./` import 同组):

```ts
import { TabErrorBoundary } from './TabErrorBoundary';
```

把 Home tab 内容(当前约 66-71 行)的 `<GatewayHomeTab connectionId={GATEWAY_SELF_ID} />` 包起来:

```tsx
        <div
          className={`h-full overflow-auto ${
            activeTabId === 'home' ? '' : 'hidden'
          }`}
        >
          <TabErrorBoundary tabKey="home">
            <GatewayHomeTab connectionId={GATEWAY_SELF_ID} />
          </TabErrorBoundary>
        </div>
```

把 `tabs.map` 内(当前约 72-85 行)的 tab 分支包起来:

```tsx
        {tabs.map((tab) => (
          <div
            key={tab.id}
            className={`h-full overflow-hidden ${
              activeTabId === tab.id ? '' : 'hidden'
            }`}
          >
            <TabErrorBoundary tabKey={tab.id} label={tab.label}>
              {tab.type === 'machine-projects' ? (
                <MachineProjectsTab tab={tab} />
              ) : (
                <ProjectTab tab={tab} />
              )}
            </TabErrorBoundary>
          </div>
        ))}
```

- [ ] **Step 2: 改 `MultiConnectionShell.tsx`**

顶部加 import:

```ts
import { TabErrorBoundary } from './TabErrorBoundary';
```

Home tab(当前约 60-64 行)的 `<HomeTab />`:

```tsx
        <div
          className={`h-full overflow-auto ${activeTabId === 'home' ? '' : 'hidden'}`}
        >
          <TabErrorBoundary tabKey="home">
            <HomeTab />
          </TabErrorBoundary>
        </div>
```

`tabs.map` 内(当前约 67-78 行):

```tsx
        {tabs.map((tab) => (
          <div
            key={tab.id}
            className={`h-full overflow-hidden ${activeTabId === tab.id ? '' : 'hidden'}`}
          >
            <TabErrorBoundary tabKey={tab.id} label={tab.label}>
              {tab.type === 'machine-projects' ? (
                <MachineProjectsTab tab={tab} />
              ) : (
                <ProjectTab tab={tab} />
              )}
            </TabErrorBoundary>
          </div>
        ))}
```

- [ ] **Step 3: 改 `LocalDirectShell.tsx`**

顶部加 import:

```ts
import { TabErrorBoundary } from './TabErrorBoundary';
```

把结尾(当前约 72-76 行)的 `<App />` 包起来:

```tsx
  return (
    <div className="h-screen">
      <TabErrorBoundary tabKey="local">
        <App />
      </TabErrorBoundary>
    </div>
  );
```

- [ ] **Step 4: 类型检查 + 全量测试**

Run: `cd frontend && pnpm run check`
Expected: 无类型错误。

Run: `cd frontend && pnpm exec vitest run src/components/tabs`
Expected: PASS（含 TabErrorBoundary 及现有 tabs 测试）。

- [ ] **Step 5: 提交**

```bash
git add frontend/src/components/tabs/GatewayShell.tsx frontend/src/components/tabs/MultiConnectionShell.tsx frontend/src/components/tabs/LocalDirectShell.tsx
git commit -m "feat(tabs): isolate each tab subtree with TabErrorBoundary"
```

---

## Task 7: 全量验证

**Files:** 无改动,仅运行验证。

- [ ] **Step 1: 全量单元测试**

Run: `cd frontend && pnpm run test`
Expected: 全部 PASS(含本次新增 4 个测试文件,且无回归)。

- [ ] **Step 2: 类型检查**

Run: `cd frontend && pnpm run check`
Expected: 无错误。

- [ ] **Step 3: Lint**

Run: `cd frontend && pnpm run lint`
Expected: 无错误、无 warning(`--max-warnings 0`)。如有 import 顺序/格式问题,`pnpm run lint:fix` 后复查并补提交。

- [ ] **Step 4: 手动 E2E(gateway 模式,两台 machine A/B)**

按 spec「Verification」执行:
1. 打开 A、B 的 machine-projects tab + Home tab,各进入一个任务视图(让 `useExecutionProcesses` 流活跃)。
2. 停掉 B 的 CLI → 预期:页面**不白屏**;B tab 显示 spinner + "Machine offline";A tab 照常工作;Home 列表移除 B;控制台无来自 `openWs`/`openWsStream` 的未捕获同步错误。
3. 重启 B 的 CLI → 预期:B tab 翻回 connected 并重挂 `<App/>`,任务视图重新加载。
4. 合成隔离抽查:临时让某 tab render 抛错 → 仅该 tab 显示 "Reload tab" 兜底,其余 tab + Home 存活,点击可恢复。
5.（可选)生产构建复跑:`pnpm run gateway:build`,确认 StrictMode 之外回调不重复 fire、无 listener 泄漏。

- [ ] **Step 5: 收尾提交(若 lint:fix 有改动)**

```bash
git add -A && git commit -m "chore: lint fixes for tab fault-isolation"
```

---

## Self-Review notes

- **Spec coverage:** Layer 1 = Task 5+6;Layer 2 = Task 3+4;Layer 3 = Task 1+2;验证 = Task 7。Success criteria 全部对应。
- **类型一致性:** `createDeadWebSocket(reason: string): WebSocketLike`(Task 1 定义,Task 2 使用);`onMachineOffline`/`onMachineOnline`(Task 3 定义于 `ConnectionOptions`,Task 4 在 `doConnect` 传入);`TabErrorBoundary({ tabKey, label?, children })`(Task 5 定义,Task 6 使用)。
- **无占位符:** 所有步骤含完整代码与确切命令。
- **测试框架适配:** 无 `@testing-library/user-event`,统一用 `fireEvent`;复用 `MockWebSocket` + `vi.stubGlobal` + `vi.hoisted`/`vi.mock('@/lib/e2ee')` 既有模式。
