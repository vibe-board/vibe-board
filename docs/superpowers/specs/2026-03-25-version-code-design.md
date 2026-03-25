# 编译时注入版本号（含 commit SHA）

## Context

当前编译产物中只包含 semver 版本号（如 `0.1.9-main.5`），不包含 git commit SHA。排查问题时难以精确定位到代码版本。需要在前后端编译时都注入包含 commit SHA 的版本号。

## 目标格式

`0.1.9-main.5+abc1234` — SemVer + `+` + commit SHA 前 7 位

## 设计

### Rust 端

#### 1. build.rs 注入 GIT_COMMIT_HASH

`crates/server/build.rs` 和 `crates/e2ee-gateway/build.rs` 各自增加：

```rust
// 在 build() 函数顶部
let output = std::process::Command::new("git")
    .args(["rev-parse", "--short=7", "HEAD"])
    .output();
let git_hash = match output {
    Ok(o) if o.status.success() => String::from_utf8_lossy(&o.stdout).trim().to_string(),
    _ => "unknown".to_string(),
};
println!("cargo:rustc-env=GIT_COMMIT_HASH={git_hash}");
```

#### 2. 扩展 utils::version

`crates/utils/src/version.rs` 新增：

```rust
pub const APP_VERSION_WITH_SHA: &str =
    concat!(env!("CARGO_PKG_VERSION"), "+", env!("GIT_COMMIT_HASH"));
```

保留 `APP_VERSION` 不变，已有消费方（analytics、codex client 等）不受影响。

#### 3. 消费点改动

- **`/api/health` 端点** (`crates/server/src/routes/health.rs`): 返回 `{"version": APP_VERSION_WITH_SHA}`
- **MCP server 启动日志** (`crates/server/src/bin/mcp_task_server.rs`): 使用 `APP_VERSION_WITH_SHA`
- **主 server 启动日志**: 使用 `APP_VERSION_WITH_SHA`
- analytics 和 codex client 保持用 `APP_VERSION`（纯 semver）

### 前端

#### vite.config.ts

在 `define` 块中获取 SHA 并拼入 `__APP_VERSION__`：

```ts
const gitSha = execSync('git rev-parse --short=7 HEAD', { encoding: 'utf-8' }).trim() || 'unknown';

define: {
  __APP_VERSION__: JSON.stringify(`${pkg.version}+${gitSha}`),
}
```

`vite-env.d.ts` 已有 `declare const __APP_VERSION__: string` 声明，无需改动。

#### Settings 页面展示

在 `GeneralSettings.tsx` 底部（Safety Card 之后）新增一个 "About" Card，显示 `__APP_VERSION__` 常量值。沿用现有 Card 模式（Card > CardHeader > CardTitle > CardContent）。

### 边界处理

- `git rev-parse` 失败时（如 CI 中 .git 目录不存在）：fallback 到 `"unknown"`
- 不处理 dirty flag，保持简单

## 改动文件清单

| 文件 | 改动 |
|------|------|
| `crates/server/build.rs` | 增加 git SHA 注入 |
| `crates/e2ee-gateway/build.rs` | 增加 git SHA 注入 |
| `crates/utils/src/version.rs` | 新增 `APP_VERSION_WITH_SHA` |
| `crates/server/src/routes/health.rs` | 返回版本信息 |
| `crates/server/src/bin/mcp_task_server.rs` | 使用 `APP_VERSION_WITH_SHA` |
| `crates/e2ee-gateway/src/routes/health.rs` | 使用 `APP_VERSION_WITH_SHA` |
| `crates/e2ee-gateway/src/routes/mod.rs` | 使用 `APP_VERSION_WITH_SHA` |
| `frontend/vite.config.ts` | define 中拼入 SHA |
| `frontend/src/pages/settings/GeneralSettings.tsx` | 底部新增 About Card 显示版本号 |
