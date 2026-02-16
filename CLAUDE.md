# CLAUDE.md

This file provides guidance to Claude Code when working with code in this repository.

## Project Overview

MarkView - A Rust + Tauri v2 desktop markdown file viewer application.

## Tech Stack

- **Backend**: Rust + Tauri v2
- **Frontend**: Plain HTML/CSS/JS (no framework, no npm, no bundler)
- **Key crates**: pulldown-cmark, walkdir, serde, serde_json, tauri-plugin-dialog

## Build & Run

- **Prerequisites**: `cargo install tauri-cli`
- **Development**: `cargo tauri dev` (from project root)
- **Production build**: `cargo tauri build`
- **Rust source**: `src-tauri/src/`
- **Frontend files**: `ui/` directory (`index.html`, `styles.css`, `app.js`)

## Project Structure

- `ui/index.html`, `ui/styles.css`, `ui/app.js` -- Frontend
- `src-tauri/` -- Tauri/Rust backend
  - `src/main.rs` -- Desktop entry point (calls lib::run())
  - `src/lib.rs` -- Tauri Builder + command registration
  - `src/commands.rs` -- All #[tauri::command] functions
  - `src/config.rs` -- Config persistence (JSON in app data dir)
  - `src/scanner.rs` -- Directory tree scanning with walkdir
  - `src/markdown.rs` -- Markdown to HTML with pulldown-cmark
  - `tauri.conf.json` -- Tauri configuration
  - `capabilities/default.json` -- Security permissions

## Code Style

- Follow standard Rust conventions (rustfmt, clippy)
- Frontend: vanilla JS, no dependencies, no build step
- Tauri commands use snake_case in Rust, camelCase in JS (auto-mapped by Tauri)
- Handle errors as `Result<T, String>` for Tauri command compatibility
