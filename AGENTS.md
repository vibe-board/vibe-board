# Repository Guidelines

## Project Structure & Module Organization
- `crates/`: Rust workspace crates — `server` (API + bins), `db` (SQLx models/migrations), `executors`, `services`, `utils`, `deployment`, `local-deployment`.
- `frontend/`: React + TypeScript app (Vite, Tailwind). Source in `frontend/src`.
- `frontend/src/components/dialogs`: Dialog components for the frontend.
- `shared/`: Generated TypeScript types (`shared/types.ts`). Do not edit directly.
- `assets/`, `dev_assets_seed/`, `dev_assets/`: Packaged and local dev assets.
- `npx-cli/`: Files published to the npm CLI package.
- `scripts/`: Dev helpers (ports, DB preparation).
- `docs/`: Documentation files.

## Managing Shared Types Between Rust and TypeScript

ts-rs allows you to derive TypeScript types from Rust structs/enums. By annotating your Rust types with #[derive(TS)] and related macros, ts-rs will generate .ts declaration files for those types.
When making changes to the types, you can regenerate them using `pnpm run generate-types`
Do not manually edit shared/types.ts, instead edit crates/server/src/bin/generate_types.rs

## Build, Test, and Development Commands
- **IMPORTANT: Always use `pnpm`, never `npm`.** Do not run `npm install`, `npm run`, etc. — always use `pnpm`.
- Install: `pnpm i`
- Run dev (frontend + backend with ports auto-assigned): `pnpm run dev`
- Backend (watch): `pnpm run backend:dev:watch`
- Frontend (dev): `pnpm run frontend:dev`
- Type checks: `pnpm run check` (frontend) and `pnpm run backend:check` (Rust cargo check)
- Rust tests: `cargo test --workspace`
- Generate TS types from Rust: `pnpm run generate-types` (or `generate-types:check` in CI)
- Prepare SQLx (offline): `pnpm run prepare-db`
- Local NPX build: `pnpm run build:npx` then `pnpm pack` in `npx-cli/`

## Coding Style & Naming Conventions
- Rust: `rustfmt` enforced (`rustfmt.toml`); group imports by crate; snake_case modules, PascalCase types.
- TypeScript/React: ESLint + Prettier (2 spaces, single quotes, 80 cols). PascalCase components, camelCase vars/functions, kebab-case file names where practical.
- Keep functions small, add `Debug`/`Serialize`/`Deserialize` where useful.

## Frontend Design System
- This project uses **legacy design only** (`legacy-design` class scoped CSS variables in `styles/legacy/index.css`, Tailwind config in `tailwind.legacy.config.js`).
- The new design system (`tailwind.new.config.js`, `.new-design` class) is **not used**. Do not reference or introduce new-design styles.
- All UI components (`components/ui/`) use legacy design tokens (e.g. `bg-primary`, `bg-muted`, `bg-background`).
- When building dialogs or new components, follow the style of existing dialogs (e.g. `ViewProcessesDialog`, `ViewRelatedTasksDialog`) — use standard `Dialog*` components from `@/components/ui/dialog`, `Button` from `@/components/ui/button`, `Alert` from `@/components/ui/alert`.

### Dialog sizing best practice
- **Always pass `max-w-*` / width overrides to `<Dialog className="...">`, NOT to `<DialogContent>`.**
- The `Dialog` component renders an outer box with default `max-w-xl`. `className` on `Dialog` merges into this outer box via `twMerge`, so `sm:max-w-md` correctly replaces the default.
- `DialogContent` is a flex-col child inside the outer box. Putting `max-w-*` on `DialogContent` makes it narrower than the outer box, causing content to appear left-aligned (flex column cross-axis defaults to stretch from the left edge).
- Reference: `ViewProcessesDialog`, `ViewRelatedTasksDialog` do this correctly. Some older dialogs (`ConfirmDialog`, `EditBranchNameDialog`) put `max-w` on `DialogContent` — do not follow that pattern.

## Testing Guidelines
- Rust: prefer unit tests alongside code (`#[cfg(test)]`), run `cargo test --workspace`. Add tests for new logic and edge cases.
- Frontend: ensure `pnpm run check` and `pnpm run lint` pass. If adding runtime logic, include lightweight tests (e.g., Vitest) in the same directory.

## Security & Config Tips
- Use `.env` for local overrides; never commit secrets. Key envs: `FRONTEND_PORT`, `BACKEND_PORT`, `HOST`
- Dev ports and assets are managed by `scripts/setup-dev-environment.js`.

## Worktree Configuration
- Worktree directory: `~/.config/superpowers/worktrees/` (global, outside repo). Do NOT create worktrees inside `.worktrees/` or `.claude/worktrees/` within the repo.
