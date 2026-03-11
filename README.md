# MarkView

A lightweight desktop markdown viewer built with Rust and Tauri v2. Browse folders of markdown files with a sidebar tree, rendered content pane, dark mode, and fast local rendering -- no Electron, no Node.js runtime.

## Features

- **Catalog management** -- Add, rename, and remove folder catalogs to organize your markdown collections
- **Directory tree** -- Browse nested folders with a collapsible file tree and real-time search filter
- **Markdown rendering** -- Fast HTML conversion via pulldown-cmark (with SIMD acceleration)
- **Dark mode** -- Toggle between light and dark themes, persisted across sessions
- **Resizable sidebar** -- Drag to resize; layout preference is saved automatically
- **Native file dialogs** -- Folder picker uses the OS-native dialog
- **Minimal footprint** -- No npm, no bundler, no framework; just plain HTML/CSS/JS frontend with a Rust backend

## Installation

### Download a release (recommended)

Download the latest `.msi` or `.exe` installer from the [Releases](https://github.com/<your-username>/markview/releases) page and run it. No additional dependencies are required -- WebView2 is already included on Windows 10/11.

### Build from source

**Prerequisites:**

- [Rust](https://rustup.rs/) (stable toolchain)
- Platform build dependencies for Tauri v2:
  - **Windows**: Microsoft Visual Studio C++ Build Tools, WebView2 (included on Windows 10/11)
  - **macOS**: Xcode Command Line Tools
  - **Linux**: See [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/#linux)
- Tauri CLI:
  ```
  cargo install tauri-cli
  ```

```bash
# Clone the repository
git clone https://github.com/<your-username>/markview.git
cd markview

# Run in development mode (compiles Rust backend + opens the app window)
cargo tauri dev

# Build a production release installer
cargo tauri build
```

The production installer will be output to `src-tauri/target/release/bundle/`.

## Usage

1. Click the **+** button in the sidebar header to add a catalog folder containing markdown files.
2. Browse the file tree and click any `.md` file to render it in the content pane.
3. Use the search box above the file tree to filter by filename.
4. Toggle dark mode with the moon icon button.

## Privacy

All data stays on your machine. MarkView stores a small config file (catalog folder paths, sidebar width, dark mode preference) in the OS app data directory -- nothing is included in the source code or sent externally. Your folder paths and file contents are never part of the repository.

## Project Structure

```
markview/
├── ui/                          # Frontend (plain HTML/CSS/JS)
│   ├── index.html
│   ├── styles.css
│   └── app.js
├── src-tauri/                   # Tauri / Rust backend
│   ├── src/
│   │   ├── main.rs              # Desktop entry point
│   │   ├── lib.rs               # Tauri builder + command registration
│   │   ├── commands.rs          # All Tauri command handlers
│   │   ├── config.rs            # Config persistence (JSON in app data dir)
│   │   ├── scanner.rs           # Directory tree scanning (walkdir)
│   │   └── markdown.rs          # Markdown-to-HTML conversion (pulldown-cmark)
│   ├── tauri.conf.json          # Tauri configuration
│   ├── capabilities/default.json
│   └── Cargo.toml
└── README.md
```

## License

This project is provided as-is. See the repository for license details.
