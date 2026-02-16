// ============================================
// Global State
// ============================================
const { invoke } = window.__TAURI__.core;

let appConfig = null;
let currentTree = null;
let activeFileElement = null;

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
    list.innerHTML = "";

    if (appConfig.catalogs.length === 0) {
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
}

async function selectCatalog(index) {
    if (index < 0 || index >= appConfig.catalogs.length) return;

    appConfig.last_selected = index;
    await invoke("set_last_selected", { index });
    renderCatalogList();

    const catalog = appConfig.catalogs[index];
    try {
        currentTree = await invoke("scan_directory", { rootPath: catalog.path });
        renderTree(currentTree);
    } catch (err) {
        console.error("Failed to scan directory:", err);
        document.getElementById("tree-container").innerHTML =
            '<p class="tree-empty">Failed to scan directory.</p>';
    }
}

// ============================================
// Directory Tree Rendering
// ============================================
function renderTree(nodes) {
    const container = document.getElementById("tree-container");
    container.innerHTML = "";

    if (!nodes || nodes.length === 0) {
        container.innerHTML = '<p class="tree-empty">No markdown files found.</p>';
        return;
    }

    const ul = buildTreeUl(nodes);
    container.appendChild(ul);
}

function buildTreeUl(nodes) {
    const ul = document.createElement("ul");

    for (const node of nodes) {
        if (node.type === "directory") {
            const li = document.createElement("li");
            li.className = "tree-folder open";
            li.textContent = node.name;
            li.addEventListener("click", (e) => {
                e.stopPropagation();
                li.classList.toggle("open");
            });
            ul.appendChild(li);

            const childUl = buildTreeUl(node.children);
            ul.appendChild(childUl);
        } else if (node.type === "file") {
            const li = document.createElement("li");
            li.className = "tree-file";
            li.textContent = node.name;
            li.addEventListener("click", (e) => {
                e.stopPropagation();
                openMarkdownFile(node.path, li);
            });
            ul.appendChild(li);
        }
    }

    return ul;
}

function clearTree() {
    document.getElementById("tree-container").innerHTML = "";
    currentTree = null;
    activeFileElement = null;
}

// ============================================
// Markdown Rendering
// ============================================
async function openMarkdownFile(filePath, element) {
    if (activeFileElement) {
        activeFileElement.classList.remove("active");
    }
    activeFileElement = element;
    element.classList.add("active");

    const parts = filePath.replace(/\\/g, "/").split("/");
    document.getElementById("current-file-name").textContent = parts[parts.length - 1];

    try {
        const html = await invoke("render_markdown", { filePath });
        document.getElementById("markdown-body").innerHTML = html;
    } catch (err) {
        console.error("Failed to render markdown:", err);
        document.getElementById("markdown-body").innerHTML =
            '<p style="color:#e53935;">Failed to render file.</p>';
    }
}

function clearContent() {
    document.getElementById("markdown-body").innerHTML =
        '<div id="welcome-message"><h1>MarkView</h1><p>Select a catalog and open a markdown file to begin.</p></div>';
    document.getElementById("current-file-name").textContent = "";
    if (activeFileElement) {
        activeFileElement.classList.remove("active");
        activeFileElement = null;
    }
}

// ============================================
// Resizer
// ============================================
function setupResizer() {
    const resizer = document.getElementById("resizer");
    const sidebar = document.getElementById("sidebar");
    let isResizing = false;

    resizer.addEventListener("mousedown", (e) => {
        isResizing = true;
        document.body.style.cursor = "col-resize";
        document.body.style.userSelect = "none";
        e.preventDefault();
    });

    document.addEventListener("mousemove", (e) => {
        if (!isResizing) return;
        const newWidth = Math.max(200, Math.min(500, e.clientX));
        sidebar.style.width = newWidth + "px";
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
    sidebar.style.width = Math.max(200, Math.min(500, width)) + "px";
}
