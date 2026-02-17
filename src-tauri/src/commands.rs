use crate::config::{self, AppConfig, CatalogEntry};
use crate::scanner;
use std::path::PathBuf;
use std::sync::Mutex;
use tauri_plugin_dialog::DialogExt;

#[tauri::command]
pub fn get_config(state: tauri::State<'_, Mutex<AppConfig>>) -> Result<AppConfig, String> {
    let cfg = state.lock().map_err(|e| e.to_string())?;
    Ok(cfg.clone())
}

#[tauri::command]
pub fn save_config(
    state: tauri::State<'_, Mutex<AppConfig>>,
    data_dir: tauri::State<'_, PathBuf>,
    config: AppConfig,
) -> Result<(), String> {
    let mut cfg = state.lock().map_err(|e| e.to_string())?;
    *cfg = config;
    config::save_config(&data_dir, &cfg)
}

#[tauri::command]
pub async fn pick_folder(app: tauri::AppHandle) -> Result<Option<String>, String> {
    let folder = app.dialog().file().blocking_pick_folder();
    match folder {
        Some(file_path) => Ok(Some(file_path.to_string())),
        None => Ok(None),
    }
}

#[tauri::command]
pub fn add_catalog(
    state: tauri::State<'_, Mutex<AppConfig>>,
    data_dir: tauri::State<'_, PathBuf>,
    name: String,
    path: String,
) -> Result<AppConfig, String> {
    let mut cfg = state.lock().map_err(|e| e.to_string())?;
    cfg.catalogs.push(CatalogEntry { name, path });
    cfg.last_selected = Some(cfg.catalogs.len() - 1);
    config::save_config(&data_dir, &cfg)?;
    Ok(cfg.clone())
}

#[tauri::command]
pub fn remove_catalog(
    state: tauri::State<'_, Mutex<AppConfig>>,
    data_dir: tauri::State<'_, PathBuf>,
    index: usize,
) -> Result<AppConfig, String> {
    let mut cfg = state.lock().map_err(|e| e.to_string())?;
    if index >= cfg.catalogs.len() {
        return Err(format!("Index {} out of range", index));
    }
    cfg.catalogs.remove(index);
    if let Some(selected) = cfg.last_selected {
        if selected >= cfg.catalogs.len() {
            cfg.last_selected = if cfg.catalogs.is_empty() {
                None
            } else {
                Some(0)
            };
        }
    }
    config::save_config(&data_dir, &cfg)?;
    Ok(cfg.clone())
}

#[tauri::command]
pub async fn scan_directory(root_path: String) -> Result<Vec<scanner::TreeNode>, String> {
    scanner::scan_directory(&root_path)
}

#[tauri::command]
pub async fn render_markdown(file_path: String) -> Result<String, String> {
    crate::markdown::render_markdown(&file_path)
}

#[tauri::command]
pub fn set_last_selected(
    state: tauri::State<'_, Mutex<AppConfig>>,
    data_dir: tauri::State<'_, PathBuf>,
    index: Option<usize>,
) -> Result<(), String> {
    let mut cfg = state.lock().map_err(|e| e.to_string())?;
    cfg.last_selected = index;
    config::save_config(&data_dir, &cfg)
}

#[tauri::command]
pub fn set_sidebar_width(
    state: tauri::State<'_, Mutex<AppConfig>>,
    data_dir: tauri::State<'_, PathBuf>,
    width: f64,
) -> Result<(), String> {
    let mut cfg = state.lock().map_err(|e| e.to_string())?;
    cfg.sidebar_width = width;
    config::save_config(&data_dir, &cfg)
}

#[tauri::command]
pub fn set_dark_mode(
    state: tauri::State<'_, Mutex<AppConfig>>,
    data_dir: tauri::State<'_, PathBuf>,
    enabled: bool,
) -> Result<(), String> {
    let mut cfg = state.lock().map_err(|e| e.to_string())?;
    cfg.dark_mode = enabled;
    config::save_config(&data_dir, &cfg)
}

#[tauri::command]
pub fn rename_catalog(
    state: tauri::State<'_, Mutex<AppConfig>>,
    data_dir: tauri::State<'_, PathBuf>,
    index: usize,
    new_name: String,
) -> Result<AppConfig, String> {
    let mut cfg = state.lock().map_err(|e| e.to_string())?;
    if index >= cfg.catalogs.len() {
        return Err(format!("Index {} out of range", index));
    }
    cfg.catalogs[index].name = new_name;
    config::save_config(&data_dir, &cfg)?;
    Ok(cfg.clone())
}

#[tauri::command]
pub async fn count_markdown_files(root_path: String) -> Result<usize, String> {
    scanner::count_markdown_files(&root_path)
}
