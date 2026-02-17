// ============================================
// Global State
// ============================================
const { invoke } = window.__TAURI__.core;

let appConfig = null;
let currentTree = null;
let activeFileElement = null;
let darkModeEnabled = false;
let currentFilePath = null;
const scrollPositions = new Map();
const MAX_SCROLL_ENTRIES = 50;

// Markdown render cache — avoids re-invoking IPC for recently viewed files
const renderCache = new Map();
const MAX_CACHE_ENTRIES = 20;

// Keyboard navigation
let keyboardFocusIndex = -1;
let treeItems = [];  // pre-filtered visible items — updated by updateTreeItems()

// Search debounce
let searchTimeout = null;

// ============================================
// Initialization
// ============================================
document.addEventListener("DOMContentLoaded", async () => {
    await loadConfig();
    setupResizer();
    setupEventListeners();
});

async function loadConfig() {
    try {
        appConfig = await invoke("get_config");
        applySidebarWidth(appConfig.sidebar_width);

        darkModeEnabled = appConfig.dark_mode || false;
        applyDarkMode(darkModeEnabled);

        renderCatalogList();

        if (
            appConfig.last_selected !== null &&
            appConfig.last_selected !== undefined &&
            appConfig.catalogs.length > 0
        ) {
            const idx = Math.min(appConfig.last_selected, appConfig.catalogs.length - 1);
            await selectCatalog(idx);
        }
    } catch (err) {
        console.error("Failed to load config:", err);
    }
}

// ============================================
// Event Listeners
// ============================================
function setupEventListeners() {
    document.getElementById("add-catalog-btn").addEventListener("click", addCatalog);
    document.getElementById("dark-mode-btn").addEventListener("click", toggleDarkMode);
    document.getElementById("refresh-tree-btn").addEventListener("click", refreshTree);

    document.getElementById("tree-search").addEventListener("input", (e) => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => filterTree(e.target.value), 150);
    });

    document.addEventListener("keydown", handleKeyboardNavigation);

    // Single delegated click listener for markdown links (avoids listener stacking)
    document.getElementById("markdown-body").addEventListener("click", handleMarkdownClick);
}

// ============================================
// Dark Mode
// ============================================
function applyDarkMode(enabled) {
    if (enabled) {
        document.documentElement.classList.add("dark");
    } else {
        document.documentElement.classList.remove("dark");
    }
    const btn = document.getElementById("dark-mode-btn");
    if (btn) {
        btn.textContent = enabled ? "\u2600" : "\u263E";
        btn.title = enabled ? "Switch to light mode" : "Switch to dark mode";
    }
}

async function toggleDarkMode() {
    darkModeEnabled = !darkModeEnabled;
    applyDarkMode(darkModeEnabled);
    try {
        await invoke("set_dark_mode", { enabled: darkModeEnabled });
    } catch (err) {
        console.error("Failed to save dark mode preference:", err);
    }
}

// ============================================
// Catalog Management
// ============================================
async function addCatalog() {
    try {
        const folderPath = await invoke("pick_folder");
        if (!folderPath) return;

        const parts = folderPath.replace(/\\/g, "/").split("/");
        const defaultName = parts[parts.length - 1] || folderPath;

        const name = prompt("Display name for this catalog:", defaultName);
        if (!name) return;

        appConfig = await invoke("add_catalog", { name, path: folderPath });
        renderCatalogList();
        await selectCatalog(appConfig.catalogs.length - 1);
    } catch (err) {
        console.error("Failed to add catalog:", err);
    }
}

async function removeCatalog(index, event) {
    event.stopPropagation();
    try {
        appConfig = await invoke("remove_catalog", { index });
        renderCatalogList();

        if (appConfig.last_selected === null || appConfig.catalogs.length === 0) {
            clearTree();
            clearContent();
        } else {
            await selectCatalog(appConfig.last_selected);
        }
    } catch (err) {
        console.error("Failed to remove catalog:", err);
    }
}

function renderCatalogList() {
    const list = document.getElementById("catalog-list");
    list.replaceChildren();

    if (appConfig.catalogs.length === 0) {
        list.innerHTML = `
            <div id="empty-state">
                <p>Add a folder to get started</p>
                <button id="empty-state-btn" title="Add catalog folder">+</button>
            </div>`;
        document.getElementById("empty-state-btn").addEventListener("click", addCatalog);
        return;
    }

    appConfig.catalogs.forEach((catalog, index) => {
        const li = document.createElement("li");
        if (appConfig.last_selected === index) {
            li.classList.add("active");
        }

        const nameSpan = document.createElement("span");
        nameSpan.className = "catalog-name";
        nameSpan.textContent = catalog.name;
        nameSpan.title = catalog.path;
        nameSpan.addEventListener("dblclick", (e) => {
            e.stopPropagation();
            startCatalogRename(index, nameSpan, catalog.name);
        });
        li.appendChild(nameSpan);

        const removeBtn = document.createElement("button");
        removeBtn.className = "remove-btn";
        removeBtn.textContent = "\u00D7";
        removeBtn.title = "Remove catalog";
        removeBtn.addEventListener("click", (e) => removeCatalog(index, e));
        li.appendChild(removeBtn);

        li.addEventListener("click", () => selectCatalog(index));
        list.appendChild(li);
    });

    // Defer file count fetches to avoid blocking initial render
    (window.requestIdleCallback || setTimeout)(() => updateFileCounts());
}

// Lightweight selection update — no full re-render
function updateCatalogSelection(index) {
    const items = document.querySelectorAll("#catalog-list li");
    items.forEach((li, i) => {
        li.classList.toggle("active", i === index);
    });
}

// ============================================
// Catalog Rename
// ============================================
function startCatalogRename(index, nameSpan, currentName) {
    const input = document.createElement("input");
    input.type = "text";
    input.className = "catalog-name-input";
    input.value = currentName;

    const parent = nameSpan.parentElement;
    parent.replaceChild(input, nameSpan);
    input.focus();
    input.select();

    let finished = false;
    const finishRename = async (save) => {
        if (finished) return;
        finished = true;

        if (save && input.value.trim() && input.value.trim() !== currentName) {
            try {
                appConfig = await invoke("rename_catalog", {
                    index,
                    newName: input.value.trim(),
                });
            } catch (err) {
                console.error("Failed to rename catalog:", err);
            }
        }
        renderCatalogList();
    };

    input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
            e.preventDefault();
            finishRename(true);
        } else if (e.key === "Escape") {
            e.preventDefault();
            finishRename(false);
        }
    });

    input.addEventListener("blur", () => finishRename(true));
}

// ============================================
// File Count Badge (parallel requests)
// ============================================
async function updateFileCounts() {
    const listItems = document.querySelectorAll("#catalog-list li");

    const promises = appConfig.catalogs.map((catalog, i) =>
        invoke("count_markdown_files", { rootPath: catalog.path })
            .then(count => ({ i, count }))
            .catch(err => {
                console.warn(`File count failed for "${catalog.name}":`, err);
                return null;
            })
    );

    const results = await Promise.all(promises);

    for (const result of results) {
        if (!result || !listItems[result.i]) continue;
        let badge = listItems[result.i].querySelector(".catalog-file-count");
        if (!badge) {
            badge = document.createElement("span");
            badge.className = "catalog-file-count";
            const removeBtn = listItems[result.i].querySelector(".remove-btn");
            listItems[result.i].insertBefore(badge, removeBtn);
        }
        badge.textContent = result.count;
    }
}

// ============================================
// Catalog Selection & Tree Scanning
// ============================================
async function selectCatalog(index) {
    if (index < 0 || index >= appConfig.catalogs.length) return;

    appConfig.last_selected = index;
    await invoke("set_last_selected", { index });

    // Lightweight update — just toggle .active class, no full rebuild
    updateCatalogSelection(index);

    const catalog = appConfig.catalogs[index];
    try {
        currentTree = await invoke("scan_directory", { rootPath: catalog.path });
        renderTree(currentTree);
    } catch (err) {
        console.error("Failed to scan directory:", err);
        const errStr = String(err);
        if (errStr.includes("not a directory") || errStr.includes("No such file")) {
            document.getElementById("tree-container").innerHTML = `
                <div class="tree-warning">
                    <p>This folder no longer exists or is inaccessible.</p>
                    <p style="font-size:11px;word-break:break-all;margin-top:4px;">${escapeHtml(catalog.path)}</p>
                    <button id="remove-missing-btn">Remove catalog</button>
                </div>`;
            document.getElementById("remove-missing-btn").addEventListener("click", () => {
                removeCatalog(index, new Event("click"));
            });
        } else {
            document.getElementById("tree-container").innerHTML =
                '<p class="tree-warning">Failed to scan directory.</p>';
        }
    }
}

async function refreshTree() {
    if (appConfig.last_selected === null || appConfig.last_selected === undefined) return;
    const catalog = appConfig.catalogs[appConfig.last_selected];
    if (!catalog) return;

    // Clear render cache so refreshed files get re-rendered
    renderCache.clear();

    try {
        currentTree = await invoke("scan_directory", { rootPath: catalog.path });
        renderTree(currentTree);
    } catch (err) {
        console.error("Failed to refresh tree:", err);
        document.getElementById("tree-container").innerHTML =
            '<div class="tree-warning"><p>Failed to refresh. Directory may have been removed.</p></div>';
    }
}

// ============================================
// Directory Tree Rendering
// ============================================
function renderTree(nodes) {
    const searchInput = document.getElementById("tree-search");
    if (searchInput) searchInput.value = "";

    const container = document.getElementById("tree-container");
    container.replaceChildren();

    if (!nodes || nodes.length === 0) {
        container.innerHTML = '<p class="tree-empty">No markdown files found.</p>';
        return;
    }

    const ul = buildTreeUl(nodes);
    container.appendChild(ul);
    updateTreeItems();
}

function buildTreeUl(nodes) {
    const ul = document.createElement("ul");
    const fragment = document.createDocumentFragment();

    for (const node of nodes) {
        if (node.type === "directory") {
            const li = document.createElement("li");
            li.className = "tree-folder";
            li.textContent = node.name;
            li.addEventListener("click", (e) => {
                e.stopPropagation();
                li.classList.toggle("open");
            });
            fragment.appendChild(li);

            const childUl = buildTreeUl(node.children);
            fragment.appendChild(childUl);
        } else if (node.type === "file") {
            const li = document.createElement("li");
            li.className = "tree-file";
            li.textContent = node.name;
            li._filePath = node.path;
            li.addEventListener("click", (e) => {
                e.stopPropagation();
                openMarkdownFile(node.path, li);
            });
            fragment.appendChild(li);
        }
    }

    ul.appendChild(fragment);
    return ul;
}

function clearTree() {
    document.getElementById("tree-container").replaceChildren();
    currentTree = null;
    activeFileElement = null;
}

// ============================================
// Tree Search / Filter
// ============================================
function filterTree(query) {
    const container = document.getElementById("tree-container");
    const allFiles = container.querySelectorAll(".tree-file");
    const allFolders = container.querySelectorAll(".tree-folder");

    if (!query.trim()) {
        allFiles.forEach(el => el.style.display = "");
        allFolders.forEach(el => el.style.display = "");
        updateTreeItems();
        return;
    }

    const lowerQuery = query.toLowerCase();

    allFiles.forEach(el => el.style.display = "none");
    allFolders.forEach(el => el.style.display = "none");

    allFiles.forEach(fileEl => {
        const fileName = fileEl.textContent.toLowerCase();
        if (fileName.includes(lowerQuery)) {
            fileEl.style.display = "";
            let parent = fileEl.parentElement;
            while (parent && parent.id !== "tree-container") {
                if (parent.tagName === "UL") {
                    parent.style.display = "";
                    const prevSibling = parent.previousElementSibling;
                    if (prevSibling && prevSibling.classList.contains("tree-folder")) {
                        prevSibling.style.display = "";
                        prevSibling.classList.add("open");
                    }
                }
                parent = parent.parentElement;
            }
        }
    });

    updateTreeItems();
}

// ============================================
// Keyboard Navigation
// ============================================
function updateTreeItems() {
    const container = document.getElementById("tree-container");
    treeItems = Array.from(container.querySelectorAll(".tree-file, .tree-folder"))
        .filter(el => el.style.display !== "none");
    keyboardFocusIndex = -1;
    clearKeyboardFocus();
}

function handleKeyboardNavigation(e) {
    const activeEl = document.activeElement;
    const isSearchFocused = activeEl && activeEl.id === "tree-search";

    if (e.key === "Escape" && isSearchFocused) {
        activeEl.value = "";
        filterTree("");
        activeEl.blur();
        return;
    }

    if (activeEl && (activeEl.tagName === "INPUT" || activeEl.tagName === "TEXTAREA")) return;
    if (treeItems.length === 0) return;

    // treeItems is already pre-filtered by updateTreeItems() — no per-keypress recomputation
    if (e.key === "ArrowDown") {
        e.preventDefault();
        keyboardFocusIndex = Math.min(keyboardFocusIndex + 1, treeItems.length - 1);
        setKeyboardFocus(treeItems[keyboardFocusIndex]);
    } else if (e.key === "ArrowUp") {
        e.preventDefault();
        keyboardFocusIndex = Math.max(keyboardFocusIndex - 1, 0);
        setKeyboardFocus(treeItems[keyboardFocusIndex]);
    } else if (e.key === "Enter" && keyboardFocusIndex >= 0) {
        e.preventDefault();
        const focused = treeItems[keyboardFocusIndex];
        if (focused) focused.click();
    } else if (e.key === "Escape") {
        clearKeyboardFocus();
    }
}

function setKeyboardFocus(element) {
    clearKeyboardFocus();
    if (element) {
        element.classList.add("keyboard-focus");
        element.scrollIntoView({ block: "nearest" });
    }
}

function clearKeyboardFocus() {
    document.querySelectorAll(".keyboard-focus").forEach(el => {
        el.classList.remove("keyboard-focus");
    });
}

// ============================================
// Markdown Rendering
// ============================================
async function openMarkdownFile(filePath, element) {
    // Save scroll position of current file
    saveScrollPosition();

    if (activeFileElement) {
        activeFileElement.classList.remove("active");
    }
    activeFileElement = element;
    element.classList.add("active");
    currentFilePath = filePath;

    updateBreadcrumb(filePath);

    try {
        // Use cached HTML if available, otherwise fetch and cache
        let html = renderCache.get(filePath);
        if (!html) {
            html = await invoke("render_markdown", { filePath });
            renderCache.set(filePath, html);
            // LRU eviction
            if (renderCache.size > MAX_CACHE_ENTRIES) {
                renderCache.delete(renderCache.keys().next().value);
            }
        }

        const body = document.getElementById("markdown-body");
        body.innerHTML = html;

        // Trigger fade-in via double-rAF (avoids forced reflow)
        body.classList.remove("fade-in");
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                body.classList.add("fade-in");
            });
        });

        // Restore scroll position if previously viewed
        const savedScroll = scrollPositions.get(filePath);
        if (savedScroll !== undefined) {
            requestAnimationFrame(() => {
                body.scrollTop = savedScroll;
            });
        }
    } catch (err) {
        console.error("Failed to render markdown:", err);
        document.getElementById("markdown-body").innerHTML =
            '<p style="color:var(--text-error);">Failed to render file.</p>';
    }
}

// Single delegated handler for all markdown link clicks
function handleMarkdownClick(e) {
    const link = e.target.closest("a");
    if (!link) return;

    const href = link.getAttribute("href");
    if (!href) return;

    e.preventDefault();

    // Anchor link — scroll to heading within current document
    if (href.startsWith("#")) {
        const targetId = href.slice(1);
        const container = document.getElementById("markdown-body");
        const target = container.querySelector(`[id="${CSS.escape(targetId)}"]`);
        if (target) {
            target.scrollIntoView({ behavior: "smooth", block: "start" });
        }
        return;
    }

    // Relative .md link — resolve and open
    if (currentFilePath && (href.endsWith(".md") || href.includes(".md#"))) {
        const [mdPath, anchor] = href.split("#");
        const currentDir = currentFilePath.replace(/\\/g, "/").replace(/\/[^/]*$/, "");
        const resolved = resolveRelativePath(currentDir, mdPath.replace(/\\/g, "/"));
        openResolvedMarkdownFile(resolved, anchor);
        return;
    }

    // External link — do nothing in Tauri webview
}

function resolveRelativePath(base, relative) {
    if (relative.match(/^[a-zA-Z]:\//)) return relative;
    if (relative.startsWith("/")) return relative;

    const parts = base.split("/");
    const relParts = relative.split("/");

    for (const part of relParts) {
        if (part === "..") {
            parts.pop();
        } else if (part !== ".") {
            parts.push(part);
        }
    }

    return parts.join("/");
}

async function openResolvedMarkdownFile(filePath, anchor) {
    const normalizedPath = filePath.replace(/\//g, "\\");

    try {
        // Use cached HTML if available
        let html = renderCache.get(normalizedPath);
        if (!html) {
            html = await invoke("render_markdown", { filePath: normalizedPath });
            renderCache.set(normalizedPath, html);
            if (renderCache.size > MAX_CACHE_ENTRIES) {
                renderCache.delete(renderCache.keys().next().value);
            }
        }
        saveScrollPosition();

        currentFilePath = normalizedPath;
        updateBreadcrumb(normalizedPath);

        // Highlight matching tree item if visible
        if (activeFileElement) {
            activeFileElement.classList.remove("active");
            activeFileElement = null;
        }
        const treeFiles = document.querySelectorAll(".tree-file");
        for (const el of treeFiles) {
            if (el._filePath === normalizedPath) {
                el.classList.add("active");
                activeFileElement = el;
                el.scrollIntoView({ block: "nearest" });
                break;
            }
        }

        const body = document.getElementById("markdown-body");
        body.innerHTML = html;

        body.classList.remove("fade-in");
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                body.classList.add("fade-in");
            });
        });

        // Scroll to anchor if present
        if (anchor) {
            requestAnimationFrame(() => {
                const target = body.querySelector(`[id="${CSS.escape(anchor)}"]`);
                if (target) {
                    target.scrollIntoView({ behavior: "smooth", block: "start" });
                }
            });
        }
    } catch (err) {
        console.error("Failed to open linked markdown file:", err);
        document.getElementById("markdown-body").innerHTML =
            `<p style="color:var(--text-error);">Could not open linked file: ${escapeHtml(filePath)}</p>`;
    }
}

function saveScrollPosition() {
    if (currentFilePath) {
        const body = document.getElementById("markdown-body");
        scrollPositions.set(currentFilePath, body.scrollTop);

        // LRU eviction — keep map bounded
        if (scrollPositions.size > MAX_SCROLL_ENTRIES) {
            const oldest = scrollPositions.keys().next().value;
            scrollPositions.delete(oldest);
        }
    }
}

function clearContent() {
    document.getElementById("markdown-body").innerHTML =
        '<div id="welcome-message"><h1>MarkView</h1><p>Select a catalog and open a markdown file to begin.</p></div>';
    document.getElementById("breadcrumb-path").innerHTML = "";
    if (activeFileElement) {
        activeFileElement.classList.remove("active");
        activeFileElement = null;
    }
    currentFilePath = null;
}

// ============================================
// Breadcrumb
// ============================================
function updateBreadcrumb(filePath) {
    const breadcrumb = document.getElementById("breadcrumb-path");
    breadcrumb.replaceChildren();

    let displayPath = filePath;
    if (appConfig.last_selected !== null && appConfig.last_selected !== undefined) {
        const catalog = appConfig.catalogs[appConfig.last_selected];
        if (catalog) {
            const catalogPath = catalog.path.replace(/\\/g, "/");
            const normalizedFile = filePath.replace(/\\/g, "/");
            if (normalizedFile.startsWith(catalogPath)) {
                displayPath = catalog.name + normalizedFile.slice(catalogPath.length);
            }
        }
    }

    const parts = displayPath.replace(/\\/g, "/").split("/");
    parts.forEach((part, i) => {
        if (i > 0) {
            const sep = document.createElement("span");
            sep.className = "breadcrumb-separator";
            sep.textContent = "/";
            breadcrumb.appendChild(sep);
        }
        const seg = document.createElement("span");
        seg.className = "breadcrumb-segment";
        seg.textContent = part;
        breadcrumb.appendChild(seg);
    });
}

// ============================================
// Resizer
// ============================================
function setupResizer() {
    const resizer = document.getElementById("resizer");
    const sidebar = document.getElementById("sidebar");
    let isResizing = false;
    let rafPending = false;

    resizer.addEventListener("mousedown", (e) => {
        isResizing = true;
        document.body.style.cursor = "col-resize";
        document.body.style.userSelect = "none";
        e.preventDefault();
    });

    document.addEventListener("mousemove", (e) => {
        if (!isResizing || rafPending) return;
        rafPending = true;
        requestAnimationFrame(() => {
            const newWidth = Math.max(200, Math.min(500, e.clientX));
            sidebar.style.width = newWidth + "px";
            rafPending = false;
        });
    });

    document.addEventListener("mouseup", async () => {
        if (!isResizing) return;
        isResizing = false;
        document.body.style.cursor = "";
        document.body.style.userSelect = "";

        const width = parseInt(sidebar.style.width, 10) || 300;
        try {
            await invoke("set_sidebar_width", { width });
        } catch (err) {
            console.error("Failed to save sidebar width:", err);
        }
    });
}

function applySidebarWidth(width) {
    const sidebar = document.getElementById("sidebar");
    sidebar.style.transition = "width 0.3s ease";
    sidebar.style.width = Math.max(200, Math.min(500, width)) + "px";
    setTimeout(() => {
        sidebar.style.transition = "";
    }, 300);
}

// ============================================
// Utilities
// ============================================
function escapeHtml(text) {
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}
