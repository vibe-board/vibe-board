# E2EE 多机 Web UI 可用性 — 一台 machine 掉线不再拖垮整个前端

**Date**: 2026-06-01
**Branch**: `vb/5b58-crash`
**Scope**: `frontend/src/components/tabs/{GatewayShell,MultiConnectionShell,LocalDirectShell}.tsx` + 新增 `TabErrorBoundary.tsx`;`frontend/src/lib/e2ee/connection.ts`;`frontend/src/lib/connections/gatewayConnection.ts` + 新增 `deadWebSocket.ts`

---

## Problem

E2EE web UI(gateway)模式下,前端通过 gateway 代理连接**多台 machine**,每台 machine 对应一个 tab、各自渲染一整个 `<App/>`。现状:只要**有一台** machine 掉线,**整个前端页面就崩溃**(白屏 / 错误兜底页),把健康的 machine tab 和 Home tab 一起带走。

### Root cause(已逐文件追踪确认)

两层叠加,缺一不会"全崩":

**1. 故障无隔离(放大器)。** `frontend/src/main.tsx:85` 全局只有**一个** `Sentry.ErrorBoundary` 包在最外层 `<TabShell/>` 上,fallback 是 `<p>{error}</p>`。而 `GatewayShell.tsx:72` / `MultiConnectionShell.tsx:67` 把**所有 tab 同时挂载**(`tabs.map`,非活跃 tab 仅用 `hidden` class 隐藏以保留状态)。于是**任意一个** tab 子树在 render 或 effect 中**同步抛异常**,都会冒泡到唯一的根边界,把**整个 app** 替换成错误页。

> ⚠️ Home tab 渲染在 `tabs.map` **之外**(同级 `<div>`),所以必须**单独**包一层边界,否则 Home 不受保护。

**2. `machine_offline` 触发同步抛异常(触发器)。** 链路:

- `connection.ts:470` `E2EEConnection` 收到 `machine_offline`:`this.dek = null` + `resetWsStreams(1006)` + 通知 `machineListeners`,但**不通知** `GatewayMachineConnection` 改 status。
- `gatewayConnection.ts` 的 `status` 仍是 `'connected'`(它只对整条 gateway WS 的 `onDisconnect` 反应,不管单机 offline)→ `MachineProjectsTab.tsx:79` 继续渲染 `<App/>`,子树**不卸载**。
- `resetWsStreams` → 各 stream `onclose(1006)` → `useJsonPatchWsStream.ts:189` `scheduleReconnect()` → `setRetryNonce` → effect 重跑 → `useJsonPatchWsStream.ts:113` **同步**调用 `conn.openWs()`。
- 此时 dek 为 null → `connection.ts:345` `openWsStream` 抛 `'DEK not established'`(`gatewayConnection.ts:169` 也会在 `!e2eeConn` 时抛 `'Not connected'`)→ effect 内同步抛 → 根边界 → **全屏崩溃**。

同样无保护的同步 `openWs` 调用还有:`useLogStream.ts:41`、`streamJsonPatchEntries.ts:140`、`XTermInstance.tsx:245`。`useExecutionProcesses`(用 `useJsonPatchWsStream`)几乎每个任务视图都挂载 → 爆炸半径极大。

### 两处关键修正(来自实现前的复核)

- **`gateway-service.ts:119` 的 `startMachineListWs` 是另一条独立 socket**(每个 gateway 连接共享一条),它的 `machine_offline`(line 154)调 `store.removeMachine` 驱动 `GatewayHomeTab` 列表 —— 与 `E2EEConnection`(每机一条)无关。因此 Layer 2 在 `E2EEConnection` 上加回调**不会**与 Home 列表逻辑冲突,也解释了为何 `GatewayHomeTab` 自身逻辑没问题、只是被根边界一起干掉。
- **`streamJsonPatchEntries.ts:156` 的 `onclose` 完全不看 close code**,只要 `!closed && !finished` 就重连 —— 终止信号只有 `finished` 消息或 `controller.close()`。因此**没有任何 close code 能让全部三个消费者都终止重连**,这说明 Layer 3 无法独立解决问题,真正的"停止"必须靠 Layer 2 卸载 `<App/>` 触发各 hook 的 cleanup → `controller.close()`。

---

## Goal

一台 machine 掉线时:该 tab 显示"重连中 / Machine offline",其余 machine tab 与 Home **不受影响照常工作**;machine 恢复后该 tab 自动重连并重载;任何**未预期**的 tab 崩溃只影响该 tab,并提供"重载本 tab"按钮。

采用三层正交的纵深防御:错误边界保证"不扩散",status 修复保证"优雅降级 + 自动恢复",openWs 守卫保证"不抛同步异常"。任一层失效,另两层仍兜底。

### Success criteria

- Gateway 模式下,停掉其中一台 machine 的 CLI,前端**不白屏**;掉线 tab 显示"Machine offline"spinner,其余 tab + Home 正常。
- 掉线机器恢复(`machine_online` + DEK 重建)后,对应 tab 自动翻回 `'connected'` 并重挂 `<App/>`,任务视图重新加载流。
- 合成测试:任一 tab render 抛错,只该 tab 显示"重载本 tab"兜底,其余 tab + Home 存活,点击可恢复。
- `cd frontend && pnpm run test`、`pnpm run frontend:check`、`pnpm run frontend:lint` 全过。

### Non-goals

- 不改"保留所有 tab 状态"的整体设计(不采用"只挂载活跃 tab")。
- 不改 `fetch` 的抛错语义(async,rejected promise 由 react-query `queryCache.onError` 消费,不到边界)。
- 不动 `removeRef` 30s 断连定时器的现有语义(见 Risks,可选硬化,本次不做)。
- 不重构 `useConversationHistory` / 流式 hook 的内部逻辑。

---

## Design

### Layer 1 — per-tab ErrorBoundary(隔离)

**新建 `frontend/src/components/tabs/TabErrorBoundary.tsx`**,复用 `@sentry/react` 的 `Sentry.ErrorBoundary`(自带上报 + `resetError`),不手写 class 边界。

- 签名:`TabErrorBoundary({ tabKey, label?, children })`。
- `fallback` 用 **render-prop** 形式 `({ error, resetError }) => <fallback/>`,显示简短提示(`common:states.error` + 可选 `label`)+ "重载本 tab"按钮。
- **强制干净重挂载**:children 包进 `key={`${tabKey}:${resetSeq}`}` 的片段;reset 处理器 `resetError(); setResetSeq(n => n + 1)`。`resetError()` 只清错误态、不重挂坏掉的 `<App/>`,bump key 才能真正销毁重建。
- `beforeCapture` 给 Sentry scope 打 `tab_id: tabKey` tag,便于归因/分组;**不开** `showDialog`(多 tab 弹模态突兀;根边界保留 `showDialog`)。
- fallback 用 legacy design tokens(`text-destructive`、`text-foreground/60`、`bg-foreground text-background`),`h-full` 居中盒子。

**接入点:**

- `GatewayShell.tsx`、`MultiConnectionShell.tsx`:Home tab 内容(`<GatewayHomeTab/>` / `<HomeTab/>`,在 `tabs.map` **之外**)各包一层 `<TabErrorBoundary tabKey="home">`;`tabs.map` 内把 `MachineProjectsTab`/`ProjectTab` 分支包进 `<TabErrorBoundary tabKey={tab.id} label={tab.label}>`,边界放在现有 `<div key={tab.id}>` **内部**(保持 `hidden` 切换与布局不变)。
- `LocalDirectShell.tsx`:`<App/>`(line 74)包一层 `<TabErrorBoundary tabKey="local">` 保持一致(单连接无跨 tab 扩散,但给本地模式也提供可恢复兜底)。
- `main.tsx` 根 `Sentry.ErrorBoundary` **保留**,作为 tab 之外 shell 级崩溃的最后兜底。

### Layer 2 — machine offline/online 翻转 `GatewayMachineConnection.status`(优雅降级 + 消除触发源)

**改 `frontend/src/lib/e2ee/connection.ts`:**

- `ConnectionOptions`(line 17)新增 `onMachineOffline?: () => void;` 与 `onMachineOnline?: () => void;`。
- `handleMessage` 的 `machine_offline`(line 476,订阅机块内、null dek + resetWsStreams 之后)调用 `this.options?.onMachineOffline?.()`。
- `machine_online`(line 461,现有 `msg.machine_id === this.options?.machineId && this._connected` 块内):保留 `dek=null; resetWsStreams; initDek()`,把 `.then` 改为 **DEK 重建成功后**再 fire(确认式):

```ts
this.initDek()
  .then(() => this.options?.onMachineOnline?.())
  .catch((e) => console.error('DEK re-init after bridge reconnect failed:', e));
```

只有 DEK 真正重建后才回 `'connected'`,避免 `<App/>` 重挂进一个仍是 null-dek 的坏连接再次抛错。`initDek` 有 10s 超时 + `_dekInFlight` 去重兜底。

**改 `frontend/src/lib/connections/gatewayConnection.ts`** `doConnect`(line 97)向 `conn.connect({...})` 传入:

```ts
onMachineOffline: () => { this.setStatus('reconnecting', 'Machine offline'); },
onMachineOnline:  () => { this.reconnectAttempts = 0; this.setStatus('connected'); },
```

**安全性(已核对):**

- `MachineProjectsTab.tsx:46` 对 `'reconnecting'` 已显示 spinner;`:31-36` 自动连接只在 `'disconnected'/'error'` 触发 → 翻 `'reconnecting'` **不会**触发 `conn.connect()`。
- 整条 gateway 的 `attemptReconnect`(gatewayConnection.ts:120)只由 `E2EEConnection.onDisconnect`(WS 真断)驱动;单机 offline 不关 gateway WS → **不会**误触发。
- 翻 `'reconnecting'` → `MachineProjectsTab` 卸载 `<App/>` → 各 stream hook cleanup(`useJsonPatchWsStream.ts:195`、`useLogStream.ts:123`、`streamJsonPatchEntries` 经消费者 `close()`)→ 在任何重连调用 null-dek `openWs` **之前**就拆掉流 = **从源头消除抛异常**。
- DEK 重建失败时停在 `'reconnecting'`(spinner),**不**翻 `'error'`(否则触发 MachineProjectsTab 自动连接,与 gateway socket 抢),等下次 `machine_online`。

### Layer 3 — `openWs` 非抛兜底(backstop,仅 gateway)

**新建 `frontend/src/lib/connections/deadWebSocket.ts`:**

- `createDeadWebSocket(reason: string): WebSocketLike`(实现 `types.ts:13` 的接口):`readyState = 3`(CLOSED),no-op `send`/`close`,可设 `onopen/onmessage/onclose/onerror`。
- 创建时排一个 microtask/`setTimeout(0)`,**若消费者尚未 close**,先 fire `onerror(new Event('error'))` 再 fire `onclose(new CloseEvent('close', { code: 1000, reason, wasClean: true }))`;内部 `closed` flag 防止消费者 `close()` 后再触发。

**改 `gatewayConnection.ts` `openWs`(line 168):**

```ts
openWs(path, query): WebSocketLike {
  if (!this.e2eeConn) return createDeadWebSocket('Not connected');
  try {
    return this.e2eeConn.openWsStream(path, query) as unknown as WebSocketLike;
  } catch (e) {
    return createDeadWebSocket(e instanceof Error ? e.message : 'Stream unavailable');
  }
}
```

`try/catch` 同时覆盖 `connection.ts:345` 的 null-dek 抛错,故**无需**再到 `connection.ts`/`RemoteWs` 层加守卫 —— 守卫只放在 `gatewayConnection.ts` 这个 `UnifiedConnection.openWs` 单一收口(四个调用点都走它)。

close code 选 `1000/wasClean=true`:对 `useJsonPatchWsStream`(`:183`)、`useLogStream`(`:110`)是终止信号、不重连;对 `streamJsonPatchEntries` 不终止(它忽略 code),但其重连有 `maxRetries` 上限,且最终被 Layer 2 卸载切断 —— 每次重连只拿到又一个无害 dead stub,有界、不抛。

---

## Testing(TDD)

复用 `frontend/src/utils/__tests__/streamJsonPatchEntries.test.ts` 的 `MockWebSocket`/`createMockConnection` 与 `frontend/src/components/layout/__tests__/NormalLayout.test.tsx` 的 `vi.mock` + RTL `render`/`waitFor` 模式。

**先写失败测试(红):** `frontend/src/components/tabs/__tests__/TabErrorBoundary.test.tsx`

1. 渲染 `<TabErrorBoundary tabKey="a"><Boom/></TabErrorBoundary>` 紧邻 `<div data-testid="sibling">ok</div>`;断言显示 fallback **且** `sibling` 仍在 DOM(边界不存在时此测试失败)。用 `vi.spyOn(console,'error').mockImplementation(()=>{})` 静默 React 捕获日志。
2. 点击"重载本 tab" → `Boom` 改为不抛(模块级 flag 切换)→ 断言恢复渲染 children,证明 `resetError` + key bump 重挂。

**Layer 2 单测:**

- `frontend/src/lib/connections/__tests__/gatewayConnection.machineOffline.test.ts`:`vi.mock('@/lib/e2ee')` 注入假 `E2EEConnection`(`connect` 暂存 options 并模拟 auth_ok,暴露 `triggerMachineOffline/Online`,假 `initDek` resolve)。断言:connect 后 `'connected'`;offline → `'reconnecting'` + `'Machine offline'` + listener 收到;online(initDek resolve 后)→ `'connected'` + error null + `reconnectAttempts=0`;offline **不**启动 `attemptReconnect`。
- `frontend/src/lib/e2ee/__tests__/connection.machineCallbacks.test.ts`:驱动 `E2EEConnection.handleMessage`,断言订阅机的 `machine_offline` 调一次 `onMachineOffline` 且 dek 置空;`machine_online` 触发 `initDek` 且 resolve 后 `onMachineOnline`;**非**订阅机的 offline 不调回调。

**Layer 3 单测:** `frontend/src/lib/connections/__tests__/deadWebSocket.test.ts`(`vi.useFakeTimers()`):`readyState===3`;推进定时器后先 `onerror` 后 `onclose(1000, wasClean, reason)`;消费者先 `close()` 则都不 fire。再加一条 `gatewayConnection.openWs`:`e2eeConn` null 时返回 dead socket(不抛);`openWsStream` 抛时被 catch 返回 dead socket。

---

## Risks & edge cases

- **`streamJsonPatchEntries` 忽略 close code**:Layer 3 单独拦不住其重连循环,真正终止靠 Layer 2 卸载;风险有界(maxRetries)且不致命(不抛)。
- **同机多 tab 共享一个 `GatewayMachineConnection`**(machine-registry 按 `connId:machineId`):一次 `setStatus` 同时翻转该机所有 tab —— 符合预期(都指向同一个死 bridge),恢复时一起重挂。
- **StrictMode 双挂载**(main.tsx:82):`resetSeq` 是组件 state;Layer 2 回调挂在单次创建的 `E2EEConnection` 实例上;各 effect 有 cleanup —— 均幂等。
- **`removeRef` 30s 断连定时器**(gatewayConnection.ts:63)只在 `status==='connected'` 时启动;offline 期间关 tab 不会启动 → 连接滞留至机器恢复。低危泄漏,本次不硬化(列为后续可选项)。
- **Sentry 噪声**:per-tab 边界各自上报;但 Layer 2+3 落地后 `machine_offline` 路径不再抛,稳态上报量应**下降**。边界主要兜未预期错误。
- **重载语义**:点击"重载本 tab"会重挂 `<App/>` 及其 per-connection react-query 缓存,in-flight 查询重置、该 tab 未保存编辑态丢失 —— 崩溃恢复动作的预期代价。

## Verification(端到端手动)

Gateway 模式,两台已配对 machine A/B,同一页面:

1. 分别打开 A、B 的 machine-projects tab 与 Home tab,各进入一个任务视图让 `useExecutionProcesses` 流活跃。
2. **触发**:停掉 B 的 vibe-board CLI(或 kill 其 bridge)→ gateway 发 `machine_offline`。
3. **预期**:页面**不**白屏;B tab 显示 spinner + "Machine offline";A tab 照常流式工作、不重挂;Home 列表移除 B;控制台无来自 `openWs`/`openWsStream` 的未捕获同步错误。
4. **恢复**:重启 B 的 CLI → `machine_online` → DEK 重建 → B tab 翻回 `'connected'` 并重挂 `<App/>`,任务视图重新加载流。
5. **Layer 1 隔离抽查**(合成):临时让某 tab render 抛错,确认仅该 tab 显示"重载本 tab"兜底、其余 tab + Home 存活、点击重载可恢复、Sentry 收到带 `tab_id` 的事件。
6. 用生产构建(`pnpm run gateway:build`)复跑一遍,确认 StrictMode 之外回调不重复 fire、无 listener 泄漏。
