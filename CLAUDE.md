# CLAUDE.md

This file provides guidance to Claude Code when working with code in this repository.

## Project Overview

This is the `rust_markdown_app` project - a Rust application for markdown processing/rendering.

## Rust Environment

- **Toolchain**: Use the system-installed Rust toolchain (rustup)
- **Build**: `cargo build`
- **Run**: `cargo run`
- **Test**: `cargo test`
- **Release build**: `cargo build --release`

### Working with Rust
- Use `cargo` for all build, run, and dependency management tasks
- Add dependencies to `Cargo.toml` under `[dependencies]`
- Keep `Cargo.lock` committed to version control for reproducible builds

## Development Guidelines

### Project Structure
- Source code lives in `src/`
- Entry point is `src/main.rs`
- Library code (if any) lives in `src/lib.rs`
- Tests can be inline (unit tests) or in a `tests/` directory (integration tests)

### Code Style
- Follow standard Rust conventions (`rustfmt` formatting)
- Use `cargo clippy` for linting
- Handle errors explicitly using `Result` and the `?` operator

### Data Handling
- Be mindful of potential PII (Personally Identifiable Information)
- Never commit sensitive data to the repository
- Document data sources and processing steps

## Getting Started

1. Ensure Rust is installed: `rustup --version`
2. Build the project: `cargo build`
3. Run the project: `cargo run`
4. Run tests: `cargo test`

[Add project-specific instructions here]
