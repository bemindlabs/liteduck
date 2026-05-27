# Contributing to LiteDuck

Thanks for your interest in improving LiteDuck! This guide covers the local
setup, workflow, and the checks your change needs to pass.

## Prerequisites

- [Node.js](https://nodejs.org/) 22+
- [Rust](https://www.rust-lang.org/tools/install) (stable)
- Platform dependencies for [Tauri v2](https://v2.tauri.app/start/prerequisites/)

## Setup

```bash
npm install
bash .githooks/install.sh   # pre-commit + pre-push hooks
npm run tauri:dev           # run the app with hot reload
```

## Workflow

1. Fork the repo and create a feature branch off `main`
   (`git checkout -b feat/short-description`).
2. Make your change with focused commits. Keep new code consistent with the
   surrounding style — naming, comment density, and idioms.
3. Run the quality gate locally before opening a PR (see below).
4. Open a pull request describing **what** changed and **why**. Link any
   related issue.

## Quality gates

Your change must pass the full gate that CI runs:

```bash
npm run quality-gate
```

This covers, in order:

| Check        | Command                                   |
| ------------ | ----------------------------------------- |
| Types        | `tsc --noEmit -p tsconfig.app.json`       |
| Format       | `npm run format:check` (Prettier)         |
| Lint         | `npm run lint` (ESLint)                   |
| Unit tests   | `vitest run --coverage`                   |
| Rust check   | `cargo check --all-targets`               |
| Rust format  | `cargo fmt -- --check`                    |
| Rust lint    | `cargo clippy -- -D warnings`             |
| Rust tests   | `cargo test`                              |

Auto-fix formatting/lint with `npm run format` and `npm run lint:fix`.

## Conventions

- **Tauri IPC**: each Rust module exposes `#[tauri::command]` functions
  registered in `src-tauri/src/lib.rs`; frontend wrappers live in `src/lib/`
  (one file per domain). All commands return `Result<T, String>`.
- **Tests**: colocate frontend tests as `*.test.ts(x)`; Rust unit tests live in
  the module they cover.
- **Scope**: LiteDuck is intentionally a focused editor — file browser + editor,
  terminal, Git, and Settings. It has no AI/LLM, chat, or agent features. Please
  keep PRs aligned with that scope, or open an issue to discuss first.

## Reporting issues

Use GitHub Issues. For bugs, include your OS, LiteDuck version (Settings →
About), reproduction steps, and any relevant logs.

By contributing, you agree that your contributions are licensed under the
[MIT License](LICENSE).
